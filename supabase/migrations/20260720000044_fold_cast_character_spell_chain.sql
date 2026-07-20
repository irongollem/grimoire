-- Migration: fold_cast_character_spell_chain
-- cast_character_spell_v4 previously delegated through four inner layers
-- (v3 wrapper → v3_before_inherent_bonus_action → v2 → v1), each of which
-- re-locked the party_members row, re-ran the auth subquery, and re-fetched
-- the campaign ruleset and encounter turn (~12–16 redundant queries per cast
-- while holding the row lock, on the hottest RPC in the app). This folds the
-- whole chain into one authoritative body with exactly one lock, one auth
-- check, one ruleset lookup, one turn-key lookup, one grant lock, and one
-- spell resolve, then drops the inner versions entirely.
--
-- Metamagic identity/classification/cost now comes from metamagic_options and
-- ritual eligibility from class_ritual_policies (both seeded in 20260720000043)
-- instead of string literals. Behavior is otherwise unchanged; only slot
-- spending still delegates to spend_spell_slot, which owns the template
-- reconciliation rules and already runs under the same row lock.

create or replace function public.cast_character_spell_v4(
  p_party_member_id uuid, p_slot_level integer, p_slot_pool text,
  p_slot_template jsonb default null, p_concentration_state jsonb default null,
  p_metamagic_names text[] default '{}'::text[], p_character_spell_id uuid default null,
  p_metamagic_choices jsonb default '{}'::jsonb, p_parent_cast_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
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
  if not (v_member.user_id = (select auth.uid()) or v_member.owner_user_id = (select auth.uid())
    or private.is_campaign_dm(v_member.campaign_id)
    or exists (select 1 from public.campaign_members cm
      where cm.user_id = (select auth.uid()) and cm.party_member_id = v_member.id))
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
    from public.srd_spells where id = v_grant.spell_id
  ) resolved_spell limit 1;
  if not found then raise exception 'Spell content version not found'; end if;

  select coalesce(c.ruleset, '2014') into v_ruleset from public.campaigns c where c.id = v_member.campaign_id;
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
$$;

revoke all on function public.cast_character_spell_v4(uuid, integer, text, jsonb, jsonb, text[], uuid, jsonb, uuid) from public, anon;
grant execute on function public.cast_character_spell_v4(uuid, integer, text, jsonb, jsonb, text[], uuid, jsonb, uuid) to authenticated;

-- The inner chain is dead code now; drop it so the obsolete versions cannot
-- linger as callable SECURITY DEFINER surface.
drop function public.cast_character_spell_v3(uuid, integer, text, jsonb, jsonb, text[], uuid, jsonb);
drop function public.cast_character_spell_v3_before_inherent_bonus_action(uuid, integer, text, jsonb, jsonb, text[], uuid, jsonb);
drop function public.cast_character_spell_v2(uuid, integer, text, jsonb, jsonb, text[], uuid);
drop function public.cast_character_spell(uuid, integer, text, jsonb, jsonb, text, uuid);
drop function public.cast_character_spell(uuid, integer, text, jsonb, jsonb, text);
