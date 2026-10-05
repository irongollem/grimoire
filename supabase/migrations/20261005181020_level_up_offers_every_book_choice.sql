-- Level-up offers every book choice, and de-level takes it back (#976, wave 4).
--
-- A choice now belongs to the feature that grants it (Expertise, Fighting
-- Style, invocations, Weapon Mastery, a feat; see `FeatureChoice` in
-- src/rules/features/mechanics.types.ts). The client records each level's
-- picks in `level_choices[n]` and applies them; this migration lets the two
-- level functions carry what those picks touch, and checks what they cannot
-- leave to the client:
--
--   * `apply_level_up` may now write `skill_proficiencies` (Expertise, skill
--     picks) and `weapon_masteries`. It refuses a feat id that is not a feat of
--     the character's edition that the character's owner or table can read:
--     before, `class_choices.feats` was whatever the client sent.
--   * `apply_de_level` may now write `class_choices`, `skill_proficiencies`,
--     `weapon_masteries` and `tool_proficiencies`. It could not, so a de-level
--     left every feat and pick behind and the panel told the player to tidy up
--     by hand.
--   * The 2024 origin feat was a name (`class_choices.background_feat`); it is
--     now the feat's id in `class_choices.origin_feat_id` and in `feats`, like
--     any other feat, so the approval queue and the sheet see it.
--   * The one Tasha's optional feature (`class_feature_options`, never read by
--     the client) becomes a feature that `replaces` the one it swaps for, the
--     way level-up now offers swaps. The table goes in this epic's cleanup.

-- ─── The origin feat is an id ────────────────────────────────────────────────

do $$
declare
  v_member record;
  v_feat uuid;
begin
  for v_member in
    select pm.id, pm.ruleset, pm.owner_user_id, pm.user_id, pm.campaign_id, pm.class_choices ->> 'background_feat' as feat_name
      from public.party_members pm
     where pm.class_choices ? 'background_feat'
  loop
    -- The official feat of the character's edition first, then the owner's own.
    select f.id into v_feat
      from public.class_features f
     where f.kind = 'feat'
       and (f.ruleset is null or f.ruleset = v_member.ruleset)
       and f.conceptual_key = trim(both '_' from lower(regexp_replace(v_member.feat_name, '[^a-zA-Z0-9]+', '_', 'g')))
       and (f.user_id is null or f.user_id = coalesce(v_member.owner_user_id, v_member.user_id))
     order by (f.user_id is null) desc, f.created_at
     limit 1;
    if v_feat is null then
      raise exception 'Origin feat "%" of character % matches no feat of its edition', v_member.feat_name, v_member.id;
    end if;
    update public.party_members
       set class_choices = (class_choices - 'background_feat')
             || jsonb_build_object(
                  'origin_feat_id', v_feat::text,
                  'feats', coalesce(case when jsonb_typeof(class_choices -> 'feats') = 'array'
                                         then class_choices -> 'feats' end, '[]'::jsonb) || to_jsonb(v_feat::text))
     where id = v_member.id;
  end loop;
end $$;

-- ─── Tasha's optional features ───────────────────────────────────────────────

insert into public.class_features (user_id, campaign_id, name, description, kind, tags, mechanics)
select o.user_id, o.campaign_id, o.option_name, o.description, 'feature', array[lower(o.class_name)],
       jsonb_build_object('replaces',
         trim(both '_' from lower(regexp_replace(o.replaces_feature, '[^a-zA-Z0-9]+', '_', 'g'))))
  from public.class_feature_options o
 where o.replaces_feature is not null and trim(o.replaces_feature) <> '';

-- ─── apply_level_up ──────────────────────────────────────────────────────────

create or replace function public.apply_level_up(p_member_id uuid, p_member_update jsonb, p_class_op jsonb DEFAULT NULL::jsonb, p_spell_rows jsonb DEFAULT '[]'::jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
    p_member_id, v_class_name, v_new_class_level, v_definition_kind, v_definition_id
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
      then array(select jsonb_array_elements_text(p_member_update->'tool_proficiencies')) else tool_proficiencies end
  where id = p_member_id;

  if p_class_op->>'op' = 'add' then
    insert into public.character_classes
      (party_member_id, class_name, class_definition_id, class_definition_kind,
       subclass_name, subclass_definition_id, levels, is_primary, hit_dice_used, sort_order)
    values (p_member_id, v_class_name, v_definition_id, v_definition_kind,
      p_class_op->>'subclass_name', nullif(p_class_op->>'subclass_definition_id', '')::uuid, v_new_class_level,
      coalesce((p_class_op->>'is_primary')::boolean, false),
      coalesce((p_class_op->>'hit_dice_used')::int, 0), coalesce((p_class_op->>'sort_order')::int, 0))
    returning id into v_source_class_id;
  else
    update public.character_classes set levels = v_new_class_level,
      subclass_name = case when p_class_op ? 'subclass_name' then p_class_op->>'subclass_name' else subclass_name end,
      subclass_definition_id = case when p_class_op ? 'subclass_name'
        then nullif(p_class_op->>'subclass_definition_id', '')::uuid else subclass_definition_id end
    where id = v_source_class_id;
  end if;

  insert into public.character_spells
    (party_member_id, spell_id, is_known, is_prepared, always_prepared,
     source_class_id, source_type, source_label, uses_per_day, uses_remaining, resets_on)
  select p_member_id, r->>'spell_id', coalesce((r->>'is_known')::boolean, true),
    coalesce((r->>'is_prepared')::boolean, false), coalesce((r->>'always_prepared')::boolean, false),
    case when coalesce(r->>'source_type', 'class') = 'class'
      then coalesce(nullif(r->>'source_class_id', '')::uuid, v_source_class_id) else null end,
    coalesce(r->>'source_type', 'class'), r->>'source_label',
    nullif(r->>'uses_per_day', '')::int, nullif(r->>'uses_remaining', '')::int, nullif(r->>'resets_on', '')
  from jsonb_array_elements(coalesce(p_spell_rows, '[]'::jsonb)) r
  on conflict do nothing;
end;
$function$;

-- ─── apply_de_level ──────────────────────────────────────────────────────────

create or replace function public.apply_de_level(p_member_id uuid, p_member_update jsonb, p_class_op jsonb DEFAULT NULL::jsonb, p_spell_ids text[] DEFAULT '{}'::text[])
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_uid uuid := (select auth.uid());
begin
  -- The character's owner, its creator while nobody owns it, or the DM of its table.
  if not exists (
    select 1 from party_members
    where id = p_member_id
      and (
        owner_user_id = v_uid
        or (owner_user_id is null and user_id = v_uid)
        or (campaign_id is not null and private.is_campaign_dm(campaign_id))
      )
  ) then
    raise exception 'apply_de_level: not authorized for member %', p_member_id
      using errcode = '42501';
  end if;

  -- What a level gave, de-level takes back: its picks live in class_choices,
  -- its Expertise in skill_proficiencies, its Weapon Mastery in weapon_masteries.
  -- Taking away only removes, so nothing here needs the feat check level-up has.
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
    spell_slots        = case when p_member_update ? 'spell_slots'        then p_member_update->'spell_slots'                else spell_slots end,
    class_resources    = case when p_member_update ? 'class_resources'    then p_member_update->'class_resources'            else class_resources end,
    class_choices      = case when p_member_update ? 'class_choices'      then p_member_update->'class_choices'              else class_choices end,
    level_choices      = case when p_member_update ? 'level_choices'      then p_member_update->'level_choices'              else level_choices end,
    skill_proficiencies = case when p_member_update ? 'skill_proficiencies' then p_member_update->'skill_proficiencies'      else skill_proficiencies end,
    weapon_masteries   = case when p_member_update ? 'weapon_masteries'
      then array(select jsonb_array_elements_text(p_member_update->'weapon_masteries')) else weapon_masteries end,
    tool_proficiencies = case when p_member_update ? 'tool_proficiencies'
      then array(select jsonb_array_elements_text(p_member_update->'tool_proficiencies')) else tool_proficiencies end
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
      -- A subclass is its definition: the name and the id clear together, or
      -- character_classes_subclass_pair_check refuses the whole de-level.
      update character_classes set
        levels        = (p_class_op->>'levels')::int,
        subclass_name = case when coalesce((p_class_op->>'clear_subclass')::boolean, false)
                             then null else subclass_name end,
        subclass_definition_id = case when coalesce((p_class_op->>'clear_subclass')::boolean, false)
                             then null else subclass_definition_id end
      where id = (p_class_op->>'id')::uuid and party_member_id = p_member_id;
    end if;
  end if;
end;
$function$;

-- ─── A feature spends a spell slot ───────────────────────────────────────────

-- 2014 Divine Smite adds damage by spending a slot without casting anything.
-- `spend_spell_slot` does the spending but is internal (service role only):
-- its template argument can create slot pools, which a client must not
-- control. This wrapper spends one existing slot and nothing else. It answers
-- to the same people `take_spellcasting_rest` does, a subset of those who may
-- already write `spell_slots` directly, so it widens nothing.
create or replace function public.spend_feature_spell_slot(p_party_member_id uuid, p_slot_level integer, p_slot_pool text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if p_slot_pool not in ('spellcasting', 'pact') then
    raise exception 'A feature spends a spellcasting or pact slot';
  end if;
  return public.spend_spell_slot(p_party_member_id, p_slot_level, p_slot_pool, null);
end;
$function$;

revoke execute on function public.spend_feature_spell_slot(uuid, integer, text) from public, anon;
grant execute on function public.spend_feature_spell_slot(uuid, integer, text) to authenticated, service_role;

-- ─── Level history becomes reversible ────────────────────────────────────────

-- De-level now takes a level back from the record level-up writes into
-- `level_choices[n]` (`record`: the choices made, ability increases, feats,
-- swaps; `class_definition_id`: which class row took the level). History
-- written before that holds `asi` and `step_choices` instead, which only told
-- the player what to undo by hand. Each entry is converted once, so every
-- existing level can be taken back like a new one; the old keys go.
create function pg_temp.reversible_entry(p_entry jsonb, p_definition uuid) returns jsonb
language sql immutable as $$
  select (p_entry - 'asi' - 'step_choices') || jsonb_build_object(
    'class_definition_id', p_definition::text,
    'record', jsonb_build_object(
      'choices', coalesce((
        select jsonb_object_agg(sc.key, jsonb_build_object(
                 'added', case when jsonb_typeof(sc.value) = 'array' then sc.value else jsonb_build_array(sc.value) end,
                 'removed', '[]'::jsonb))
          from jsonb_each(case when jsonb_typeof(p_entry -> 'step_choices') = 'object'
                               then p_entry -> 'step_choices' else '{}'::jsonb end) sc), '{}'::jsonb),
      'abilityIncreases', case p_entry -> 'asi' ->> 'mode'
        when 'plus2' then jsonb_build_object(p_entry -> 'asi' ->> 'primary', 2)
        when 'plus1plus1' then jsonb_build_object(p_entry -> 'asi' ->> 'primary', 1) || jsonb_build_object(p_entry -> 'asi' ->> 'secondary', 1)
        else '{}'::jsonb end,
      'feats', case when p_entry -> 'asi' ? 'feat_id' then jsonb_build_array(p_entry -> 'asi' ->> 'feat_id') else '[]'::jsonb end,
      'swaps', '{}'::jsonb),
    'skills', '{}'::jsonb,
    'masteries', jsonb_build_object('added', '[]'::jsonb, 'removed', '[]'::jsonb));
$$;

update public.party_members pm
   set level_choices = (
     select jsonb_object_agg(l.key,
       case when jsonb_typeof(l.value) = 'object' and not (l.value ? 'record')
            then pg_temp.reversible_entry(l.value, (
              select cc.class_definition_id from public.character_classes cc
               where cc.party_member_id = pm.id and lower(cc.class_name) = lower(l.value ->> 'class_name')
               order by cc.is_primary desc limit 1))
            else l.value end)
       from jsonb_each(pm.level_choices) l)
 where jsonb_typeof(pm.level_choices) = 'object' and pm.level_choices <> '{}'::jsonb;
