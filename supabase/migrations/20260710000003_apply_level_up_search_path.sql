-- Migration: apply_level_up_search_path
-- Pin a stable search_path on apply_level_up (fixes the function_search_path_mutable
-- security-advisor warning introduced by 20260710000002). Re-creates the function
-- with `set search_path = ''` and fully schema-qualified table references. pg_catalog
-- is always implicitly searched, so jsonb_array_elements* / array() still resolve, and
-- auth.uid() is already schema-qualified. Behaviour is otherwise identical.

create or replace function apply_level_up(
  p_member_id      uuid,
  p_member_update  jsonb,
  p_class_op       jsonb  default null,
  p_spell_rows     jsonb  default '[]'::jsonb
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if not exists (
    select 1 from public.party_members
    where id = p_member_id and user_id = v_uid
  ) then
    raise exception 'apply_level_up: not authorized for member %', p_member_id
      using errcode = '42501';
  end if;

  update public.party_members set
    level              = case when p_member_update ? 'level'              then (p_member_update->>'level')::int              else level end,
    proficiency_bonus  = case when p_member_update ? 'proficiency_bonus'  then (p_member_update->>'proficiency_bonus')::int  else proficiency_bonus end,
    max_hp             = case when p_member_update ? 'max_hp'             then (p_member_update->>'max_hp')::int             else max_hp end,
    current_hp         = case when p_member_update ? 'current_hp'         then (p_member_update->>'current_hp')::int         else current_hp end,
    hit_dice_remaining = case when p_member_update ? 'hit_dice_remaining' then (p_member_update->>'hit_dice_remaining')::int else hit_dice_remaining end,
    str                = case when p_member_update ? 'str'                then (p_member_update->>'str')::int                else str end,
    dex                = case when p_member_update ? 'dex'                then (p_member_update->>'dex')::int                else dex end,
    con                = case when p_member_update ? 'con'                then (p_member_update->>'con')::int                else con end,
    "int"              = case when p_member_update ? 'int'                then (p_member_update->>'int')::int                else "int" end,
    wis                = case when p_member_update ? 'wis'                then (p_member_update->>'wis')::int                else wis end,
    cha                = case when p_member_update ? 'cha'                then (p_member_update->>'cha')::int                else cha end,
    subclass           = case when p_member_update ? 'subclass'           then p_member_update->>'subclass'                  else subclass end,
    spell_slots        = case when p_member_update ? 'spell_slots'        then p_member_update->'spell_slots'                else spell_slots end,
    class_resources    = case when p_member_update ? 'class_resources'    then p_member_update->'class_resources'            else class_resources end,
    class_choices      = case when p_member_update ? 'class_choices'      then p_member_update->'class_choices'              else class_choices end,
    level_choices      = case when p_member_update ? 'level_choices'      then p_member_update->'level_choices'              else level_choices end,
    tool_proficiencies = case when p_member_update ? 'tool_proficiencies'
                              then array(select jsonb_array_elements_text(p_member_update->'tool_proficiencies'))
                              else tool_proficiencies end
  where id = p_member_id;

  if p_class_op is not null then
    if p_class_op->>'op' = 'add' then
      insert into public.character_classes
        (party_member_id, class_name, subclass_name, levels, is_primary, hit_dice_used, sort_order)
      values (
        p_member_id,
        p_class_op->>'class_name',
        p_class_op->>'subclass_name',
        (p_class_op->>'levels')::int,
        coalesce((p_class_op->>'is_primary')::boolean, false),
        coalesce((p_class_op->>'hit_dice_used')::int, 0),
        coalesce((p_class_op->>'sort_order')::int, 0)
      );
    elsif p_class_op->>'op' = 'update' then
      update public.character_classes set
        levels        = (p_class_op->>'levels')::int,
        subclass_name = case when p_class_op ? 'subclass_name'
                             then p_class_op->>'subclass_name' else subclass_name end
      where id = (p_class_op->>'id')::uuid
        and party_member_id = p_member_id;
    end if;
  end if;

  insert into public.character_spells
    (party_member_id, spell_id, is_known, is_prepared, always_prepared,
     source_type, source_label, uses_per_day, uses_remaining, resets_on)
  select
    p_member_id,
    r->>'spell_id',
    coalesce((r->>'is_known')::boolean, true),
    coalesce((r->>'is_prepared')::boolean, false),
    coalesce((r->>'always_prepared')::boolean, false),
    coalesce(r->>'source_type', 'class'),
    r->>'source_label',
    nullif(r->>'uses_per_day', '')::int,
    nullif(r->>'uses_remaining', '')::int,
    nullif(r->>'resets_on', '')
  from jsonb_array_elements(coalesce(p_spell_rows, '[]'::jsonb)) as r
  on conflict (party_member_id, spell_id, source_type) do nothing;
end;
$$;

revoke all on function apply_level_up(uuid, jsonb, jsonb, jsonb) from public;
grant execute on function apply_level_up(uuid, jsonb, jsonb, jsonb) to authenticated;
