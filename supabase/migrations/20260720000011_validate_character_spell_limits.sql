create or replace function public.character_spell_level(p_spell_id text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select level from public.srd_spells where id = p_spell_id),
    (select level::integer from public.spells where id::text = p_spell_id)
  );
$$;

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
  select coalesce(c.ruleset, '2014') into v_ruleset
  from public.campaigns c where c.id = v_member.campaign_id;

  -- 2024 limits are table-driven and are populated by the versioned class-data
  -- migration. Do not apply 2014 formulas to revised classes in the meantime.
  if v_ruleset = '2024' then return new; end if;

  select caster_type, spells_known, cantrips_known, prepared_ability, prepared_divisor
  into v_caster_type, v_spells_known, v_cantrips_known, v_prepared_ability, v_prepared_divisor
  from public.system_classes where class_name = v_class.class_name limit 1;
  if not found then
    select cc.caster_type, cc.spells_known, cc.cantrips_known, cc.prepared_ability, cc.prepared_divisor
    into v_caster_type, v_spells_known, v_cantrips_known, v_prepared_ability, v_prepared_divisor
    from public.custom_classes cc
    where cc.class_name = v_class.class_name
      and (cc.campaign_id = v_member.campaign_id
           or (cc.campaign_id is null and cc.user_id in (v_member.user_id, v_member.owner_user_id)))
    order by (cc.campaign_id is not null) desc limit 1;
  end if;

  v_spell_level := public.character_spell_level(new.spell_id);
  if v_spell_level = 0 then
    v_limit := v_cantrips_known[least(v_class.levels, 20)];
    if v_limit is null then return new; end if;
    select count(*) into v_existing
    from public.character_spells cs
    where cs.party_member_id = new.party_member_id
      and cs.source_class_id = new.source_class_id
      and cs.source_type = 'class'
      and not cs.always_prepared
      and public.character_spell_level(cs.spell_id) = 0
      and cs.id is distinct from new.id;
    if v_existing >= v_limit then
      raise exception '% can know at most % cantrips at class level %', v_class.class_name, v_limit, v_class.levels;
    end if;
    return new;
  end if;

  if v_caster_type = 'known' then
    v_limit := nullif(v_spells_known ->> (least(v_class.levels, 20) - 1), '')::integer;
    if v_limit is null then return new; end if;
    select count(*) into v_existing
    from public.character_spells cs
    where cs.party_member_id = new.party_member_id
      and cs.source_class_id = new.source_class_id
      and cs.source_type = 'class'
      and not cs.always_prepared
      and public.character_spell_level(cs.spell_id) > 0
      and cs.id is distinct from new.id;
    if v_existing >= v_limit then
      raise exception '% can know at most % leveled spells at class level %', v_class.class_name, v_limit, v_class.levels;
    end if;
  elsif new.is_prepared and v_caster_type in ('prepared', 'spellbook') then
    v_score := case v_prepared_ability
      when 'int' then v_member."int"
      when 'wis' then v_member.wis
      when 'cha' then v_member.cha
      else 10 end;
    v_limit := greatest(1, floor((v_score - 10)::numeric / 2)::integer
      + floor(v_class.levels::numeric / greatest(coalesce(v_prepared_divisor, 1), 1))::integer);
    select count(*) into v_existing
    from public.character_spells cs
    where cs.party_member_id = new.party_member_id
      and cs.source_class_id = new.source_class_id
      and cs.source_type = 'class'
      and cs.is_prepared
      and not cs.always_prepared
      and public.character_spell_level(cs.spell_id) > 0
      and cs.id is distinct from new.id;
    if v_existing >= v_limit then
      raise exception '% can prepare at most % spells at class level %', v_class.class_name, v_limit, v_class.levels;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists character_spells_validate_limits on public.character_spells;
create trigger character_spells_validate_limits
  before insert or update of party_member_id, spell_id, source_type, source_class_id, is_prepared, always_prepared
  on public.character_spells
  for each row execute function public.validate_character_spell_limits();

revoke all on function public.character_spell_level(text) from public, anon, authenticated;
revoke all on function public.validate_character_spell_limits() from public, anon, authenticated;
