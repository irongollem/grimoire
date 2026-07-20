-- Complete the 2024 Sorcerer resource loop and make multi-option Metamagic
-- atomic with slot use, concentration, and limited-use innate spells.

-- 2024 campaigns need an edition-specific class row. Preserve the existing
-- class chassis while replacing the revised resource and choice progression.
insert into public.system_classes (
  class_name, hit_die, primary_ability, saving_throws, armor_proficiencies,
  weapon_proficiencies, subclass_level, features, asi_levels, spell_slots,
  spells_known, slot_recovery, steps, resources, caster_type, prepared_ability,
  prepared_divisor, cantrips_known, ruleset, conceptual_key,
  source_document_key, source_record_key, source_revision, source_license,
  provenance
)
select
  class_name, hit_die, primary_ability, saving_throws, armor_proficiencies,
  weapon_proficiencies, 3, features, asi_levels, spell_slots,
  spells_known, slot_recovery,
  (select coalesce(jsonb_agg(step), '[]'::jsonb)
    from jsonb_array_elements(coalesce(sc.steps, '[]'::jsonb)) step
    where step ->> 'key' is distinct from 'metamagic_options')
  || jsonb_build_array(
    jsonb_build_object('level', 2, 'step_type', 'text_pick', 'type', 'append', 'key', 'metamagic_options',
      'label', 'Metamagic', 'description', 'Choose 2 Metamagic options.', 'count', 2, 'options', sc.steps -> 0 -> 'options'),
    jsonb_build_object('level', 10, 'step_type', 'text_pick', 'type', 'append', 'key', 'metamagic_options',
      'label', 'Additional Metamagic', 'description', 'Choose 2 additional Metamagic options.', 'count', 2, 'options', sc.steps -> 0 -> 'options'),
    jsonb_build_object('level', 17, 'step_type', 'text_pick', 'type', 'append', 'key', 'metamagic_options',
      'label', 'Additional Metamagic', 'description', 'Choose 2 additional Metamagic options.', 'count', 2, 'options', sc.steps -> 0 -> 'options')
  ),
  '[
    {"key":"sorcery_points","label":"Sorcery Points","rest":"long","scaling":"table","table_values":[0,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]},
    {"key":"innate_sorcery","label":"Innate Sorcery","rest":"long","scaling":"fixed","amount":2}
  ]'::jsonb,
  'prepared', prepared_ability, prepared_divisor, cantrips_known,
  '2024', 'sorcerer', 'dnd-free-rules-2024', '2024:sorcerer',
  '2024-07', 'CC-BY-4.0', jsonb_build_object('edition', '2024')
from public.system_classes sc
where class_name = 'Sorcerer' and ruleset = '2014'
on conflict (ruleset, class_name) do update set
  steps = excluded.steps,
  resources = excluded.resources,
  caster_type = excluded.caster_type,
  source_document_key = excluded.source_document_key,
  source_record_key = excluded.source_record_key,
  source_revision = excluded.source_revision,
  provenance = excluded.provenance;

-- Bring existing revised Sorcerers onto the corrected resource maxima without
-- granting spent points back during deployment.
update public.party_members pm
set class_resources = jsonb_set(
  jsonb_set(coalesce(pm.class_resources, '{}'::jsonb), '{sorcery_points}',
    jsonb_build_object(
      'max', case when coalesce(cc.levels, pm.level) >= 2 then least(coalesce(cc.levels, pm.level), 20) else 0 end,
      'current', least(coalesce((pm.class_resources #>> '{sorcery_points,current}')::integer, 0),
        case when coalesce(cc.levels, pm.level) >= 2 then least(coalesce(cc.levels, pm.level), 20) else 0 end),
      'rest', 'long'), true),
  '{innate_sorcery}',
  jsonb_build_object(
    'max', 2,
    'current', least(coalesce((pm.class_resources #>> '{innate_sorcery,current}')::integer, 2), 2),
    'rest', 'long'), true)
from public.campaigns c, public.character_classes cc
where c.id = pm.campaign_id and c.ruleset = '2024'
  and cc.party_member_id = pm.id and cc.class_name = 'Sorcerer';

update public.party_members pm
set class_resources = jsonb_set(
  jsonb_set(coalesce(pm.class_resources, '{}'::jsonb), '{sorcery_points}',
    jsonb_build_object(
      'max', case when pm.level >= 2 then least(pm.level, 20) else 0 end,
      'current', least(coalesce((pm.class_resources #>> '{sorcery_points,current}')::integer, 0),
        case when pm.level >= 2 then least(pm.level, 20) else 0 end),
      'rest', 'long'), true),
  '{innate_sorcery}',
  jsonb_build_object('max', 2, 'current', least(coalesce((pm.class_resources #>> '{innate_sorcery,current}')::integer, 2), 2), 'rest', 'long'), true)
from public.campaigns c
where c.id = pm.campaign_id and c.ruleset = '2024' and pm.class = 'Sorcerer'
  and not exists (select 1 from public.character_classes cc where cc.party_member_id = pm.id);

create or replace function public.sorcerer_level(p_member public.party_members)
returns integer language sql stable set search_path = public as $$
  select coalesce(
    (select cc.levels from public.character_classes cc
      where cc.party_member_id = p_member.id and cc.class_name = 'Sorcerer' limit 1),
    case when p_member.class = 'Sorcerer' then p_member.level else 0 end,
    0
  );
$$;

create or replace function public.activate_innate_sorcery(p_party_member_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
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
  if not (v_member.user_id = (select auth.uid()) or v_member.owner_user_id = (select auth.uid())
    or private.is_campaign_dm(v_member.campaign_id)
    or exists (select 1 from public.campaign_members cm where cm.user_id = (select auth.uid()) and cm.party_member_id = v_member.id))
  then raise exception 'Access denied'; end if;
  select coalesce(c.ruleset, '2014') into v_ruleset from public.campaigns c where c.id = v_member.campaign_id;
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
$$;

create or replace function public.end_innate_sorcery(p_party_member_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_member public.party_members%rowtype; v_choices jsonb;
begin
  select * into v_member from public.party_members where id = p_party_member_id for update;
  if not found then raise exception 'Party member not found'; end if;
  if not (v_member.user_id = (select auth.uid()) or v_member.owner_user_id = (select auth.uid())
    or private.is_campaign_dm(v_member.campaign_id)
    or exists (select 1 from public.campaign_members cm where cm.user_id = (select auth.uid()) and cm.party_member_id = v_member.id))
  then raise exception 'Access denied'; end if;
  v_choices := jsonb_set(coalesce(v_member.class_choices, '{}'::jsonb), '{innate_sorcery_active}', 'false'::jsonb, true) - 'innate_sorcery_expires_at';
  update public.party_members set class_choices = v_choices where id = v_member.id;
  return v_choices;
end;
$$;

create or replace function public.record_sorcerer_rest(p_party_member_id uuid, p_rest text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_member public.party_members%rowtype; v_choices jsonb; v_ruleset text; v_level integer;
begin
  if p_rest not in ('short', 'long') then raise exception 'Invalid rest type'; end if;
  select * into v_member from public.party_members where id = p_party_member_id for update;
  if not found then raise exception 'Party member not found'; end if;
  if not (v_member.user_id = (select auth.uid()) or v_member.owner_user_id = (select auth.uid())
    or private.is_campaign_dm(v_member.campaign_id)
    or exists (select 1 from public.campaign_members cm where cm.user_id = (select auth.uid()) and cm.party_member_id = v_member.id))
  then raise exception 'Access denied'; end if;
  select coalesce(c.ruleset, '2014') into v_ruleset from public.campaigns c where c.id = v_member.campaign_id;
  v_level := public.sorcerer_level(v_member);
  v_choices := coalesce(v_member.class_choices, '{}'::jsonb);
  if v_ruleset = '2024' and v_level >= 5 then
    if p_rest = 'short' and coalesce((v_choices ->> 'sorcerous_restoration_used')::boolean, false) is not true then
      v_choices := jsonb_set(v_choices, '{sorcerous_restoration_available}', 'true'::jsonb, true);
    elsif p_rest = 'long' then
      v_choices := jsonb_set(jsonb_set(v_choices, '{sorcerous_restoration_available}', 'false'::jsonb, true),
        '{sorcerous_restoration_used}', 'false'::jsonb, true);
    end if;
  end if;
  if p_rest = 'long' then
    v_choices := jsonb_set(v_choices, '{innate_sorcery_active}', 'false'::jsonb, true) - 'innate_sorcery_expires_at' - 'arcane_apotheosis_turn';
  end if;
  update public.party_members set class_choices = v_choices where id = v_member.id;
  return v_choices;
end;
$$;

create or replace function public.restore_sorcery_points(p_party_member_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_member public.party_members%rowtype; v_level integer; v_ruleset text; v_resources jsonb; v_choices jsonb; v_current integer; v_max integer; v_gain integer;
begin
  select * into v_member from public.party_members where id = p_party_member_id for update;
  if not found then raise exception 'Party member not found'; end if;
  if not (v_member.user_id = (select auth.uid()) or v_member.owner_user_id = (select auth.uid())
    or private.is_campaign_dm(v_member.campaign_id)
    or exists (select 1 from public.campaign_members cm where cm.user_id = (select auth.uid()) and cm.party_member_id = v_member.id))
  then raise exception 'Access denied'; end if;
  select coalesce(c.ruleset, '2014') into v_ruleset from public.campaigns c where c.id = v_member.campaign_id;
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
$$;

create or replace function public.cast_character_spell_v2(
  p_party_member_id uuid, p_slot_level integer, p_slot_pool text,
  p_slot_template jsonb default null, p_concentration_state jsonb default null,
  p_metamagic_names text[] default '{}'::text[], p_character_spell_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_member public.party_members%rowtype; v_spell public.character_spells%rowtype;
  v_result jsonb; v_resources jsonb; v_choices jsonb; v_ruleset text;
  v_level integer; v_name text; v_cost integer; v_total integer := 0; v_limit integer := 1;
  v_current integer; v_known boolean; v_active boolean; v_turn_key text; v_free_used boolean := false;
begin
  select * into v_member from public.party_members where id = p_party_member_id for update;
  if not found then raise exception 'Party member not found'; end if;
  if not (v_member.user_id = (select auth.uid()) or v_member.owner_user_id = (select auth.uid())
    or private.is_campaign_dm(v_member.campaign_id)
    or exists (select 1 from public.campaign_members cm where cm.user_id = (select auth.uid()) and cm.party_member_id = v_member.id))
  then raise exception 'Access denied'; end if;
  select coalesce(c.ruleset, '2014') into v_ruleset from public.campaigns c where c.id = v_member.campaign_id;
  v_level := public.sorcerer_level(v_member);
  v_choices := coalesce(v_member.class_choices, '{}'::jsonb);
  v_active := coalesce((v_choices ->> 'innate_sorcery_active')::boolean, false)
    and coalesce((v_choices ->> 'innate_sorcery_expires_at')::timestamptz, '-infinity') > now();
  if v_ruleset = '2024' and v_level >= 7 and v_active then v_limit := 2; end if;
  if coalesce(array_length(p_metamagic_names, 1), 0) > v_limit then
    raise exception 'Too many Metamagic options for this casting';
  end if;
  if coalesce(array_length(p_metamagic_names, 1), 0) <> coalesce(array_length(array(select distinct unnest(p_metamagic_names)), 1), 0) then
    raise exception 'A Metamagic option cannot be applied twice';
  end if;

  select es.id::text || ':' || es.current_round::text || ':' || es.active_combatant_index::text
    into v_turn_key from public.encounter_state es
    where es.campaign_id = v_member.campaign_id and es.is_running order by es.updated_at desc limit 1;
  foreach v_name in array coalesce(p_metamagic_names, '{}'::text[]) loop
    if jsonb_typeof(v_choices -> 'metamagic_options') = 'array' then
      select exists(select 1 from jsonb_array_elements_text(v_choices -> 'metamagic_options') x where x = v_name) into v_known;
    else v_known := v_choices ->> 'metamagic_options' = v_name;
    end if;
    if not v_known then raise exception 'Character does not know %', v_name; end if;
    v_cost := case v_name
      when 'Quickened Spell' then 2
      when 'Heightened Spell' then case when v_ruleset = '2024' then 2 else 3 end
      when 'Seeking Spell' then case when v_ruleset = '2024' then 1 else 2 end
      when 'Twinned Spell' then case when v_ruleset = '2024' then 1 else greatest(p_slot_level, 1) end
      when 'Careful Spell' then 1 when 'Distant Spell' then 1 when 'Empowered Spell' then 1
      when 'Extended Spell' then 1 when 'Subtle Spell' then 1 when 'Transmuted Spell' then 1
      else null end;
    if v_cost is null then raise exception 'Unsupported Metamagic option'; end if;
    -- Arcane Apotheosis makes one option free each turn while Innate Sorcery is active.
    if v_ruleset = '2024' and v_level >= 20 and v_active and not v_free_used
       and (v_turn_key is null or v_choices ->> 'arcane_apotheosis_turn' is distinct from v_turn_key) then
      v_free_used := true;
      if v_turn_key is not null then v_choices := jsonb_set(v_choices, '{arcane_apotheosis_turn}', to_jsonb(v_turn_key), true); end if;
    else v_total := v_total + v_cost;
    end if;
  end loop;
  v_resources := coalesce(v_member.class_resources, '{}'::jsonb);
  v_current := coalesce((v_resources #>> '{sorcery_points,current}')::integer, 0);
  if v_current < v_total then raise exception 'Not enough Sorcery Points'; end if;
  if v_total > 0 then v_resources := jsonb_set(v_resources, '{sorcery_points,current}', to_jsonb(v_current - v_total), false); end if;
  update public.party_members set class_resources = v_resources, class_choices = v_choices where id = v_member.id;

  if p_character_spell_id is not null then
    select * into v_spell from public.character_spells where id = p_character_spell_id and party_member_id = p_party_member_id for update;
    if not found then raise exception 'Innate spell grant not found'; end if;
    if v_spell.source_type = 'class' then raise exception 'Class spell cannot spend an innate use'; end if;
    if v_spell.uses_per_day is not null and coalesce(v_spell.uses_remaining, 0) <= 0 then raise exception 'No innate spell uses remaining'; end if;
  end if;
  v_result := public.cast_character_spell(p_party_member_id, p_slot_level, p_slot_pool,
    p_slot_template, p_concentration_state, null);
  if p_character_spell_id is not null and v_spell.uses_per_day is not null then
    update public.character_spells set uses_remaining = uses_remaining - 1 where id = p_character_spell_id;
    v_result := v_result || jsonb_build_object('uses_remaining', v_spell.uses_remaining - 1);
  end if;
  return v_result || jsonb_build_object('metamagic_cost', v_total, 'arcane_apotheosis_free', v_free_used);
end;
$$;

revoke all on function public.sorcerer_level(public.party_members) from public, anon, authenticated;
revoke all on function public.activate_innate_sorcery(uuid) from public, anon;
revoke all on function public.end_innate_sorcery(uuid) from public, anon;
revoke all on function public.record_sorcerer_rest(uuid, text) from public, anon;
revoke all on function public.restore_sorcery_points(uuid) from public, anon;
revoke all on function public.cast_character_spell_v2(uuid, integer, text, jsonb, jsonb, text[], uuid) from public, anon;
grant execute on function public.activate_innate_sorcery(uuid) to authenticated;
grant execute on function public.end_innate_sorcery(uuid) to authenticated;
grant execute on function public.record_sorcerer_rest(uuid, text) to authenticated;
grant execute on function public.restore_sorcery_points(uuid) to authenticated;
grant execute on function public.cast_character_spell_v2(uuid, integer, text, jsonb, jsonb, text[], uuid) to authenticated;
