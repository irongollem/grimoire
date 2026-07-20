create table if not exists public.class_spellcasting_policies (
  ruleset text not null check (ruleset in ('2014', '2024')),
  class_name text not null,
  caster_type text not null check (caster_type in ('prepared', 'known', 'spellbook', 'none')),
  prepared_limit integer[],
  cantrip_limit integer[],
  max_spell_level integer[] not null,
  change_timing text not null check (change_timing in ('level_up', 'long_rest')),
  change_count integer check (change_count is null or change_count > 0),
  source_revision text not null,
  source_url text not null,
  primary key (ruleset, class_name),
  check (cardinality(max_spell_level) = 20),
  check (prepared_limit is null or cardinality(prepared_limit) = 20),
  check (cantrip_limit is null or cardinality(cantrip_limit) = 20)
);

alter table public.class_spellcasting_policies enable row level security;
create policy "class_spellcasting_policies_select" on public.class_spellcasting_policies
  for select using (true);
create policy "class_spellcasting_policies_admin_write" on public.class_spellcasting_policies
  for all using (private.is_app_admin()) with check (private.is_app_admin());

insert into public.class_spellcasting_policies
  (ruleset, class_name, caster_type, prepared_limit, cantrip_limit,
   max_spell_level, change_timing, change_count, source_revision, source_url)
values
  ('2024', 'Bard', 'prepared',
   array[4,5,6,7,9,10,11,12,14,15,16,16,17,17,18,18,19,20,21,22],
   array[2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4],
   array[1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,9,9],
   'level_up', 1, 'SRD 5.2', 'https://www.dndbeyond.com/sources/dnd/br-2024/character-classes'),
  ('2024', 'Cleric', 'prepared',
   array[4,5,6,7,9,10,11,12,14,15,16,16,17,17,18,18,19,20,21,22],
   array[3,3,3,4,4,4,4,4,4,5,5,5,5,5,5,5,5,5,5,5],
   array[1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,9,9],
   'long_rest', null, 'SRD 5.2', 'https://www.dndbeyond.com/sources/dnd/br-2024/character-classes'),
  ('2024', 'Druid', 'prepared',
   array[4,5,6,7,9,10,11,12,14,15,16,16,17,17,18,18,19,20,21,22],
   array[2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4],
   array[1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,9,9],
   'long_rest', null, 'SRD 5.2', 'https://www.dndbeyond.com/sources/dnd/br-2024/character-classes'),
  ('2024', 'Paladin', 'prepared',
   array[2,3,4,5,6,6,7,7,9,9,10,10,11,11,12,12,14,14,15,15], null,
   array[1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5],
   'long_rest', 1, 'SRD 5.2', 'https://www.dndbeyond.com/sources/dnd/br-2024/character-classes'),
  ('2024', 'Ranger', 'prepared',
   array[2,3,4,5,6,6,7,7,9,9,10,10,11,11,12,12,14,14,15,15], null,
   array[1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5],
   'long_rest', 1, 'SRD 5.2', 'https://www.dndbeyond.com/sources/dnd/br-2024/character-classes'),
  ('2024', 'Sorcerer', 'prepared',
   array[2,4,6,7,9,10,11,12,14,15,16,16,17,17,18,18,19,20,21,22],
   array[4,4,4,5,5,5,5,5,5,6,6,6,6,6,6,6,6,6,6,6],
   array[1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,9,9],
   'level_up', 1, 'SRD 5.2', 'https://www.dndbeyond.com/sources/dnd/br-2024/character-classes'),
  ('2024', 'Warlock', 'prepared',
   array[2,3,4,5,6,7,8,9,10,10,11,11,12,12,13,13,14,14,15,15],
   array[2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4],
   array[1,1,2,2,3,3,4,4,5,5,5,5,5,5,5,5,5,5,5,5],
   'level_up', 1, 'SRD 5.2', 'https://www.dndbeyond.com/sources/dnd/br-2024/character-classes'),
  ('2024', 'Wizard', 'spellbook',
   array[4,5,6,7,9,10,11,12,14,15,16,16,17,18,19,21,22,23,24,25],
   array[3,3,3,4,4,4,4,4,4,5,5,5,5,5,5,5,5,5,5,5],
   array[1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,9,9],
   'long_rest', null, 'SRD 5.2', 'https://www.dndbeyond.com/sources/dnd/br-2024/character-classes')
on conflict (ruleset, class_name) do update set
  caster_type = excluded.caster_type,
  prepared_limit = excluded.prepared_limit,
  cantrip_limit = excluded.cantrip_limit,
  max_spell_level = excluded.max_spell_level,
  change_timing = excluded.change_timing,
  change_count = excluded.change_count,
  source_revision = excluded.source_revision,
  source_url = excluded.source_url;

-- Replace the acquisition validator so revised half-casters can acquire level-1
-- spells at class level 1 and all standard classes use explicit edition data.
create or replace function public.validate_character_spell_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class public.character_classes%rowtype;
  v_member public.party_members%rowtype;
  v_spell_level integer;
  v_spell_classes text[];
  v_spell_slots jsonb;
  v_cantrips_known integer[];
  v_policy public.class_spellcasting_policies%rowtype;
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

  select level, classes into v_spell_level, v_spell_classes from public.srd_spells where id = new.spell_id;
  if not found then
    select level, classes into v_spell_level, v_spell_classes from public.spells where id::text = new.spell_id;
  end if;
  if not found then raise exception 'Spell does not exist'; end if;
  if not new.always_prepared and not (v_class.class_name = any(coalesce(v_spell_classes, '{}'::text[]))) then
    raise exception '% is not on the % spell list', new.spell_id, v_class.class_name;
  end if;

  select p.* into v_policy
  from public.class_spellcasting_policies p
  join public.campaigns c on c.id = v_member.campaign_id
  where p.ruleset = coalesce(c.ruleset, '2014') and p.class_name = v_class.class_name;

  if found then
    if v_spell_level = 0 and v_policy.cantrip_limit is null and not new.always_prepared then
      raise exception '% does not have a cantrip progression', v_class.class_name;
    end if;
    v_max_spell_level := v_policy.max_spell_level[least(v_class.levels, 20)];
  else
    select spell_slots, cantrips_known into v_spell_slots, v_cantrips_known
    from public.system_classes where class_name = v_class.class_name limit 1;
    if not found then
      select spell_slots, cantrips_known into v_spell_slots, v_cantrips_known
      from public.custom_classes cc where cc.class_name = v_class.class_name
        and (cc.campaign_id = v_member.campaign_id or (cc.campaign_id is null and cc.user_id in (v_member.user_id, v_member.owner_user_id)))
      order by (cc.campaign_id is not null) desc limit 1;
    end if;
    if not found or v_spell_slots is null then raise exception '% is not configured as a spellcasting class', v_class.class_name; end if;
    if v_spell_level = 0 then
      if v_cantrips_known is null and not new.always_prepared then raise exception '% does not have a cantrip progression', v_class.class_name; end if;
      return new;
    end if;
    v_row := v_spell_slots -> (least(v_class.levels, 20) - 1);
    if v_row is null or jsonb_typeof(v_row) <> 'array' then raise exception 'Missing spell-slot progression for % level %', v_class.class_name, v_class.levels; end if;
    for v_index in 0..least(jsonb_array_length(v_row), 9) - 1 loop
      if coalesce((v_row ->> v_index)::integer, 0) > 0 then v_max_spell_level := v_index + 1; end if;
    end loop;
  end if;

  if v_spell_level > 0 and v_spell_level > v_max_spell_level then
    raise exception 'A level-% % cannot acquire a level-% spell', v_class.levels, v_class.class_name, v_spell_level;
  end if;
  return new;
end;
$$;

-- Replace the limit validator with table-driven revised-class behavior.
create or replace function public.validate_character_spell_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class public.character_classes%rowtype;
  v_member public.party_members%rowtype;
  v_ruleset text;
  v_policy public.class_spellcasting_policies%rowtype;
  v_caster_type text;
  v_spells_known jsonb;
  v_cantrips_known integer[];
  v_prepared_ability text;
  v_prepared_divisor integer;
  v_has_policy boolean;
  v_spell_level integer;
  v_limit integer;
  v_existing integer;
  v_score integer;
begin
  if new.source_type <> 'class' or new.always_prepared then return new; end if;
  select * into strict v_class from public.character_classes where id = new.source_class_id;
  select * into strict v_member from public.party_members where id = new.party_member_id;
  select coalesce(c.ruleset, '2014') into v_ruleset from public.campaigns c where c.id = v_member.campaign_id;
  select * into v_policy from public.class_spellcasting_policies
    where ruleset = v_ruleset and class_name = v_class.class_name;
  v_has_policy := found;
  v_spell_level := public.character_spell_level(new.spell_id);

  if v_has_policy then
    if v_spell_level = 0 then
      v_limit := v_policy.cantrip_limit[least(v_class.levels, 20)];
    else
      v_limit := v_policy.prepared_limit[least(v_class.levels, 20)];
      if v_policy.caster_type <> 'spellbook' then new.is_prepared := true; end if;
      if v_policy.caster_type = 'spellbook' and not new.is_prepared then return new; end if;
    end if;
    if v_limit is null then return new; end if;
    select count(*) into v_existing from public.character_spells cs
    where cs.party_member_id = new.party_member_id
      and cs.source_class_id = new.source_class_id
      and cs.source_type = 'class' and not cs.always_prepared
      and ((v_spell_level = 0 and public.character_spell_level(cs.spell_id) = 0)
        or (v_spell_level > 0 and public.character_spell_level(cs.spell_id) > 0))
      and (v_spell_level = 0 or v_policy.caster_type <> 'spellbook' or cs.is_prepared)
      and cs.id is distinct from new.id;
    if v_existing >= v_limit then
      raise exception '% can prepare at most % % at class level %', v_class.class_name, v_limit,
        case when v_spell_level = 0 then 'cantrips' else 'spells' end, v_class.levels;
    end if;
    return new;
  end if;

  select caster_type, spells_known, cantrips_known, prepared_ability, prepared_divisor
  into v_caster_type, v_spells_known, v_cantrips_known, v_prepared_ability, v_prepared_divisor
  from public.system_classes where class_name = v_class.class_name limit 1;
  if not found then
    select cc.caster_type, cc.spells_known, cc.cantrips_known, cc.prepared_ability, cc.prepared_divisor
    into v_caster_type, v_spells_known, v_cantrips_known, v_prepared_ability, v_prepared_divisor
    from public.custom_classes cc where cc.class_name = v_class.class_name
      and (cc.campaign_id = v_member.campaign_id or (cc.campaign_id is null and cc.user_id in (v_member.user_id, v_member.owner_user_id)))
    order by (cc.campaign_id is not null) desc limit 1;
  end if;
  if v_spell_level = 0 then
    v_limit := v_cantrips_known[least(v_class.levels, 20)];
  elsif v_caster_type = 'known' then
    v_limit := nullif(v_spells_known ->> (least(v_class.levels, 20) - 1), '')::integer;
  elsif new.is_prepared and v_caster_type in ('prepared', 'spellbook') then
    v_score := case v_prepared_ability when 'int' then v_member."int" when 'wis' then v_member.wis when 'cha' then v_member.cha else 10 end;
    v_limit := greatest(1, floor((v_score - 10)::numeric / 2)::integer + floor(v_class.levels::numeric / greatest(coalesce(v_prepared_divisor, 1), 1))::integer);
  else return new;
  end if;
  if v_limit is null then return new; end if;
  select count(*) into v_existing from public.character_spells cs
  where cs.party_member_id = new.party_member_id and cs.source_class_id = new.source_class_id
    and cs.source_type = 'class' and not cs.always_prepared
    and ((v_spell_level = 0 and public.character_spell_level(cs.spell_id) = 0)
      or (v_spell_level > 0 and public.character_spell_level(cs.spell_id) > 0))
    and (v_spell_level = 0 or v_caster_type = 'known' or cs.is_prepared)
    and cs.id is distinct from new.id;
  if v_existing >= v_limit then raise exception '% spell limit of % reached', v_class.class_name, v_limit; end if;
  return new;
end;
$$;

revoke all on function public.validate_character_spell_source() from public, anon, authenticated;
revoke all on function public.validate_character_spell_limits() from public, anon, authenticated;
