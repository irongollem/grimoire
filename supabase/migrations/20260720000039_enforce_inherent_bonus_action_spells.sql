-- The original-rules Bonus Action restriction applies both to Quickened Spell
-- and to spells whose printed casting time is already a Bonus Action. Preserve
-- the existing V3 validation transaction behind a wrapper so deployed
-- databases receive the correction through a forward-only migration.

alter function public.cast_character_spell_v3(uuid, integer, text, jsonb, jsonb, text[], uuid, jsonb)
  rename to cast_character_spell_v3_before_inherent_bonus_action;

create function public.cast_character_spell_v3(
  p_party_member_id uuid, p_slot_level integer, p_slot_pool text,
  p_slot_template jsonb default null, p_concentration_state jsonb default null,
  p_metamagic_names text[] default '{}'::text[], p_character_spell_id uuid default null,
  p_metamagic_choices jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_member public.party_members%rowtype;
  v_grant public.character_spells%rowtype;
  v_casting_time text;
  v_ruleset text;
  v_turn_key text;
  v_reactive boolean;
  v_result jsonb;
begin
  select * into v_member from public.party_members
  where id = p_party_member_id for update;
  if not found then raise exception 'Party member not found'; end if;

  select coalesce(c.ruleset, '2014') into v_ruleset
  from public.campaigns c where c.id = v_member.campaign_id;
  v_reactive := coalesce(array_length(p_metamagic_names, 1), 0) > 0
    and not exists (
      select 1 from unnest(p_metamagic_names) name
      where name not in ('Empowered Spell', 'Seeking Spell')
    );

  if v_ruleset = '2014' and p_character_spell_id is not null and not v_reactive then
    select * into v_grant from public.character_spells
    where id = p_character_spell_id and party_member_id = p_party_member_id for update;
    if not found then raise exception 'Character spell not found'; end if;
    select casting_time into v_casting_time from (
      select casting_time from public.spells where id::text = v_grant.spell_id
      union all
      select casting_time from public.srd_spells where id = v_grant.spell_id
    ) resolved_spell limit 1;
  end if;

  if v_casting_time = 'Bonus Action' then
    v_turn_key := private.active_turn_key(v_member.campaign_id);
    if v_turn_key is not null
      and coalesce(v_member.class_choices, '{}'::jsonb) ->> 'noncantrip_spell_turn' = v_turn_key then
      raise exception 'A leveled spell was already cast this turn';
    end if;
  end if;

  v_result := public.cast_character_spell_v3_before_inherent_bonus_action(
    p_party_member_id, p_slot_level, p_slot_pool, p_slot_template,
    p_concentration_state, p_metamagic_names, p_character_spell_id,
    p_metamagic_choices
  );

  if v_casting_time = 'Bonus Action' and v_turn_key is not null then
    update public.party_members set class_choices = jsonb_set(
      coalesce(class_choices, '{}'::jsonb),
      '{bonus_action_spell_turn}', to_jsonb(v_turn_key), true
    ) where id = p_party_member_id;
  end if;
  return v_result;
end;
$$;

revoke all on function public.cast_character_spell_v3_before_inherent_bonus_action(uuid, integer, text, jsonb, jsonb, text[], uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.cast_character_spell_v3(uuid, integer, text, jsonb, jsonb, text[], uuid, jsonb)
  from public, anon, authenticated;
