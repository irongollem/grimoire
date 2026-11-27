-- Migration: persist_feat_spell_casting_ability
-- Store feat-granted spell casting abilities written through apply_level_up.

CREATE OR REPLACE FUNCTION public.apply_level_up(p_member_id uuid, p_member_update jsonb, p_class_op jsonb DEFAULT NULL::jsonb, p_spell_rows jsonb DEFAULT '[]'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_source_class_id uuid;
  v_class_name text;
  v_old_class_level integer;
  v_new_class_level integer;
  v_old_member_level integer;
  v_required_spells integer;
  v_required_cantrips integer;
  v_submitted_spells integer;
  v_submitted_cantrips integer;
  v_definition_id uuid;
  v_definition_kind text;
  v_member public.party_members%rowtype;
  v_bad_feat text;
begin
  select * into v_member from public.party_members
  where id = p_member_id
    and (owner_user_id = v_uid or (owner_user_id is null and user_id = v_uid) or private.is_campaign_dm(campaign_id));
  if not found then
    raise exception 'apply_level_up: not authorized for member %', p_member_id using errcode = '42501';
  end if;
  v_old_member_level := v_member.level;
  if p_member_update is null or not (p_member_update ? 'level')
     or (p_member_update->>'level')::integer is distinct from v_old_member_level + 1 then
    raise exception 'apply_level_up: member level must increase by exactly one';
  end if;
  if p_class_op is null then
    raise exception 'apply_level_up: a source class operation is required';
  end if;

  -- Every feat the level adds must be a feat of the character's edition that
  -- its owner or its table may use. Which ones were added is the new list
  -- minus the old, counted, so a repeatable feat taken again is checked too.
  -- This keeps the level-up honest; it is not the access boundary (whoever may
  -- call this may also write class_choices directly). The approval review is:
  -- it benches a character holding a feat its table has not approved.
  if p_member_update ? 'class_choices' then
    select added.id into v_bad_feat
      from (
        select n.id from jsonb_array_elements_text(
          case when jsonb_typeof(p_member_update -> 'class_choices' -> 'feats') = 'array'
               then p_member_update -> 'class_choices' -> 'feats' else '[]'::jsonb end) with ordinality n(id, ord)
        except all
        select o.id from jsonb_array_elements_text(
          case when jsonb_typeof(v_member.class_choices -> 'feats') = 'array'
               then v_member.class_choices -> 'feats' else '[]'::jsonb end) with ordinality o(id, ord)
      ) added
     where not exists (
       select 1 from public.class_features f
        where f.id = private.try_uuid(added.id)
          and f.kind = 'feat'
          and (f.ruleset is null or f.ruleset = v_member.ruleset)
          and (f.user_id is null
               or f.user_id = coalesce(v_member.owner_user_id, v_member.user_id)
               or (v_member.campaign_id is not null and private.is_table_dm(v_member.campaign_id, f.user_id)
                   and (f.campaign_id is null or f.campaign_id = v_member.campaign_id))))
     limit 1;
    if v_bad_feat is not null then
      raise exception 'apply_level_up: % is not a feat this character can take', v_bad_feat using errcode = '22023';
    end if;
  end if;

  if p_class_op->>'op' = 'add' then
    v_class_name := nullif(p_class_op->>'class_name', '');
    v_definition_id := nullif(p_class_op->>'class_definition_id', '')::uuid;
    v_definition_kind := nullif(p_class_op->>'class_definition_kind', '');
    v_new_class_level := (p_class_op->>'levels')::integer;
    -- A character's first class row carries its whole new level (a character
    -- with no class takes its first one here). A further class starts at one.
    if exists (select 1 from public.character_classes where party_member_id = p_member_id)
       and v_new_class_level <> 1 then
      raise exception 'apply_level_up: a new multiclass must start at level one';
    end if;
  elsif p_class_op->>'op' = 'update' then
    v_source_class_id := (p_class_op->>'id')::uuid;
    select class_name, levels, class_definition_id, class_definition_kind
      into v_class_name, v_old_class_level, v_definition_id, v_definition_kind
    from public.character_classes where id = v_source_class_id and party_member_id = p_member_id;
    if not found then raise exception 'apply_level_up: source class not found'; end if;
    v_new_class_level := (p_class_op->>'levels')::integer;
    if v_new_class_level <> v_old_class_level + 1 then
      raise exception 'apply_level_up: class level must increase by exactly one';
    end if;
  else
    raise exception 'apply_level_up: invalid class operation';
  end if;
  if v_class_name is null then raise exception 'apply_level_up: class name is required'; end if;

  select spell_count, cantrip_count into v_required_spells, v_required_cantrips
  from public.required_level_up_spell_choices(
    p_member_id, v_class_name, v_new_class_level, v_definition_kind, v_definition_id,
    -- The subclass this level leaves the row with: one chosen now counts already
    -- (an Eldritch Knight learns its first spells at the level it is chosen).
    case when p_class_op ? 'subclass_name'
      then nullif(p_class_op->>'subclass_definition_id', '')::uuid
      else (select cc.subclass_definition_id from public.character_classes cc
             where cc.id = v_source_class_id and cc.party_member_id = p_member_id) end
  );
  select
    count(distinct r->>'spell_id') filter (where public.character_spell_level(r->>'spell_id') > 0),
    count(distinct r->>'spell_id') filter (where public.character_spell_level(r->>'spell_id') = 0)
  into v_submitted_spells, v_submitted_cantrips
  from jsonb_array_elements(coalesce(p_spell_rows, '[]'::jsonb)) r
  where coalesce(r->>'source_type', 'class') = 'class'
    and not coalesce((r->>'always_prepared')::boolean, false);
  if v_submitted_spells <> v_required_spells or v_submitted_cantrips <> v_required_cantrips then
    raise exception 'apply_level_up: % level % requires % spell and % cantrip choices (received % and %)',
      v_class_name, v_new_class_level, v_required_spells, v_required_cantrips,
      v_submitted_spells, v_submitted_cantrips;
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_spell_rows, '[]'::jsonb)) r
    where coalesce(r->>'source_type', 'class') = 'class'
      and nullif(r->>'source_class_id', '') is not null
      and (v_source_class_id is null or (r->>'source_class_id')::uuid <> v_source_class_id)
  ) then
    raise exception 'apply_level_up: spell choices must use the class being leveled';
  end if;
  if v_source_class_id is not null and exists (
    select 1 from jsonb_array_elements(coalesce(p_spell_rows, '[]'::jsonb)) r
    join public.character_spells existing
      on existing.party_member_id = p_member_id
      and existing.source_class_id = v_source_class_id
      and existing.source_type = 'class'
      and existing.spell_id = r->>'spell_id'
    where coalesce(r->>'source_type', 'class') = 'class'
      and not coalesce((r->>'always_prepared')::boolean, false)
  ) then
    raise exception 'apply_level_up: a required choice must be new for the source class';
  end if;

  update public.party_members set
    level = (p_member_update->>'level')::int,
    proficiency_bonus = case when p_member_update ? 'proficiency_bonus' then (p_member_update->>'proficiency_bonus')::int else proficiency_bonus end,
    max_hp = case when p_member_update ? 'max_hp' then (p_member_update->>'max_hp')::int else max_hp end,
    current_hp = case when p_member_update ? 'current_hp' then (p_member_update->>'current_hp')::int else current_hp end,
    hit_dice_remaining = case when p_member_update ? 'hit_dice_remaining' then (p_member_update->>'hit_dice_remaining')::int else hit_dice_remaining end,
    str = case when p_member_update ? 'str' then (p_member_update->>'str')::int else str end,
    dex = case when p_member_update ? 'dex' then (p_member_update->>'dex')::int else dex end,
    con = case when p_member_update ? 'con' then (p_member_update->>'con')::int else con end,
    "int" = case when p_member_update ? 'int' then (p_member_update->>'int')::int else "int" end,
    wis = case when p_member_update ? 'wis' then (p_member_update->>'wis')::int else wis end,
    cha = case when p_member_update ? 'cha' then (p_member_update->>'cha')::int else cha end,
    spell_slots = case when p_member_update ? 'spell_slots' then p_member_update->'spell_slots' else spell_slots end,
    class_resources = case when p_member_update ? 'class_resources' then p_member_update->'class_resources' else class_resources end,
    class_choices = case when p_member_update ? 'class_choices' then p_member_update->'class_choices' else class_choices end,
    level_choices = case when p_member_update ? 'level_choices' then p_member_update->'level_choices' else level_choices end,
    skill_proficiencies = case when p_member_update ? 'skill_proficiencies' then p_member_update->'skill_proficiencies' else skill_proficiencies end,
    weapon_masteries = case when p_member_update ? 'weapon_masteries'
      then array(select jsonb_array_elements_text(p_member_update->'weapon_masteries')) else weapon_masteries end,
    tool_proficiencies = case when p_member_update ? 'tool_proficiencies'
      then array(select jsonb_array_elements_text(p_member_update->'tool_proficiencies')) else tool_proficiencies end,
    languages = case when p_member_update ? 'languages'
      then array(select jsonb_array_elements_text(p_member_update->'languages')) else languages end
  where id = p_member_id;

  if p_class_op->>'op' = 'add' then
    insert into public.character_classes
      (party_member_id, class_name, class_definition_id, class_definition_kind,
       subclass_name, subclass_definition_id, subclass_variant, levels, is_primary, hit_dice_used, sort_order)
    values (p_member_id, v_class_name, v_definition_id, v_definition_kind,
      p_class_op->>'subclass_name', nullif(p_class_op->>'subclass_definition_id', '')::uuid,
      nullif(p_class_op->>'subclass_variant', ''), v_new_class_level,
      coalesce((p_class_op->>'is_primary')::boolean, false),
      coalesce((p_class_op->>'hit_dice_used')::int, 0), coalesce((p_class_op->>'sort_order')::int, 0))
    returning id into v_source_class_id;
  else
    update public.character_classes set levels = v_new_class_level,
      subclass_name = case when p_class_op ? 'subclass_name' then p_class_op->>'subclass_name' else subclass_name end,
      subclass_definition_id = case when p_class_op ? 'subclass_name'
        then nullif(p_class_op->>'subclass_definition_id', '')::uuid else subclass_definition_id end,
      subclass_variant = case when p_class_op ? 'subclass_variant'
        then nullif(p_class_op->>'subclass_variant', '') else subclass_variant end
    where id = v_source_class_id;
  end if;

  insert into public.character_spells
    (party_member_id, spell_id, is_known, is_prepared, always_prepared,
     source_class_id, source_type, source_label, uses_per_day, uses_remaining, resets_on, casting_ability)
  select p_member_id, r->>'spell_id', coalesce((r->>'is_known')::boolean, true),
    coalesce((r->>'is_prepared')::boolean, false), coalesce((r->>'always_prepared')::boolean, false),
    case when coalesce(r->>'source_type', 'class') = 'class'
      then coalesce(nullif(r->>'source_class_id', '')::uuid, v_source_class_id) else null end,
    coalesce(r->>'source_type', 'class'), r->>'source_label',
    nullif(r->>'uses_per_day', '')::int, nullif(r->>'uses_remaining', '')::int, nullif(r->>'resets_on', ''), nullif(r->>'casting_ability', '')
  from jsonb_array_elements(coalesce(p_spell_rows, '[]'::jsonb)) r
  on conflict do nothing;
end;
$function$;
