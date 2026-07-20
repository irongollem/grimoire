-- Record every successful cast in the same transaction and bind post-roll
-- Metamagic to that exact cast. Also close the slot-level-zero API bypass by
-- validating ritual eligibility server-side.

-- Later migrations backfill and constrain these references, but casting and
-- level-up functions in this migration group already compile against them.
-- Add them up front so a clean migration run never depends on deferred
-- PL/pgSQL statement planning.
alter table public.character_classes
  add column if not exists class_definition_id uuid,
  add column if not exists class_definition_kind text,
  add column if not exists subclass_definition_id uuid;

create table if not exists public.spell_cast_records (
  id uuid primary key default gen_random_uuid(),
  party_member_id uuid not null references public.party_members(id) on delete cascade,
  character_spell_id uuid references public.character_spells(id) on delete set null,
  spell_id text not null,
  spell_name text not null,
  cast_level integer not null check (cast_level between 0 and 9),
  slot_pool text not null check (slot_pool in ('spellcasting', 'pact', 'temporary', 'feature')),
  cast_method text not null check (cast_method in ('slot', 'ritual', 'at_will', 'feature')),
  metamagic_names text[] not null default '{}'::text[],
  metamagic_choices jsonb not null default '{}'::jsonb,
  concentration_state jsonb,
  turn_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists spell_cast_records_member_created_idx
  on public.spell_cast_records(party_member_id, created_at desc);
create index if not exists spell_cast_records_character_spell_idx
  on public.spell_cast_records(character_spell_id);

create trigger spell_cast_records_updated_at
  before update on spell_cast_records
  for each row execute procedure update_updated_at();

-- Deliberately select-only: every row is written by a validating SECURITY
-- DEFINER RPC (cast_character_spell_v4 and its Metamagic reactive path).
-- A client-facing insert/update/delete policy would let a player forge or
-- edit their own cast history directly.
alter table public.spell_cast_records enable row level security;
create policy spell_cast_records_select on public.spell_cast_records for select using (
  exists (
    select 1 from public.party_members pm where pm.id = spell_cast_records.party_member_id
      and (pm.user_id = (select auth.uid()) or pm.owner_user_id = (select auth.uid())
        or private.is_campaign_dm(pm.campaign_id)
        or exists (select 1 from public.campaign_members cm
          where cm.user_id = (select auth.uid()) and cm.party_member_id = pm.id))
  )
);
revoke all on table public.spell_cast_records from anon;
grant select on table public.spell_cast_records to authenticated;
grant all on table public.spell_cast_records to service_role;

-- character_spells.spell_id stores either a spells.id (uuid) cast to text or
-- an srd_spells slug, so every join/lookup below compares id::text. Without
-- this expression index those comparisons cannot use the primary key index.
create index if not exists spells_id_text_idx on public.spells ((id::text));

-- Every casting/Metamagic surface needs to agree on the identity of "this
-- turn". Encapsulate the latest-running-encounter lookup once instead of
-- copying it into each casting transaction (see 20260720000038, ...39).
create or replace function private.active_turn_key(p_campaign_id uuid)
returns text language sql stable set search_path = public as $$
  select es.id::text || ':' || es.current_round::text || ':' || es.active_combatant_index::text
  from public.encounter_state es
  where es.campaign_id = p_campaign_id and es.is_running
  order by es.updated_at desc limit 1;
$$;
revoke all on function private.active_turn_key(uuid) from public, anon;
grant execute on function private.active_turn_key(uuid) to authenticated, service_role;

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
  v_spell record;
  v_parent public.spell_cast_records%rowtype;
  v_ruleset text;
  v_class_name text;
  v_caster_type text;
  v_ready boolean;
  v_method text;
  v_result jsonb;
  v_cast_id uuid;
  v_name text;
  v_turn_key text;
begin
  select * into v_member from public.party_members where id = p_party_member_id for update;
  if not found then raise exception 'Party member not found'; end if;
  if not (v_member.user_id = (select auth.uid()) or v_member.owner_user_id = (select auth.uid())
    or private.is_campaign_dm(v_member.campaign_id)
    or exists (select 1 from public.campaign_members cm
      where cm.user_id = (select auth.uid()) and cm.party_member_id = v_member.id))
  then raise exception 'Access denied'; end if;
  if p_character_spell_id is null then raise exception 'Casting requires an exact character spell'; end if;

  select * into v_grant from public.character_spells
    where id = p_character_spell_id and party_member_id = p_party_member_id for update;
  if not found then raise exception 'Character spell not found'; end if;
  select * into v_spell from (
    select id::text as id, name, level, ritual from public.spells where id::text = v_grant.spell_id
    union all
    select id, name, level, ritual from public.srd_spells where id = v_grant.spell_id
  ) resolved_spell limit 1;
  if not found then raise exception 'Spell content version not found'; end if;
  select coalesce(c.ruleset, '2014') into v_ruleset from public.campaigns c where c.id = v_member.campaign_id;
  v_turn_key := private.active_turn_key(v_member.campaign_id);

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
    if coalesce(array_length(p_metamagic_names, 1), 0) <> 1
      or p_metamagic_names[1] not in ('Empowered Spell', 'Seeking Spell') then
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
    v_name := p_metamagic_names[1];
    if v_name = any(v_parent.metamagic_names) then raise exception '% was already used on this cast', v_name; end if;
    if coalesce(array_length(v_parent.metamagic_names, 1), 0) >= 2 then
      raise exception 'A spell cannot have more than two Metamagic options';
    end if;

    v_result := public.cast_character_spell_v3(
      p_party_member_id, 0, p_slot_pool, p_slot_template, null,
      p_metamagic_names, p_character_spell_id, p_metamagic_choices
    );
    update public.spell_cast_records set
      metamagic_names = array_append(metamagic_names, v_name),
      metamagic_choices = metamagic_choices || coalesce(p_metamagic_choices, '{}'::jsonb)
    where id = v_parent.id;
    return v_result || jsonb_build_object('cast_id', v_parent.id, 'reactive', true);
  end if;

  if exists (select 1 from unnest(coalesce(p_metamagic_names, '{}'::text[])) name
    where name in ('Empowered Spell', 'Seeking Spell')) then
    raise exception 'Empowered Spell and Seeking Spell must be applied after their roll';
  end if;

  if v_grant.source_type <> 'class' and p_slot_level = 0 then
    v_method := 'feature';
  elsif v_spell.level = 0 then
    if p_slot_level <> 0 then raise exception 'Cantrips do not spend spell slots'; end if;
    v_method := 'at_will';
  elsif p_slot_level = 0 then
    if not v_spell.ritual then raise exception 'This spell does not have the Ritual tag'; end if;
    v_ready := v_grant.is_prepared or v_grant.always_prepared;
    if v_ruleset = '2024' then
      if v_class_name = 'Wizard' and coalesce(v_class.class_definition_kind, 'system') = 'system'
        and v_grant.is_known then null;
      elsif not v_ready then raise exception '2024 ritual casting requires the spell to be prepared'; end if;
    elsif v_class_name = 'Wizard' and coalesce(v_class.class_definition_kind, 'system') = 'system' then
      if not v_grant.is_known then raise exception 'Wizard ritual must be in the spellbook'; end if;
    elsif v_class_name = 'Bard' and coalesce(v_class.class_definition_kind, 'system') = 'system' then null;
    elsif coalesce(v_class.class_definition_kind, 'system') <> 'system'
      or v_class_name not in ('Artificer', 'Cleric', 'Druid') or not v_ready then
      raise exception '% cannot ritual-cast this spell under 2014 rules', v_class_name;
    end if;
    v_method := 'ritual';
  else
    if p_slot_level < v_spell.level then raise exception 'Cast slot cannot be below the spell level'; end if;
    v_method := 'slot';
  end if;

  v_result := public.cast_character_spell_v3(
    p_party_member_id, p_slot_level, p_slot_pool, p_slot_template, p_concentration_state,
    p_metamagic_names, p_character_spell_id, p_metamagic_choices
  );
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

-- All client casting must pass through V4; older helpers remain callable only
-- from the security-definer implementation above.
revoke execute on function public.cast_character_spell_v3(uuid, integer, text, jsonb, jsonb, text[], uuid, jsonb) from authenticated;
revoke execute on function public.cast_character_spell_v2(uuid, integer, text, jsonb, jsonb, text[], uuid) from authenticated;
revoke execute on function public.cast_character_spell(uuid, integer, text, jsonb, jsonb, text) from authenticated;
revoke execute on function public.cast_character_spell(uuid, integer, text, jsonb, jsonb, text, uuid) from authenticated;
