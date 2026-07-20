-- Validate Metamagic against the exact spell version and enforce turn-scoped
-- action-economy rules before delegating all resource mutations to the locked
-- cast_character_spell_v2 transaction.
create or replace function public.cast_character_spell_v3(
  p_party_member_id uuid, p_slot_level integer, p_slot_pool text,
  p_slot_template jsonb default null, p_concentration_state jsonb default null,
  p_metamagic_names text[] default '{}'::text[], p_character_spell_id uuid default null,
  p_metamagic_choices jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_member public.party_members%rowtype;
  v_grant public.character_spells%rowtype;
  v_spell public.spells%rowtype;
  v_ruleset text;
  v_name text;
  v_turn_key text;
  v_choices jsonb;
  v_quickened boolean := false;
  v_reactive boolean := false;
  v_damage_type text;
  v_original_type boolean;
  v_result jsonb;
begin
  select * into v_member from public.party_members where id = p_party_member_id for update;
  if not found then raise exception 'Party member not found'; end if;
  if not (v_member.user_id = (select auth.uid()) or v_member.owner_user_id = (select auth.uid())
    or public.is_campaign_dm(v_member.campaign_id)
    or exists (select 1 from public.campaign_members cm where cm.user_id = (select auth.uid()) and cm.party_member_id = v_member.id))
  then raise exception 'Access denied'; end if;
  if jsonb_typeof(coalesce(p_metamagic_choices, '{}'::jsonb)) <> 'object' then raise exception 'Invalid Metamagic choices'; end if;
  select coalesce(c.ruleset, '2014') into v_ruleset from public.campaigns c where c.id = v_member.campaign_id;

  if p_character_spell_id is not null then
    select * into v_grant from public.character_spells
      where id = p_character_spell_id and party_member_id = p_party_member_id for update;
    if not found then raise exception 'Character spell not found'; end if;
    select * into v_spell from public.spells where id = v_grant.spell_id;
    if not found then raise exception 'Spell content version not found'; end if;
  elsif coalesce(array_length(p_metamagic_names, 1), 0) > 0 then
    raise exception 'Metamagic requires an exact character spell';
  end if;

  foreach v_name in array coalesce(p_metamagic_names, '{}'::text[]) loop
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
        if v_damage_type not in ('acid','cold','fire','lightning','poison','thunder') then raise exception 'Choose a valid Transmuted Spell damage type'; end if;
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
      when 'Subtle Spell' then null;
      else raise exception 'Unsupported Metamagic option';
    end case;
  end loop;
  v_reactive := coalesce(array_length(p_metamagic_names, 1), 0) > 0
    and not exists (select 1 from unnest(p_metamagic_names) name where name not in ('Empowered Spell', 'Seeking Spell'));

  select es.id::text || ':' || es.current_round::text || ':' || es.active_combatant_index::text
    into v_turn_key from public.encounter_state es
    where es.campaign_id = v_member.campaign_id and es.is_running order by es.updated_at desc limit 1;
  v_choices := coalesce(v_member.class_choices, '{}'::jsonb);
  if v_turn_key is not null and v_spell.id is not null and not v_reactive then
    if v_ruleset = '2024' and p_slot_level > 0 then
      if v_choices ->> 'spell_slot_cast_turn' = v_turn_key then raise exception '2024 rules allow only one spell-slot expenditure per turn'; end if;
      v_choices := jsonb_set(v_choices, '{spell_slot_cast_turn}', to_jsonb(v_turn_key), true);
    elsif v_ruleset = '2014' then
      if v_quickened then
        if v_choices ->> 'noncantrip_spell_turn' = v_turn_key then raise exception 'A leveled spell was already cast this turn'; end if;
        v_choices := jsonb_set(v_choices, '{bonus_action_spell_turn}', to_jsonb(v_turn_key), true);
      elsif v_choices ->> 'bonus_action_spell_turn' = v_turn_key
        and not (v_spell.casting_time = 'Action' and v_spell.level = 0) then
        raise exception 'Only an Action cantrip can follow a Bonus Action spell this turn';
      end if;
      if v_spell.level > 0 then
        v_choices := jsonb_set(v_choices, '{noncantrip_spell_turn}', to_jsonb(v_turn_key), true);
      end if;
    end if;
    update public.party_members set class_choices = v_choices where id = v_member.id;
  end if;

  v_result := public.cast_character_spell_v2(
    p_party_member_id, p_slot_level, p_slot_pool, p_slot_template, p_concentration_state,
    p_metamagic_names,
    case when p_character_spell_id is not null and v_grant.source_type <> 'class' then p_character_spell_id else null end
  );
  return v_result || jsonb_build_object('metamagic_choices', coalesce(p_metamagic_choices, '{}'::jsonb));
end;
$$;

revoke all on function public.cast_character_spell_v3(uuid, integer, text, jsonb, jsonb, text[], uuid, jsonb) from public, anon;
grant execute on function public.cast_character_spell_v3(uuid, integer, text, jsonb, jsonb, text[], uuid, jsonb) to authenticated;
