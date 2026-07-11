-- Migration: apply_de_level_text_spell_ids
-- Fix apply_de_level (20260711000023): character_spells.spell_id is TEXT (the
-- insert path in apply_level_up uses r->>'spell_id'), but the function declared
-- p_spell_ids as uuid[], so the delete raised "operator does not exist: text =
-- uuid". Drop the uuid[] overload and recreate with text[]. Body otherwise
-- identical. (#526)

drop function if exists apply_de_level(uuid, jsonb, jsonb, uuid[]);

create or replace function apply_de_level(
  p_member_id     uuid,
  p_member_update jsonb,
  p_class_op      jsonb   default null,
  p_spell_ids     text[]  default '{}'::text[]
)
returns void
language plpgsql
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if not exists (
    select 1 from party_members where id = p_member_id and user_id = v_uid
  ) then
    raise exception 'apply_de_level: not authorized for member %', p_member_id
      using errcode = '42501';
  end if;

  update party_members set
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
    class              = case when p_member_update ? 'class'              then p_member_update->>'class'                     else class end,
    subclass           = case when p_member_update ? 'subclass'           then p_member_update->>'subclass'                  else subclass end,
    spell_slots        = case when p_member_update ? 'spell_slots'        then p_member_update->'spell_slots'                else spell_slots end,
    class_resources    = case when p_member_update ? 'class_resources'    then p_member_update->'class_resources'            else class_resources end,
    level_choices      = case when p_member_update ? 'level_choices'      then p_member_update->'level_choices'              else level_choices end
  where id = p_member_id;

  if array_length(p_spell_ids, 1) is not null then
    delete from character_spells
    where party_member_id = p_member_id and spell_id = any(p_spell_ids);
  end if;

  if p_class_op is not null then
    if p_class_op->>'op' = 'delete' then
      delete from character_classes
      where id = (p_class_op->>'id')::uuid and party_member_id = p_member_id;
      if p_class_op ? 'promote_id' then
        update character_classes set is_primary = true
        where id = (p_class_op->>'promote_id')::uuid and party_member_id = p_member_id;
      end if;
    elsif p_class_op->>'op' = 'update' then
      update character_classes set
        levels        = (p_class_op->>'levels')::int,
        subclass_name = case when coalesce((p_class_op->>'clear_subclass')::boolean, false)
                             then null else subclass_name end
      where id = (p_class_op->>'id')::uuid and party_member_id = p_member_id;
    end if;
  end if;
end;
$$;

revoke all on function apply_de_level(uuid, jsonb, jsonb, text[]) from public;
grant execute on function apply_de_level(uuid, jsonb, jsonb, text[]) to authenticated;
