-- Migration: apply_level_up_atomic
-- Level-up applied its changes with 7+ separate client writes across three
-- tables (party_members, character_classes, character_spells). A failure or a
-- user bailing mid-sequence left a half-leveled character (e.g. level bumped on
-- party_members but character_classes never incremented, or spells never added,
-- or level_choices never written). This function performs the entire single
-- level-up in one transaction (a plpgsql body is atomic) so it is all-or-nothing.
--
-- SECURITY INVOKER (default): the caller's RLS still applies to every
-- update/insert, so a user can only mutate their own character. An explicit
-- ownership guard up front turns a would-be silent 0-row update into a clear
-- error. Mirrors the craft_apply atomic pattern (20260613000002).

create or replace function apply_level_up(
  p_member_id      uuid,
  p_member_update  jsonb,
  p_class_op       jsonb  default null,
  p_spell_rows     jsonb  default '[]'::jsonb
)
returns void
language plpgsql
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  -- Ownership guard: the SELECT policy already scopes to owned/visible members,
  -- so this also fails cleanly for a member the caller cannot see.
  if not exists (
    select 1 from party_members
    where id = p_member_id and user_id = v_uid
  ) then
    raise exception 'apply_level_up: not authorized for member %', p_member_id
      using errcode = '42501';
  end if;

  -- 1) party_members: only keys present in p_member_update are touched; the rest
  -- keep their current values. The client sends final (already-merged) values
  -- for jsonb columns (spell_slots / class_resources / class_choices /
  -- level_choices) and new totals for ability scores.
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
    subclass           = case when p_member_update ? 'subclass'           then p_member_update->>'subclass'                  else subclass end,
    spell_slots        = case when p_member_update ? 'spell_slots'        then p_member_update->'spell_slots'                else spell_slots end,
    class_resources    = case when p_member_update ? 'class_resources'    then p_member_update->'class_resources'            else class_resources end,
    class_choices      = case when p_member_update ? 'class_choices'      then p_member_update->'class_choices'              else class_choices end,
    level_choices      = case when p_member_update ? 'level_choices'      then p_member_update->'level_choices'              else level_choices end,
    tool_proficiencies = case when p_member_update ? 'tool_proficiencies'
                              then array(select jsonb_array_elements_text(p_member_update->'tool_proficiencies'))
                              else tool_proficiencies end
  where id = p_member_id;

  -- 2) character_classes: add a new class entry or bump the leveled one.
  if p_class_op is not null then
    if p_class_op->>'op' = 'add' then
      insert into character_classes
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
      update character_classes set
        levels        = (p_class_op->>'levels')::int,
        subclass_name = case when p_class_op ? 'subclass_name'
                             then p_class_op->>'subclass_name' else subclass_name end
      where id = (p_class_op->>'id')::uuid
        and party_member_id = p_member_id;
    end if;
  end if;

  -- 3) character_spells: insert every spell row the level-up grants (picked
  -- spells/cantrips, subclass-granted always-prepared spells, invocation
  -- grants). ON CONFLICT DO NOTHING dedupes against the (member, spell, source)
  -- unique index, matching the prior upsert/skip behaviour.
  insert into character_spells
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
