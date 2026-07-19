-- Backfill class sources only when there is exactly one unambiguous class.
update public.character_spells cs
set source_class_id = (
  select cc.id
  from public.character_classes cc
  where cc.party_member_id = cs.party_member_id
  limit 1
)
where cs.source_type = 'class'
  and cs.source_class_id is null
  and (select count(*) from public.character_classes cc where cc.party_member_id = cs.party_member_id) = 1;

create or replace function public.validate_character_spell_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class public.character_classes%rowtype;
  v_spell_level integer;
  v_spell_classes text[];
  v_spell_slots jsonb;
  v_cantrips_known integer[];
  v_row jsonb;
  v_max_spell_level integer := 0;
  v_index integer;
begin
  if new.source_type <> 'class' then
    if new.source_class_id is not null then
      raise exception 'Non-class spell grants cannot reference a source class';
    end if;
    return new;
  end if;

  if new.source_class_id is null then
    raise exception 'Class spells require a source class';
  end if;

  select * into v_class
  from public.character_classes
  where id = new.source_class_id
    and party_member_id = new.party_member_id;
  if not found then
    raise exception 'Spell source class does not belong to this character';
  end if;

  select level, classes into v_spell_level, v_spell_classes
  from public.srd_spells where id = new.spell_id;
  if not found then
    select level, classes into v_spell_level, v_spell_classes
    from public.spells where id::text = new.spell_id;
  end if;
  if not found then
    raise exception 'Spell does not exist';
  end if;

  if not new.always_prepared and not (v_class.class_name = any(coalesce(v_spell_classes, '{}'::text[]))) then
    raise exception '% is not on the % spell list', new.spell_id, v_class.class_name;
  end if;

  select spell_slots, cantrips_known into v_spell_slots, v_cantrips_known
  from public.system_classes where class_name = v_class.class_name limit 1;
  if not found then
    select spell_slots, cantrips_known into v_spell_slots, v_cantrips_known
    from public.custom_classes cc
    join public.party_members pm on pm.id = new.party_member_id
    where cc.class_name = v_class.class_name
      and (cc.campaign_id = pm.campaign_id or (cc.campaign_id is null and cc.user_id in (pm.user_id, pm.owner_user_id)))
    order by (cc.campaign_id is not null) desc limit 1;
  end if;
  if not found or v_spell_slots is null then
    raise exception '% is not configured as a spellcasting class', v_class.class_name;
  end if;

  if v_spell_level = 0 then
    if v_cantrips_known is null and not new.always_prepared then
      raise exception '% does not have a cantrip progression', v_class.class_name;
    end if;
    return new;
  end if;

  v_row := v_spell_slots -> (least(v_class.levels, 20) - 1);
  if v_row is null or jsonb_typeof(v_row) <> 'array' then
    raise exception 'Missing spell-slot progression for % level %', v_class.class_name, v_class.levels;
  end if;
  for v_index in 0..least(jsonb_array_length(v_row), 9) - 1 loop
    if coalesce((v_row ->> v_index)::integer, 0) > 0 then
      v_max_spell_level := v_index + 1;
    end if;
  end loop;
  if v_spell_level > v_max_spell_level then
    raise exception 'A level-% % cannot acquire a level-% spell', v_class.levels, v_class.class_name, v_spell_level;
  end if;

  return new;
end;
$$;

drop trigger if exists character_spells_validate_source on public.character_spells;
create trigger character_spells_validate_source
  before insert or update of party_member_id, spell_id, source_type, source_class_id, always_prepared
  on public.character_spells
  for each row execute function public.validate_character_spell_source();

revoke all on function public.validate_character_spell_source() from public, anon, authenticated;
