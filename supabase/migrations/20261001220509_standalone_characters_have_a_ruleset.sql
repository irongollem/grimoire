-- A character with no campaign (#729/#730) could not be created at all.
--
-- Fifteen functions resolved a character's ruleset by joining it to its
-- campaign: party_members -> campaigns on campaign_id. A standalone character
-- has campaign_id null, so that join returns no row, and each function failed
-- in whichever way its own shape dictated:
--
--   * `into strict` raised P0002 "query returned no rows". That is
--     validate_character_class_definition, the BEFORE INSERT trigger on
--     character_classes, so "Begin my adventure" got a 201 for the member row
--     and a 500 for the class row, and the client rolled the character back.
--     required_level_up_spell_choices would have done the same at level 2.
--   * a plain `into` left v_ruleset NULL, so `if v_ruleset <> '2024'` was NULL
--     and never fired (activate_innate_sorcery, restore_sorcery_points,
--     take_spellcasting_rest, cast_character_spell_v4,
--     guard_revised_preparation_change).
--   * a join in a set-returning query silently returned nothing, which only
--     looked right because class_spellcasting_policies has no 2014 rows.
--   * validate_character_subclass_definition refused every custom subclass.
--
-- The ruleset of a character now has exactly one reader,
-- private.party_member_ruleset(). It is total: the campaign's ruleset when the
-- character is in one, otherwise '2014', the same default the client applies
-- in normalizeRuleset(). When a standalone character can choose its own
-- ruleset, this function is the only body that changes.
--
-- Nothing else in any of the fifteen bodies changes. The function bodies below
-- were taken from pg_get_functiondef() on production (identical to a local
-- replay, checked by hash) and edited only where they read the ruleset.
-- required_level_up_spell_choices keeps raising P0002 for a member that does
-- not exist, which `into strict` used to do as a side effect.

create function private.party_member_ruleset(p_party_member_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select c.ruleset
       from public.party_members pm
       join public.campaigns c on c.id = pm.campaign_id
      where pm.id = p_party_member_id),
    '2014');
$$;

comment on function private.party_member_ruleset(uuid) is
  'The ruleset a character plays under: its campaign''s, or 2014 when it has no campaign. The only place that resolves it; never join party_members to campaigns for a ruleset.';

-- Called only from inside definer functions, which run as their owner.
revoke execute on function private.party_member_ruleset(uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.activate_innate_sorcery(p_party_member_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_member public.party_members%rowtype;
  v_level integer;
  v_ruleset text;
  v_resources jsonb;
  v_choices jsonb;
  v_uses integer;
  v_points integer;
begin
  select * into v_member from public.party_members where id = p_party_member_id for update;
  if not found then raise exception 'Party member not found'; end if;
  if not coalesce((v_member.user_id = (select auth.uid()) or v_member.owner_user_id = (select auth.uid())
    or private.is_campaign_dm(v_member.campaign_id)
    or exists (select 1 from public.campaign_members cm where cm.user_id = (select auth.uid()) and cm.party_member_id = v_member.id)), false)
  then raise exception 'Access denied'; end if;
  v_ruleset := private.party_member_ruleset(v_member.id);
  v_level := public.sorcerer_level(v_member);
  if v_ruleset <> '2024' or v_level < 1 then raise exception 'Innate Sorcery requires a 2024 Sorcerer'; end if;

  v_resources := coalesce(v_member.class_resources, '{}'::jsonb);
  v_choices := coalesce(v_member.class_choices, '{}'::jsonb);
  v_uses := coalesce((v_resources #>> '{innate_sorcery,current}')::integer, 0);
  v_points := coalesce((v_resources #>> '{sorcery_points,current}')::integer, 0);
  if v_uses > 0 then
    v_resources := jsonb_set(v_resources, '{innate_sorcery,current}', to_jsonb(v_uses - 1), false);
  elsif v_level >= 7 and v_points >= 2 then
    v_resources := jsonb_set(v_resources, '{sorcery_points,current}', to_jsonb(v_points - 2), false);
  else
    raise exception 'No Innate Sorcery use remains';
  end if;
  v_choices := jsonb_set(jsonb_set(v_choices, '{innate_sorcery_active}', 'true'::jsonb, true),
    '{innate_sorcery_expires_at}', to_jsonb((now() + interval '1 minute')::text), true);
  update public.party_members set class_resources = v_resources, class_choices = v_choices where id = v_member.id;
  return jsonb_build_object('class_resources', v_resources, 'class_choices', v_choices);
end;
$function$;

CREATE OR REPLACE FUNCTION public.cast_character_spell_v4(p_party_member_id uuid, p_slot_level integer, p_slot_pool text, p_slot_template jsonb DEFAULT NULL::jsonb, p_concentration_state jsonb DEFAULT NULL::jsonb, p_metamagic_names text[] DEFAULT '{}'::text[], p_character_spell_id uuid DEFAULT NULL::uuid, p_metamagic_choices jsonb DEFAULT '{}'::jsonb, p_parent_cast_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_member public.party_members%rowtype;
  v_grant public.character_spells%rowtype;
  v_class public.character_classes%rowtype;
  v_parent public.spell_cast_records%rowtype;
  v_option public.metamagic_options%rowtype;
  v_spell record;
  v_ruleset text;
  v_turn_key text;
  v_class_name text;
  v_caster_type text;
  v_ritual_style text;
  v_ready boolean;
  v_method text;
  v_cast_id uuid;
  v_choices jsonb;
  v_resources jsonb;
  v_slots jsonb;
  v_concentration jsonb;
  v_sorcerer_level integer;
  v_innate_active boolean := false;
  v_metamagic_count integer;
  v_eff_slot_level integer;
  v_reactive boolean := false;
  v_quickened boolean := false;
  v_known boolean;
  v_cost integer;
  v_sp_total integer := 0;
  v_sp_current integer;
  v_limit integer := 1;
  v_free_used boolean := false;
  v_name text;
  v_damage_type text;
  v_original_type boolean;
  v_result jsonb;
begin
  if p_slot_level < 0 or p_slot_level > 9 then raise exception 'Invalid cast level'; end if;
  select * into v_member from public.party_members where id = p_party_member_id for update;
  if not found then raise exception 'Party member not found'; end if;
  if not coalesce((v_member.user_id = (select auth.uid()) or v_member.owner_user_id = (select auth.uid())
    or private.is_campaign_dm(v_member.campaign_id)
    or exists (select 1 from public.campaign_members cm
      where cm.user_id = (select auth.uid()) and cm.party_member_id = v_member.id)), false)
  then raise exception 'Access denied'; end if;
  if p_character_spell_id is null then raise exception 'Casting requires an exact character spell'; end if;
  if jsonb_typeof(coalesce(p_metamagic_choices, '{}'::jsonb)) <> 'object' then
    raise exception 'Invalid Metamagic choices';
  end if;

  select * into v_grant from public.character_spells
    where id = p_character_spell_id and party_member_id = p_party_member_id for update;
  if not found then raise exception 'Character spell not found'; end if;
  select * into v_spell from (
    select id::text as id, name, level, ritual, attack_type, range, duration, casting_time,
      damage_rolls, higher_levels, target_description
    from public.spells where id::text = v_grant.spell_id
    union all
    select id, name, level, ritual, attack_type, range, duration, casting_time,
      damage_rolls, higher_levels, target_description
    from public.library_spells where id = v_grant.spell_id
  ) resolved_spell limit 1;
  if not found then raise exception 'Spell content version not found'; end if;

  v_ruleset := private.party_member_ruleset(v_member.id);
  v_turn_key := private.active_turn_key(v_member.campaign_id);
  v_sorcerer_level := public.sorcerer_level(v_member);
  v_choices := coalesce(v_member.class_choices, '{}'::jsonb);
  v_resources := coalesce(v_member.class_resources, '{}'::jsonb);
  v_metamagic_count := coalesce(array_length(p_metamagic_names, 1), 0);

  if v_grant.source_type = 'class' then
    select cc.* into v_class from public.character_classes cc
      where cc.id = v_grant.source_class_id and cc.party_member_id = p_party_member_id;
    v_class_name := v_class.class_name;
    if v_class_name is null then raise exception 'Class casting requires an exact source class'; end if;
    if v_ruleset = '2024' and coalesce(v_class.class_definition_kind, 'system') = 'system' then
      select caster_type into v_caster_type from public.class_spellcasting_policies
        where ruleset = v_ruleset and class_name = v_class_name;
    end if;
    if v_caster_type is null then
      select caster_type into v_caster_type from public.system_classes
        where class_name = v_class_name
          and (v_class.class_definition_id is null or id = v_class.class_definition_id)
          and coalesce(v_class.class_definition_kind, 'system') = 'system' limit 1;
      if v_caster_type is null then
        select caster_type into v_caster_type from public.custom_classes where class_name = v_class_name
          and (v_class.class_definition_id is null or id = v_class.class_definition_id)
          and coalesce(v_class.class_definition_kind, 'custom') = 'custom'
          and (campaign_id = v_member.campaign_id or campaign_id is null) order by (campaign_id is not null) desc limit 1;
      end if;
    end if;
    -- A ritual cast (p_slot_level = 0 on a Ritual-tagged spell) is validated by
    -- its own eligibility branch below, which deliberately allows some
    -- unprepared spellbook rituals (e.g. a Wizard's). Only gate non-ritual casts.
    if v_spell.level > 0 and not v_grant.always_prepared
      and coalesce(v_caster_type, 'prepared') <> 'known' and not v_grant.is_prepared
      and not (p_slot_level = 0 and v_spell.ritual) then
      raise exception '% must be prepared before it can be cast', v_spell.name;
    end if;
  elsif p_slot_level <> 0 then
    raise exception 'Feature-granted spells do not spend class spell slots';
  end if;

  if p_parent_cast_id is not null then
    -- Post-roll path: a single post-roll option modifies a cast that already
    -- happened. It never spends a slot and never touches turn state.
    if v_metamagic_count = 1 then
      select * into v_option from public.metamagic_options
        where ruleset = v_ruleset and name = p_metamagic_names[1];
    end if;
    if v_metamagic_count <> 1 or not coalesce(v_option.post_roll, false) then
      raise exception 'Only one post-roll Metamagic option can modify an existing cast';
    end if;
    select * into v_parent from public.spell_cast_records
      where id = p_parent_cast_id and party_member_id = p_party_member_id
        and character_spell_id = p_character_spell_id for update;
    if not found then raise exception 'Original spell cast not found'; end if;
    if v_parent.turn_key is not null and v_parent.turn_key is distinct from v_turn_key then
      raise exception 'Original spell cast is no longer in the active turn';
    elsif v_parent.turn_key is null and v_parent.created_at < now() - interval '5 minutes' then
      raise exception 'Original spell cast is too old to modify';
    end if;
    if p_metamagic_names[1] = any(v_parent.metamagic_names) then
      raise exception '% was already used on this cast', p_metamagic_names[1];
    end if;
    if coalesce(array_length(v_parent.metamagic_names, 1), 0) >= 2 then
      raise exception 'A spell cannot have more than two Metamagic options';
    end if;
    v_reactive := true;
    v_eff_slot_level := 0;
  else
    if exists (select 1 from unnest(coalesce(p_metamagic_names, '{}'::text[])) mm(option_name)
      join public.metamagic_options mo on mo.ruleset = v_ruleset and mo.name = mm.option_name
      where mo.post_roll) then
      raise exception 'Empowered Spell and Seeking Spell must be applied after their roll';
    end if;
    v_eff_slot_level := p_slot_level;

    if v_grant.source_type <> 'class' and p_slot_level = 0 then
      v_method := 'feature';
    elsif v_spell.level = 0 then
      if p_slot_level <> 0 then raise exception 'Cantrips do not spend spell slots'; end if;
      v_method := 'at_will';
    elsif p_slot_level = 0 then
      if not v_spell.ritual then raise exception 'This spell does not have the Ritual tag'; end if;
      if coalesce(v_class.class_definition_kind, 'system') = 'system' then
        select ritual_style into v_ritual_style from public.class_ritual_policies
          where ruleset = v_ruleset and class_name = v_class_name;
      end if;
      -- Unlisted (and custom) classes fall back to the edition default:
      -- 2024 rituals ride on preparation, 2014 rituals need a class feature.
      v_ritual_style := coalesce(v_ritual_style, case when v_ruleset = '2024' then 'prepared' else 'none' end);
      v_ready := v_grant.is_prepared or v_grant.always_prepared;
      case v_ritual_style
        when 'known' then null;
        when 'spellbook' then
          if not v_grant.is_known then raise exception '% ritual must be in the spellbook', v_class_name; end if;
        when 'spellbook_or_prepared' then
          if not (v_grant.is_known or v_ready) then
            raise exception 'Ritual casting requires % to be prepared or in the spellbook', v_spell.name;
          end if;
        when 'prepared' then
          if not v_ready then raise exception 'Ritual casting requires % to be prepared', v_spell.name; end if;
        else
          raise exception '% cannot ritual-cast this spell under % rules', v_class_name, v_ruleset;
      end case;
      v_method := 'ritual';
    else
      if p_slot_level < v_spell.level then raise exception 'Cast slot cannot be below the spell level'; end if;
      v_method := 'slot';
    end if;
  end if;

  if v_metamagic_count > 0 then
    if v_sorcerer_level < 2 then raise exception 'Metamagic requires an eligible Sorcerer'; end if;
    v_innate_active := coalesce((v_choices ->> 'innate_sorcery_active')::boolean, false)
      and coalesce((v_choices ->> 'innate_sorcery_expires_at')::timestamptz, '-infinity') > now();
    if v_ruleset = '2024' and v_sorcerer_level >= 7 and v_innate_active then v_limit := 2; end if;
    if v_metamagic_count > v_limit then raise exception 'Too many Metamagic options for this casting'; end if;
    if v_metamagic_count <> coalesce(array_length(array(select distinct unnest(p_metamagic_names)), 1), 0) then
      raise exception 'A Metamagic option cannot be applied twice';
    end if;

    foreach v_name in array p_metamagic_names loop
      if jsonb_typeof(v_choices -> 'metamagic_options') = 'array' then
        select exists(select 1 from jsonb_array_elements_text(v_choices -> 'metamagic_options') x where x = v_name) into v_known;
      else
        v_known := v_choices ->> 'metamagic_options' = v_name;
      end if;
      if not v_known then raise exception 'Character does not know %', v_name; end if;
      select * into v_option from public.metamagic_options where ruleset = v_ruleset and name = v_name;
      if not found then raise exception 'Unsupported Metamagic option'; end if;

      -- Eligibility against the exact spell version being cast.
      case v_name
        when 'Careful Spell', 'Heightened Spell' then
          if v_spell.attack_type is distinct from 'save' then raise exception '% requires a saving-throw spell', v_name; end if;
        when 'Distant Spell' then
          if not (coalesce(v_spell.range, '') = 'Touch' or coalesce(v_spell.range, '') ~* '(feet|ft\.|mile|^[0-9]+)') then raise exception 'Distant Spell requires a ranged or Touch spell'; end if;
        when 'Extended Spell' then
          if not (coalesce(v_spell.duration, '') ~* '(minute|hour|day|until dispelled)') or coalesce(v_spell.duration, '') ~* '^1 round$' then raise exception 'Extended Spell requires a duration of at least 1 minute'; end if;
        when 'Quickened Spell' then
          if v_spell.casting_time is distinct from 'Action' then raise exception 'Quickened Spell requires an Action casting time'; end if;
          v_quickened := true;
        when 'Transmuted Spell' then
          select exists(select 1 from jsonb_array_elements(coalesce(v_spell.damage_rolls, '[]'::jsonb)) roll
            where lower(roll ->> 'type') in ('acid','cold','fire','lightning','poison','thunder')) into v_original_type;
          if not v_original_type then raise exception 'Transmuted Spell requires eligible elemental damage'; end if;
          v_damage_type := lower(p_metamagic_choices ->> 'transmuted_damage_type');
          if coalesce(v_damage_type, '') not in ('acid','cold','fire','lightning','poison','thunder') then raise exception 'Choose a valid Transmuted Spell damage type'; end if;
          if exists(select 1 from jsonb_array_elements(coalesce(v_spell.damage_rolls, '[]'::jsonb)) roll where lower(roll ->> 'type') = v_damage_type) then
            raise exception 'Transmuted Spell must change the damage type';
          end if;
        when 'Twinned Spell' then
          if v_ruleset = '2024' then
            if coalesce(v_spell.higher_levels, '') !~* 'additional (creature|target)' then raise exception 'This spell is not eligible for revised Twinned Spell'; end if;
          elsif v_spell.range ~* '^self$' or coalesce(v_spell.target_description, '') !~* '^1\M' then
            raise exception 'This spell is not eligible for original Twinned Spell';
          end if;
        when 'Empowered Spell' then
          if jsonb_array_length(coalesce(v_spell.damage_rolls, '[]'::jsonb)) = 0 then raise exception 'Empowered Spell requires spell damage'; end if;
        when 'Seeking Spell' then
          if coalesce(v_spell.attack_type, '') not in ('ranged_spell', 'melee_spell') then raise exception 'Seeking Spell requires a spell attack'; end if;
        else null;
      end case;

      v_cost := case when v_option.cost_scaling = 'spell_level'
        then greatest(v_eff_slot_level, v_option.sp_cost)
        else v_option.sp_cost end;
      -- Arcane Apotheosis makes one option free each encounter turn while
      -- Innate Sorcery is active; without a trusted turn boundary it charges.
      if v_ruleset = '2024' and v_sorcerer_level >= 18 and v_innate_active and not v_free_used
         and v_turn_key is not null
         and v_choices ->> 'arcane_apotheosis_turn' is distinct from v_turn_key then
        v_free_used := true;
        v_choices := jsonb_set(v_choices, '{arcane_apotheosis_turn}', to_jsonb(v_turn_key), true);
      else
        v_sp_total := v_sp_total + v_cost;
      end if;
    end loop;

    v_sp_current := coalesce((v_resources #>> '{sorcery_points,current}')::integer, 0);
    if v_sp_current < v_sp_total then raise exception 'Not enough Sorcery Points'; end if;
    if v_sp_total > 0 then
      v_resources := jsonb_set(v_resources, '{sorcery_points,current}', to_jsonb(v_sp_current - v_sp_total), false);
    end if;
  end if;

  -- Turn-scoped action economy (skipped for post-roll modifications, which
  -- belong to the original cast's action).
  if not v_reactive and v_turn_key is not null then
    if v_ruleset = '2024' and p_slot_level > 0 then
      if v_choices ->> 'spell_slot_cast_turn' = v_turn_key then
        raise exception '2024 rules allow only one spell-slot expenditure per turn';
      end if;
      v_choices := jsonb_set(v_choices, '{spell_slot_cast_turn}', to_jsonb(v_turn_key), true);
    elsif v_ruleset = '2014' then
      -- The Bonus Action restriction applies both to Quickened Spell and to
      -- spells whose printed casting time is already a Bonus Action.
      if (v_quickened or v_spell.casting_time = 'Bonus Action')
         and v_choices ->> 'noncantrip_spell_turn' = v_turn_key then
        raise exception 'A leveled spell was already cast this turn';
      end if;
      if not v_quickened
         and v_choices ->> 'bonus_action_spell_turn' = v_turn_key
         and not (v_spell.casting_time = 'Action' and v_spell.level = 0) then
        raise exception 'Only an Action cantrip can follow a Bonus Action spell this turn';
      end if;
      if v_spell.level > 0 then
        v_choices := jsonb_set(v_choices, '{noncantrip_spell_turn}', to_jsonb(v_turn_key), true);
      end if;
      if v_quickened or v_spell.casting_time = 'Bonus Action' then
        v_choices := jsonb_set(v_choices, '{bonus_action_spell_turn}', to_jsonb(v_turn_key), true);
      end if;
    end if;
  end if;

  -- Limited-use feature/innate grants spend a use in the same transaction.
  if v_grant.source_type <> 'class' and v_grant.uses_per_day is not null then
    if coalesce(v_grant.uses_remaining, 0) <= 0 then raise exception 'No innate spell uses remaining'; end if;
    update public.character_spells set uses_remaining = uses_remaining - 1 where id = v_grant.id;
  end if;

  if not v_reactive and p_slot_level > 0 then
    v_slots := public.spend_spell_slot(p_party_member_id, p_slot_level, p_slot_pool, p_slot_template);
  else
    v_slots := v_member.spell_slots;
  end if;

  if v_reactive or p_concentration_state is null then
    v_concentration := v_member.concentration;
  else
    if jsonb_typeof(p_concentration_state) <> 'object'
       or nullif(p_concentration_state ->> 'spellName', '') is null then
      raise exception 'Invalid concentration state';
    end if;
    v_concentration := p_concentration_state;
  end if;

  update public.party_members
    set class_resources = v_resources,
        class_choices = v_choices,
        concentration = v_concentration
    where id = p_party_member_id;

  v_result := jsonb_build_object(
    'spell_slots', v_slots,
    'class_resources', v_resources,
    'concentration', v_concentration,
    'metamagic_cost', v_sp_total,
    'arcane_apotheosis_free', v_free_used,
    'metamagic_choices', coalesce(p_metamagic_choices, '{}'::jsonb)
  );
  if v_grant.source_type <> 'class' and v_grant.uses_per_day is not null then
    v_result := v_result || jsonb_build_object('uses_remaining', v_grant.uses_remaining - 1);
  end if;

  if v_reactive then
    update public.spell_cast_records set
      metamagic_names = array_append(metamagic_names, p_metamagic_names[1]),
      metamagic_choices = metamagic_choices || coalesce(p_metamagic_choices, '{}'::jsonb)
    where id = v_parent.id;
    return v_result || jsonb_build_object('cast_id', v_parent.id, 'reactive', true);
  end if;

  insert into public.spell_cast_records (
    party_member_id, character_spell_id, spell_id, spell_name, cast_level, slot_pool,
    cast_method, metamagic_names, metamagic_choices, concentration_state, turn_key
  ) values (
    p_party_member_id, p_character_spell_id, v_spell.id, v_spell.name,
    case when v_method in ('feature', 'ritual') then v_spell.level else p_slot_level end, p_slot_pool,
    v_method, coalesce(p_metamagic_names, '{}'::text[]), coalesce(p_metamagic_choices, '{}'::jsonb),
    p_concentration_state, v_turn_key
  ) returning id into v_cast_id;
  if v_method = 'slot' then
    -- The preparation "period" ends once a character starts casting
    -- non-cantrip spells from slots; the next long rest (take_spellcasting_rest)
    -- reopens it. Level-up windows are untouched here.
    delete from public.spell_change_windows
    where party_member_id = p_party_member_id and change_timing = 'long_rest';
  end if;
  return v_result || jsonb_build_object(
    'cast_id', v_cast_id,
    'cast_method', v_method,
    'cast_level', case when v_method in ('feature', 'ritual') then v_spell.level else p_slot_level end
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.change_prepared_spell(p_party_member_id uuid, p_source_class_id uuid, p_new_spell_id text, p_old_character_spell_id uuid DEFAULT NULL::uuid)
 RETURNS character_spells
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_member party_members%rowtype; v_class character_classes%rowtype;
  v_policy class_spellcasting_policies%rowtype; v_window spell_change_windows%rowtype;
  v_old character_spells%rowtype; v_new character_spells%rowtype;
begin
  select * into strict v_member from party_members where id = p_party_member_id for update;
  if not coalesce((v_member.user_id = auth.uid() or v_member.owner_user_id = auth.uid()
    or private.is_campaign_dm(v_member.campaign_id)), false) then raise exception 'Not authorized' using errcode = '42501'; end if;
  select * into strict v_class from character_classes
    where id = p_source_class_id and party_member_id = p_party_member_id
      and coalesce(class_definition_kind, 'system') = 'system';
  select policy.* into strict v_policy from class_spellcasting_policies policy
    where policy.ruleset = private.party_member_ruleset(v_member.id) and policy.class_name = v_class.class_name;
  select * into strict v_window from spell_change_windows
    where party_member_id = p_party_member_id and source_class_id = p_source_class_id
      and change_timing = v_policy.change_timing for update;
  if v_window.remaining_changes is not null and v_window.remaining_changes <= 0 then
    raise exception 'No % spell changes remaining', v_policy.change_timing;
  end if;
  if p_old_character_spell_id is not null then
    select * into strict v_old from character_spells where id = p_old_character_spell_id
      and party_member_id = p_party_member_id and source_class_id = p_source_class_id
      and source_type = 'class' and not always_prepared for update;
    if public.character_spell_level(v_old.spell_id) = 0 then raise exception 'Cantrips use their class level-up choice'; end if;
    delete from character_spells where id = v_old.id;
  elsif v_policy.change_count is not null then raise exception 'Choose a prepared spell to replace'; end if;
  insert into character_spells
    (party_member_id, spell_id, is_known, is_prepared, always_prepared, source_type, source_class_id)
  values (p_party_member_id, p_new_spell_id, true, true, false, 'class', p_source_class_id)
  returning * into v_new;
  if v_window.remaining_changes is not null then
    update spell_change_windows set remaining_changes = remaining_changes - 1
    where party_member_id = p_party_member_id and source_class_id = p_source_class_id
      and change_timing = v_policy.change_timing;
  end if;
  return v_new;
exception when no_data_found then raise exception 'No active spell-change window for this class';
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_character_spells(p_party_member_id uuid, p_character_spell_id uuid DEFAULT NULL::uuid, p_spell_id text DEFAULT NULL::text, p_source_class_id uuid DEFAULT NULL::uuid, p_source_type text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_member public.party_members%rowtype; v_deleted integer;
begin
  select * into strict v_member from public.party_members where id = p_party_member_id for update;
  if not coalesce((v_member.user_id = auth.uid() or v_member.owner_user_id = auth.uid()
    or private.is_campaign_dm(v_member.campaign_id)), false) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if p_character_spell_id is null and p_spell_id is null and p_source_type is null then
    raise exception 'An exact spell or grant source is required';
  end if;
  -- Cantrips are always available (change_prepared_spell rejects them, so a
  -- window would make them permanently unremovable) and Wizard-style
  -- spellbook classes learn/forget spells outside the window mechanism
  -- (only *preparing* a known spell is windowed, via set_character_spell_prepared).
  -- Only leveled known/prepared class spells need window protection here.
  if exists (
    select 1 from public.character_spells spell
    join public.character_classes cc on cc.id = spell.source_class_id
    join public.class_spellcasting_policies policy
      on policy.ruleset = private.party_member_ruleset(v_member.id) and policy.class_name = cc.class_name
    where spell.party_member_id = p_party_member_id and spell.source_type = 'class'
      and coalesce(cc.class_definition_kind, 'system') = 'system'
      and policy.caster_type <> 'spellbook'
      and public.character_spell_level(spell.spell_id) > 0
      and (p_character_spell_id is null or spell.id = p_character_spell_id)
      and (p_spell_id is null or spell.spell_id = p_spell_id)
      and (p_source_class_id is null or spell.source_class_id = p_source_class_id)
      and (p_source_type is null or spell.source_type = p_source_type)
  ) then
    raise exception 'Revised class spells must be changed through their active replacement window';
  end if;
  -- An exact row id is already unambiguous; only when identification falls
  -- back to spell_id/source_type does a null p_source_class_id need to match
  -- solely ungrouped grants (source_class_id IS NULL) per the old client
  -- contract, rather than wildcard-matching the spell across every class a
  -- multiclass character has it granted through.
  delete from public.character_spells spell
  where spell.party_member_id = p_party_member_id
    and (p_character_spell_id is null or spell.id = p_character_spell_id)
    and (p_spell_id is null or spell.spell_id = p_spell_id)
    and (p_character_spell_id is not null
      or spell.source_class_id is not distinct from p_source_class_id)
    and (p_source_type is null or spell.source_type = p_source_type);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guard_revised_preparation_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ruleset text;
begin
  if new.is_prepared is not distinct from old.is_prepared then return new; end if;
  v_ruleset := private.party_member_ruleset(new.party_member_id);
  if v_ruleset = '2024'
     and current_setting('app.preparation_change_spell_id', true) is distinct from new.id::text then
    raise exception 'Revised preparation changes require an active class change window';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.open_level_up_spell_window()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if (tg_op = 'INSERT' or new.levels > old.levels)
    and coalesce(new.class_definition_kind, 'system') = 'system' then
    -- A brand-new class row (INSERT) opens whichever window its policy
    -- defines, level_up or long_rest — a long_rest-timing caster (Cleric,
    -- Wizard, ...) must be able to prepare before ever taking a rest.
    -- A level-up (levels increasing on an existing row) only ever refreshes
    -- the level_up-timing window; long_rest windows are rest/cast-owned.
    insert into spell_change_windows(party_member_id, source_class_id, change_timing, remaining_changes, opened_at)
    select new.party_member_id, new.id, policy.change_timing, policy.change_count, now()
    from class_spellcasting_policies policy
    where policy.ruleset = private.party_member_ruleset(new.party_member_id)
      and policy.class_name = new.class_name
      and (policy.change_timing = 'level_up' or tg_op = 'INSERT')
    on conflict (party_member_id, source_class_id, change_timing) do update set
      remaining_changes = excluded.remaining_changes, opened_at = excluded.opened_at;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.open_spell_change_windows(p_party_member_id uuid, p_timing text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_timing not in ('level_up', 'long_rest') then raise exception 'Invalid spell change timing'; end if;
  -- Mirrors take_spellcasting_rest's check, including campaign_members
  -- collaborators, since the rest RPC delegates window opening here.
  if not exists (select 1 from party_members pm where pm.id = p_party_member_id and
    (pm.user_id = auth.uid() or pm.owner_user_id = auth.uid() or private.is_campaign_dm(pm.campaign_id)
      or exists (select 1 from public.campaign_members cm
        where cm.user_id = auth.uid() and cm.party_member_id = pm.id))) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  insert into spell_change_windows(party_member_id, source_class_id, change_timing, remaining_changes, opened_at)
  select p_party_member_id, cc.id, p_timing, policy.change_count, now()
  from character_classes cc
  join class_spellcasting_policies policy on policy.ruleset = private.party_member_ruleset(p_party_member_id)
    and policy.class_name = cc.class_name and policy.change_timing = p_timing
  where cc.party_member_id = p_party_member_id
    and coalesce(cc.class_definition_kind, 'system') = 'system'
  on conflict (party_member_id, source_class_id, change_timing) do update set
    remaining_changes = excluded.remaining_changes, opened_at = excluded.opened_at;
end;
$function$;

CREATE OR REPLACE FUNCTION public.required_level_up_spell_choices(p_member_id uuid, p_class_name text, p_new_class_level integer, p_definition_kind text DEFAULT NULL::text, p_definition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(spell_count integer, cantrip_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ruleset text;
  v_policy public.class_spellcasting_policies%rowtype;
  v_caster_type text;
  v_spells_known jsonb;
  v_cantrips_known integer[];
  v_current integer;
  v_previous integer;
  v_wizard_spell_count integer;
begin
  if p_new_class_level < 1 or p_new_class_level > 20 then
    raise exception 'Class level must be between 1 and 20';
  end if;

  if not exists (select 1 from public.party_members pm where pm.id = p_member_id) then
    raise exception 'Party member not found' using errcode = 'P0002';
  end if;
  v_ruleset := private.party_member_ruleset(p_member_id);

  -- The Wizard spellbook's 6-at-level-1 / 2-per-level-thereafter acquisition
  -- rule is identical whether resolved via the pinned system policy below or
  -- the system/custom-class fallback; compute it once instead of twice.
  if p_class_name = 'Wizard' and coalesce(p_definition_kind, 'system') = 'system' then
    v_wizard_spell_count := case when p_new_class_level = 1 then 6 else 2 end;
  end if;

  select * into v_policy from public.class_spellcasting_policies
  where ruleset = v_ruleset and class_name = p_class_name
    and coalesce(p_definition_kind, 'system') = 'system';

  if found then
    if v_wizard_spell_count is not null then
      spell_count := v_wizard_spell_count;
    elsif v_policy.prepared_limit is not null then
      v_current := coalesce(v_policy.prepared_limit[p_new_class_level], 0);
      v_previous := case when p_new_class_level = 1 then 0
        else coalesce(v_policy.prepared_limit[p_new_class_level - 1], 0) end;
      spell_count := greatest(0, v_current - v_previous);
    else
      spell_count := 0;
    end if;
    if v_policy.cantrip_limit is not null then
      v_current := coalesce(v_policy.cantrip_limit[p_new_class_level], 0);
      v_previous := case when p_new_class_level = 1 then 0
        else coalesce(v_policy.cantrip_limit[p_new_class_level - 1], 0) end;
      cantrip_count := greatest(0, v_current - v_previous);
    else
      cantrip_count := 0;
    end if;
    return next;
    return;
  end if;

  select caster_type, spells_known, cantrips_known
    into v_caster_type, v_spells_known, v_cantrips_known
  from public.system_classes where class_name = p_class_name
    and (p_definition_id is null or id = p_definition_id)
    and coalesce(p_definition_kind, 'system') = 'system' limit 1;
  if not found then
    select cc.caster_type, cc.spells_known, cc.cantrips_known
      into v_caster_type, v_spells_known, v_cantrips_known
    from public.custom_classes cc
    join public.party_members pm on pm.id = p_member_id
    where cc.class_name = p_class_name
      and (p_definition_id is null or cc.id = p_definition_id)
      and coalesce(p_definition_kind, 'custom') = 'custom'
      and (cc.campaign_id = pm.campaign_id
        or (cc.campaign_id is null and cc.user_id in (pm.user_id, pm.owner_user_id)))
    order by (cc.campaign_id is not null) desc limit 1;
  end if;

  if v_wizard_spell_count is not null then
    spell_count := v_wizard_spell_count;
  elsif v_caster_type = 'known' and v_spells_known is not null then
    v_current := coalesce((v_spells_known ->> (p_new_class_level - 1))::integer, 0);
    v_previous := case when p_new_class_level = 1 then 0
      else coalesce((v_spells_known ->> (p_new_class_level - 2))::integer, 0) end;
    spell_count := greatest(0, v_current - v_previous);
  else
    spell_count := 0;
  end if;
  if v_cantrips_known is not null then
    v_current := coalesce(v_cantrips_known[p_new_class_level], 0);
    v_previous := case when p_new_class_level = 1 then 0
      else coalesce(v_cantrips_known[p_new_class_level - 1], 0) end;
    cantrip_count := greatest(0, v_current - v_previous);
  else
    cantrip_count := 0;
  end if;
  return next;
end;
$function$;

CREATE OR REPLACE FUNCTION public.restore_sorcery_points(p_party_member_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_member public.party_members%rowtype; v_level integer; v_ruleset text; v_resources jsonb; v_choices jsonb; v_current integer; v_max integer; v_gain integer;
begin
  select * into v_member from public.party_members where id = p_party_member_id for update;
  if not found then raise exception 'Party member not found'; end if;
  if not coalesce((v_member.user_id = (select auth.uid()) or v_member.owner_user_id = (select auth.uid())
    or private.is_campaign_dm(v_member.campaign_id)
    or exists (select 1 from public.campaign_members cm where cm.user_id = (select auth.uid()) and cm.party_member_id = v_member.id)), false)
  then raise exception 'Access denied'; end if;
  v_ruleset := private.party_member_ruleset(v_member.id);
  v_level := public.sorcerer_level(v_member);
  v_choices := coalesce(v_member.class_choices, '{}'::jsonb);
  if v_ruleset <> '2024' or v_level < 5 then raise exception 'Sorcerous Restoration is unavailable'; end if;
  if coalesce((v_choices ->> 'sorcerous_restoration_available')::boolean, false) is not true then
    raise exception 'Sorcerous Restoration requires a Short Rest and is once per Long Rest';
  end if;
  v_resources := coalesce(v_member.class_resources, '{}'::jsonb);
  v_current := coalesce((v_resources #>> '{sorcery_points,current}')::integer, 0);
  v_max := coalesce((v_resources #>> '{sorcery_points,max}')::integer, v_level);
  v_gain := least(floor(v_level / 2.0)::integer, greatest(v_max - v_current, 0));
  v_resources := jsonb_set(v_resources, '{sorcery_points,current}', to_jsonb(v_current + v_gain), false);
  v_choices := jsonb_set(v_choices, '{sorcerous_restoration_available}', 'false'::jsonb, true);
  v_choices := jsonb_set(v_choices, '{sorcerous_restoration_used}', 'true'::jsonb, true);
  update public.party_members set class_resources = v_resources, class_choices = v_choices where id = v_member.id;
  return jsonb_build_object('class_resources', v_resources, 'class_choices', v_choices, 'restored', v_gain);
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_character_spell_prepared(p_character_spell_id uuid, p_is_prepared boolean)
 RETURNS character_spells
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_spell public.character_spells%rowtype;
  v_member public.party_members%rowtype;
  v_class public.character_classes%rowtype;
  v_policy public.class_spellcasting_policies%rowtype;
begin
  select * into strict v_spell from public.character_spells where id = p_character_spell_id for update;
  select * into strict v_member from public.party_members where id = v_spell.party_member_id for update;
  if not coalesce((v_member.user_id = auth.uid() or v_member.owner_user_id = auth.uid()
    or private.is_campaign_dm(v_member.campaign_id)), false) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if v_spell.source_type <> 'class' or v_spell.source_class_id is null then
    raise exception 'Only class spells can be prepared';
  end if;
  if v_spell.always_prepared then raise exception 'Always-prepared spells cannot be changed'; end if;
  if public.character_spell_level(v_spell.spell_id) = 0 then raise exception 'Cantrips are always available'; end if;

  select * into strict v_class from public.character_classes
  where id = v_spell.source_class_id and party_member_id = v_member.id;
  if coalesce(v_class.class_definition_kind, 'system') = 'system' then
    select policy.* into v_policy
    from public.class_spellcasting_policies policy
    where policy.ruleset = private.party_member_ruleset(v_member.id)
      and policy.class_name = v_class.class_name;
  end if;

  if v_policy.ruleset is not null then
    if v_policy.caster_type <> 'spellbook' then
      raise exception 'This class changes prepared spells by replacement';
    end if;
    if not exists (
      -- "window" is a reserved SQL keyword and cannot be used as an unquoted
      -- alias (causes a syntax error at "where").
      select 1 from public.spell_change_windows scw
      where scw.party_member_id = v_member.id
        and scw.source_class_id = v_spell.source_class_id
        and scw.change_timing = v_policy.change_timing
    ) then
      raise exception 'No active % preparation window for this class', v_policy.change_timing;
    end if;
  end if;

  perform set_config('app.preparation_change_spell_id', v_spell.id::text, true);
  update public.character_spells set is_prepared = p_is_prepared
  where id = v_spell.id returning * into v_spell;
  return v_spell;
end;
$function$;

CREATE OR REPLACE FUNCTION public.take_spellcasting_rest(p_party_member_id uuid, p_rest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_member public.party_members%rowtype;
  v_slots jsonb := '[]'::jsonb;
  v_resources jsonb := '{}'::jsonb;
  v_choices jsonb;
  v_ruleset text;
  v_sorcerer_level integer;
begin
  if p_rest not in ('short', 'long') then raise exception 'Invalid rest type'; end if;
  select * into v_member from public.party_members where id = p_party_member_id for update;
  if not found then raise exception 'Party member not found'; end if;
  if not coalesce((v_member.user_id = (select auth.uid()) or v_member.owner_user_id = (select auth.uid())
    or private.is_campaign_dm(v_member.campaign_id)
    or exists (select 1 from public.campaign_members cm
      where cm.user_id = (select auth.uid()) and cm.party_member_id = v_member.id)), false)
  then raise exception 'Access denied'; end if;

  select coalesce(jsonb_agg(
    case
      when p_rest = 'long' and coalesce(slot ->> 'pool', 'spellcasting') = 'temporary' then null
      when p_rest = 'long' and coalesce(slot ->> 'recovery', case when slot ->> 'pool' = 'pact' then 'short' else 'long' end) <> 'none'
        then jsonb_set(slot, '{used}', '0'::jsonb, true)
      when p_rest = 'short' and coalesce(slot ->> 'recovery', case when slot ->> 'pool' = 'pact' then 'short' else 'long' end) = 'short'
        then jsonb_set(slot, '{used}', '0'::jsonb, true)
      else slot
    end order by ordinal
  ) filter (where not (p_rest = 'long' and coalesce(slot ->> 'pool', 'spellcasting') = 'temporary')), '[]'::jsonb)
  into v_slots
  from jsonb_array_elements(coalesce(v_member.spell_slots, '[]'::jsonb)) with ordinality rows(slot, ordinal);

  select coalesce(jsonb_object_agg(key,
    case
      when (p_rest = 'long' and coalesce(value ->> 'rest', 'long') <> 'none')
        or (p_rest = 'short' and value ->> 'rest' = 'short')
        then jsonb_set(value, '{current}', coalesce(value -> 'max', value -> 'current', '0'::jsonb), true)
      else value
    end
  ), '{}'::jsonb) into v_resources
  from jsonb_each(coalesce(v_member.class_resources, '{}'::jsonb));

  v_choices := coalesce(v_member.class_choices, '{}'::jsonb);
  v_ruleset := private.party_member_ruleset(v_member.id);
  v_sorcerer_level := public.sorcerer_level(v_member);
  if v_ruleset = '2024' and v_sorcerer_level >= 5 then
    if p_rest = 'short' and coalesce((v_choices ->> 'sorcerous_restoration_used')::boolean, false) is not true then
      v_choices := jsonb_set(v_choices, '{sorcerous_restoration_available}', 'true'::jsonb, true);
    elsif p_rest = 'long' then
      v_choices := jsonb_set(jsonb_set(v_choices, '{sorcerous_restoration_available}', 'false'::jsonb, true),
        '{sorcerous_restoration_used}', 'false'::jsonb, true);
    end if;
  end if;

  -- Declarative state reset: `_turn`-suffixed keys are turn-scoped and never
  -- survive a long rest; everything else resets per class_choice_rest_resets.
  select coalesce(jsonb_object_agg(kv.key,
    case when r.reset_action = 'set_false' then 'false'::jsonb else kv.value end), '{}'::jsonb)
  into v_choices
  from jsonb_each(v_choices) kv
  left join public.class_choice_rest_resets r
    on r.choice_key = kv.key
   and (r.rest = p_rest or (p_rest = 'long' and r.rest = 'short'))
  where coalesce(r.reset_action, '') <> 'remove'
    and not (p_rest = 'long' and kv.key like '%\_turn' escape '\');

  update public.party_members set
    spell_slots = v_slots,
    class_resources = v_resources,
    class_choices = v_choices
  where id = p_party_member_id;

  update public.character_spells set uses_remaining = uses_per_day
  where party_member_id = p_party_member_id and source_type <> 'class' and uses_per_day is not null
    and (resets_on = 'short_rest' or (p_rest = 'long' and resets_on = 'long_rest'));

  if p_rest = 'long' then
    -- Every rest surface opens the edition-defined preparation window as part
    -- of this transaction; it cannot be skipped by a second client request.
    perform public.open_spell_change_windows(p_party_member_id, 'long_rest');
  end if;

  return jsonb_build_object('spell_slots', v_slots, 'class_resources', v_resources, 'class_choices', v_choices);
end;
$function$;

CREATE OR REPLACE FUNCTION public.validate_character_class_definition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_name text; v_ruleset text;
begin
  if new.class_definition_id is null then return new; end if;
  v_ruleset := private.party_member_ruleset(new.party_member_id);
  if new.class_definition_kind = 'system' then
    select class_name into v_name from public.system_classes
    where id = new.class_definition_id and ruleset = v_ruleset;
  else
    select definition.class_name into v_name from public.custom_classes definition
    join public.party_members member on member.id = new.party_member_id
    where definition.id = new.class_definition_id
      and (definition.ruleset is null or definition.ruleset = v_ruleset)
      and (definition.campaign_id = member.campaign_id
        or (definition.campaign_id is null
          and definition.user_id in (member.user_id, member.owner_user_id, auth.uid())));
  end if;
  if v_name is null then raise exception 'Class definition is unavailable for ruleset %', v_ruleset; end if;
  if v_name <> new.class_name then raise exception 'Class definition does not match class name'; end if;
  delete from public.ruleset_reviews
  where character_class_id = new.id and flag_type = 'class';
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.validate_character_spell_limits()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_class public.character_classes%rowtype;
  v_member public.party_members%rowtype;
  v_policy public.class_spellcasting_policies%rowtype;
  v_caster_type text;
  v_spells_known jsonb;
  v_cantrips_known integer[];
  v_prepared_ability text;
  v_prepared_divisor integer;
  v_spell_level integer;
  v_limit integer;
  v_existing integer;
  v_score integer;
begin
  if new.source_type <> 'class' or new.always_prepared then return new; end if;
  select * into strict v_class from public.character_classes where id = new.source_class_id;
  select * into strict v_member from public.party_members where id = new.party_member_id;
  v_spell_level := public.character_spell_level(new.spell_id);

  if coalesce(v_class.class_definition_kind, 'system') = 'system' then
    select policy.* into v_policy from public.class_spellcasting_policies policy
    where policy.ruleset = private.party_member_ruleset(v_member.id) and policy.class_name = v_class.class_name;
  end if;
  if v_policy.ruleset is not null then
    if v_spell_level = 0 then
      v_limit := v_policy.cantrip_limit[least(v_class.levels, 20)];
    else
      v_limit := v_policy.prepared_limit[least(v_class.levels, 20)];
      if v_policy.caster_type <> 'spellbook' then new.is_prepared := true; end if;
      if v_policy.caster_type = 'spellbook' and not new.is_prepared then return new; end if;
    end if;
    if v_limit is null then return new; end if;
    select count(*) into v_existing from public.character_spells existing
    where existing.party_member_id = new.party_member_id and existing.source_class_id = new.source_class_id
      and existing.source_type = 'class' and not existing.always_prepared
      and ((v_spell_level = 0 and public.character_spell_level(existing.spell_id) = 0)
        or (v_spell_level > 0 and public.character_spell_level(existing.spell_id) > 0))
      and (v_spell_level = 0 or v_policy.caster_type <> 'spellbook' or existing.is_prepared)
      and existing.id is distinct from new.id;
    if v_existing >= v_limit then
      raise exception '% can prepare at most % % at class level %', v_class.class_name, v_limit,
        case when v_spell_level = 0 then 'cantrips' else 'spells' end, v_class.levels;
    end if;
    return new;
  end if;

  if coalesce(v_class.class_definition_kind, 'system') = 'system' then
    select caster_type, spells_known, cantrips_known, prepared_ability, prepared_divisor
      into v_caster_type, v_spells_known, v_cantrips_known, v_prepared_ability, v_prepared_divisor
    from public.system_classes where class_name = v_class.class_name
      and (v_class.class_definition_id is null or id = v_class.class_definition_id) limit 1;
  else
    select caster_type, spells_known, cantrips_known, prepared_ability, prepared_divisor
      into v_caster_type, v_spells_known, v_cantrips_known, v_prepared_ability, v_prepared_divisor
    from public.custom_classes where id = v_class.class_definition_id;
  end if;
  if v_spell_level = 0 then
    v_limit := v_cantrips_known[least(v_class.levels, 20)];
  elsif v_caster_type = 'known' then
    v_limit := nullif(v_spells_known ->> (least(v_class.levels, 20) - 1), '')::integer;
  elsif new.is_prepared and v_caster_type in ('prepared', 'spellbook') then
    v_score := case v_prepared_ability when 'int' then v_member."int" when 'wis' then v_member.wis
      when 'cha' then v_member.cha else 10 end;
    v_limit := greatest(1, floor((v_score - 10)::numeric / 2)::integer
      + floor(v_class.levels::numeric / greatest(coalesce(v_prepared_divisor, 1), 1))::integer);
  else
    return new;
  end if;
  if v_limit is null then return new; end if;
  select count(*) into v_existing from public.character_spells existing
  where existing.party_member_id = new.party_member_id and existing.source_class_id = new.source_class_id
    and existing.source_type = 'class' and not existing.always_prepared
    and ((v_spell_level = 0 and public.character_spell_level(existing.spell_id) = 0)
      or (v_spell_level > 0 and public.character_spell_level(existing.spell_id) > 0))
    and (v_spell_level = 0 or v_caster_type = 'known' or existing.is_prepared)
    and existing.id is distinct from new.id;
  if v_existing >= v_limit then raise exception '% spell limit of % reached', v_class.class_name, v_limit; end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.validate_character_spell_source()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_class public.character_classes%rowtype;
  v_member public.party_members%rowtype;
  v_policy public.class_spellcasting_policies%rowtype;
  v_spell_level integer;
  v_spell_classes text[];
  v_spell_slots jsonb;
  v_cantrips_known integer[];
  v_row jsonb;
  v_max_spell_level integer := 0;
  v_index integer;
begin
  if new.source_type <> 'class' then
    if new.source_class_id is not null then raise exception 'Non-class spell grants cannot reference a source class'; end if;
    return new;
  end if;
  if new.source_class_id is null then raise exception 'Class spells require a source class'; end if;
  select * into v_class from public.character_classes
    where id = new.source_class_id and party_member_id = new.party_member_id;
  if not found then raise exception 'Spell source class does not belong to this character'; end if;
  select * into strict v_member from public.party_members where id = new.party_member_id;

  select level, classes into v_spell_level, v_spell_classes from public.library_spells where id = new.spell_id;
  if not found then select level, classes into v_spell_level, v_spell_classes from public.spells where id::text = new.spell_id; end if;
  if not found then raise exception 'Spell does not exist'; end if;
  if not new.always_prepared and not (v_class.class_name = any(coalesce(v_spell_classes, '{}'::text[]))) then
    raise exception '% is not on the % spell list', new.spell_id, v_class.class_name;
  end if;

  if coalesce(v_class.class_definition_kind, 'system') = 'system' then
    select policy.* into v_policy from public.class_spellcasting_policies policy
    where policy.ruleset = private.party_member_ruleset(v_member.id) and policy.class_name = v_class.class_name;
  end if;
  if v_policy.ruleset is not null then
    if v_spell_level = 0 and v_policy.cantrip_limit is null and not new.always_prepared then
      raise exception '% does not have a cantrip progression', v_class.class_name;
    end if;
    v_max_spell_level := v_policy.max_spell_level[least(v_class.levels, 20)];
  else
    if coalesce(v_class.class_definition_kind, 'system') = 'system' then
      select spell_slots, cantrips_known into v_spell_slots, v_cantrips_known
      from public.system_classes where class_name = v_class.class_name
        and (v_class.class_definition_id is null or id = v_class.class_definition_id) limit 1;
      -- A row that predates class_definition_kind pinning (kind is NULL, not
      -- explicitly 'system') may actually be homebrew that happens to share a
      -- name with no matching system class. Restore the old name-based
      -- custom_classes fallback for that legacy case.
      if not found and v_class.class_definition_kind is null then
        select spell_slots, cantrips_known into v_spell_slots, v_cantrips_known
        from public.custom_classes cc
        where cc.class_name = v_class.class_name
          and (cc.campaign_id = v_member.campaign_id
            or (cc.campaign_id is null and cc.user_id in (v_member.user_id, v_member.owner_user_id)))
        order by (cc.campaign_id is not null) desc limit 1;
      end if;
    else
      select spell_slots, cantrips_known into v_spell_slots, v_cantrips_known
      from public.custom_classes where id = v_class.class_definition_id;
    end if;
    if not found or v_spell_slots is null then raise exception '% is not configured as a spellcasting class', v_class.class_name; end if;
    if v_spell_level = 0 then
      if v_cantrips_known is null and not new.always_prepared then raise exception '% does not have a cantrip progression', v_class.class_name; end if;
      return new;
    end if;
    v_row := v_spell_slots -> (least(v_class.levels, 20) - 1);
    if v_row is null or jsonb_typeof(v_row) <> 'array' then
      raise exception 'Missing spell-slot progression for % level %', v_class.class_name, v_class.levels;
    end if;
    if jsonb_array_length(v_row) > 0 then
      for v_index in 0..least(jsonb_array_length(v_row), 9) - 1 loop
        if coalesce((v_row ->> v_index)::integer, 0) > 0 then v_max_spell_level := v_index + 1; end if;
      end loop;
    end if;
  end if;
  if v_spell_level > 0 and v_spell_level > v_max_spell_level then
    raise exception 'A level-% % cannot acquire a level-% spell', v_class.levels, v_class.class_name, v_spell_level;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.validate_character_subclass_definition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_name text; v_class_name text; v_ruleset text;
begin
  if new.subclass_name is null then
    new.subclass_definition_id := null;
    delete from public.ruleset_reviews
    where character_class_id = new.id and flag_type = 'subclass';
    return new;
  end if;
  if new.subclass_definition_id is null then return new; end if;
  v_ruleset := private.party_member_ruleset(new.party_member_id);
  select definition.subclass_name, definition.class_name
    into v_name, v_class_name
  from public.custom_subclasses definition
  join public.party_members member on member.id = new.party_member_id
  where definition.id = new.subclass_definition_id
    and (definition.ruleset is null or definition.ruleset = v_ruleset)
    and (definition.campaign_id = member.campaign_id
      or (definition.campaign_id is null
        and definition.user_id in (member.user_id, member.owner_user_id, auth.uid())));
  if v_name is null then raise exception 'Subclass definition is unavailable for ruleset %', v_ruleset; end if;
  if v_name <> new.subclass_name or v_class_name <> new.class_name then
    raise exception 'Subclass definition does not match the selected class and subclass';
  end if;
  delete from public.ruleset_reviews
  where character_class_id = new.id and flag_type = 'subclass';
  return new;
end;
$function$;
