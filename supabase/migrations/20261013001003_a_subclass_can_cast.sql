-- A subclass can cast (the third casters).
--
-- Casting came only from a class: system_classes / custom_classes carry
-- caster_type, spell_slots, spells_known and cantrips_known, and a subclass had
-- nothing to say. So an Eldritch Knight, an Arcane Trickster, or the library's
-- own third casters (Tome of Heroes' Soulspy and Underfoot, Open5e's Eldritch
-- Trickster and Arcane Warrior) printed a Spellcasting feature the app could
-- not act on: Fighter and Rogue have no slots, so every spell the character
-- tried to learn was refused with "Fighter is not configured as a spellcasting
-- class".
--
-- `custom_subclasses.spellcasting` holds the same tables a class does, indexed
-- by class level, plus the casting ability and the spell list it draws from.
-- The rule everywhere, client (src/rules/subclassCasting.ts) and server alike:
-- a class row casts from its class when the class casts, and otherwise from its
-- subclass. `private.subclass_casting` is the one reader.
--
-- The four functions that resolve a class row's casting take that fallback and
-- change nothing else; their bodies are production's (pg_get_functiondef,
-- md5-matched against local on 13 Oct 2026) with the fallback inserted:
--   required_level_up_spell_choices  gains p_subclass_definition_id, because
--                                    apply_level_up asks before it writes the
--                                    subclass chosen at this very level
--   apply_level_up                   passes that subclass
--   validate_character_spell_source  the subclass's list admits a spell; its
--                                    slots set the highest spell level
--   validate_character_spell_limits  its known / cantrip tables count
--   cast_character_spell_v4          a known caster casts without preparing

alter table public.custom_subclasses
  add column spellcasting jsonb,
  add constraint custom_subclasses_spellcasting_shape check (
    spellcasting is null or (
      jsonb_typeof(spellcasting) = 'object'
      and spellcasting ?& array['ability', 'list', 'caster_type', 'spell_slots', 'spells_known', 'cantrips_known']
      and spellcasting ->> 'ability' in ('int', 'wis', 'cha')
      and spellcasting ->> 'caster_type' in ('known', 'prepared', 'spellbook')
      and jsonb_typeof(spellcasting -> 'list') = 'string'
      -- Every table holds 20 rows of whole numbers (a slot row: up to 9 of them),
      -- so a bad entry is refused here rather than failing every character on a
      -- shared subclass when a function casts it to integer.
      and jsonb_typeof(spellcasting -> 'spell_slots') = 'array'
      and jsonb_array_length(spellcasting -> 'spell_slots') = 20
      and not jsonb_path_exists(spellcasting, 'strict $.spell_slots[*] ? (@.type() != "array" || @.size() > 9)')
      and not jsonb_path_exists(spellcasting, 'strict $.spell_slots[*][*] ? (@.type() != "number" || @ < 0 || @ != @.floor())')
      and jsonb_typeof(spellcasting -> 'spells_known') = 'array'
      and jsonb_array_length(spellcasting -> 'spells_known') = 20
      and not jsonb_path_exists(spellcasting, 'strict $.spells_known[*] ? (@.type() != "number" || @ < 0 || @ != @.floor())')
      and jsonb_typeof(spellcasting -> 'cantrips_known') = 'array'
      and jsonb_array_length(spellcasting -> 'cantrips_known') = 20
      and not jsonb_path_exists(spellcasting, 'strict $.cantrips_known[*] ? (@.type() != "number" || @ < 0 || @ != @.floor())')
    )
  );

-- The casting a class row takes from its subclass, or null. Only when the class
-- itself casts nothing (a class that casts keeps its own list and tables), and
-- only from a subclass of that class, of the character's ruleset, that this
-- character may take: the same test validate_character_subclass_definition
-- applies to the row. apply_level_up asks before it writes the row, with a
-- subclass id the caller supplied, so the check is repeated here rather than
-- trusted (security audit, 13 Oct 2026). Total: anything missing is null.
create function private.subclass_casting(
  p_member_id uuid,
  p_class_name text,
  p_class_definition_kind text,
  p_class_definition_id uuid,
  p_subclass_definition_id uuid
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select s.spellcasting
    from public.custom_subclasses s
   where s.id = p_subclass_definition_id
     and s.spellcasting is not null
     and s.class_name = p_class_name
     and (s.ruleset is null or s.ruleset = private.party_member_ruleset(p_member_id))
     and coalesce(private.character_may_take_definition(p_member_id, s.campaign_id, s.user_id), false)
     -- The class must exist and cast nothing: a missing definition is not a
     -- licence to cast from the subclass.
     and coalesce(
       case when coalesce(p_class_definition_kind, 'system') = 'system'
         then (select c.caster_type = 'none' from public.system_classes c where c.id = p_class_definition_id)
         else (select c.caster_type = 'none' from public.custom_classes c where c.id = p_class_definition_id)
       end, false)
$$;

-- A jsonb array of numbers as the integer[] the class tables use.
create function private.jsonb_int_array(p_value jsonb)
returns integer[]
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p_value) = 'array'
    then array(select (e.value #>> '{}')::integer from jsonb_array_elements(p_value) with ordinality e(value, ord) order by e.ord)
  end
$$;

revoke execute on function private.subclass_casting(uuid, text, text, uuid, uuid) from public, anon, authenticated;
revoke execute on function private.jsonb_int_array(jsonb) from public, anon, authenticated;

drop function public.required_level_up_spell_choices(uuid, text, integer, text, uuid);

CREATE OR REPLACE FUNCTION public.required_level_up_spell_choices(p_member_id uuid, p_class_name text, p_new_class_level integer, p_definition_kind text DEFAULT NULL::text, p_definition_id uuid DEFAULT NULL::uuid, p_subclass_definition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(spell_count integer, cantrip_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ruleset text;
  v_policy public.class_spellcasting_policies%rowtype;
  v_caster_type text;
  v_spells_known jsonb;
  v_cantrips_known integer[];
  v_current integer;
  v_previous integer;
  v_wizard_spell_count integer;
  v_subclass jsonb;
begin
  if p_new_class_level < 1 or p_new_class_level > 20 then
    raise exception 'Class level must be between 1 and 20';
  end if;

  if not exists (select 1 from public.party_members pm where pm.id = p_member_id) then
    raise exception 'Party member not found' using errcode = 'P0002';
  end if;
  v_ruleset := private.party_member_ruleset(p_member_id);

  -- The Wizard spellbook's 6-at-level-1 / 2-per-level-thereafter acquisition
  -- rule is identical whether resolved via the pinned system policy below or
  -- the system/custom-class fallback; compute it once instead of twice.
  if p_class_name = 'Wizard' and coalesce(p_definition_kind, 'system') = 'system' then
    v_wizard_spell_count := case when p_new_class_level = 1 then 6 else 2 end;
  end if;

  select * into v_policy from public.class_spellcasting_policies
  where ruleset = v_ruleset and class_name = p_class_name
    and coalesce(p_definition_kind, 'system') = 'system';

  if found then
    if v_wizard_spell_count is not null then
      spell_count := v_wizard_spell_count;
    elsif v_policy.prepared_limit is not null then
      v_current := coalesce(v_policy.prepared_limit[p_new_class_level], 0);
      v_previous := case when p_new_class_level = 1 then 0
        else coalesce(v_policy.prepared_limit[p_new_class_level - 1], 0) end;
      spell_count := greatest(0, v_current - v_previous);
    else
      spell_count := 0;
    end if;
    if v_policy.cantrip_limit is not null then
      v_current := coalesce(v_policy.cantrip_limit[p_new_class_level], 0);
      v_previous := case when p_new_class_level = 1 then 0
        else coalesce(v_policy.cantrip_limit[p_new_class_level - 1], 0) end;
      cantrip_count := greatest(0, v_current - v_previous);
    else
      cantrip_count := 0;
    end if;
    return next;
    return;
  end if;

  select caster_type, spells_known, cantrips_known
    into v_caster_type, v_spells_known, v_cantrips_known
  from public.system_classes where class_name = p_class_name
    and (p_definition_id is null or id = p_definition_id)
    and coalesce(p_definition_kind, 'system') = 'system' limit 1;
  if not found then
    select cc.caster_type, cc.spells_known, cc.cantrips_known
      into v_caster_type, v_spells_known, v_cantrips_known
    from public.custom_classes cc
    join public.party_members pm on pm.id = p_member_id
    where cc.class_name = p_class_name
      and (p_definition_id is null or cc.id = p_definition_id)
      and coalesce(p_definition_kind, 'custom') = 'custom'
      and (cc.campaign_id = pm.campaign_id
        or (cc.campaign_id is null
          and (cc.user_id is null or cc.user_id in (pm.user_id, pm.owner_user_id))))
    order by (cc.campaign_id is not null) desc, (cc.user_id is not null) desc limit 1;
  end if;

  -- A class that does not cast takes its subclass's casting (a third caster).
  if coalesce(v_caster_type, 'none') = 'none' then
    v_subclass := private.subclass_casting(p_member_id, p_class_name, p_definition_kind, p_definition_id, p_subclass_definition_id);
    if v_subclass is not null then
      v_caster_type := v_subclass ->> 'caster_type';
      v_spells_known := v_subclass -> 'spells_known';
      v_cantrips_known := private.jsonb_int_array(v_subclass -> 'cantrips_known');
    end if;
  end if;

  if v_wizard_spell_count is not null then
    spell_count := v_wizard_spell_count;
  elsif v_caster_type = 'known' and v_spells_known is not null then
    v_current := coalesce((v_spells_known ->> (p_new_class_level - 1))::integer, 0);
    v_previous := case when p_new_class_level = 1 then 0
      else coalesce((v_spells_known ->> (p_new_class_level - 2))::integer, 0) end;
    spell_count := greatest(0, v_current - v_previous);
  else
    spell_count := 0;
  end if;
  if v_cantrips_known is not null then
    v_current := coalesce(v_cantrips_known[p_new_class_level], 0);
    v_previous := case when p_new_class_level = 1 then 0
      else coalesce(v_cantrips_known[p_new_class_level - 1], 0) end;
    cantrip_count := greatest(0, v_current - v_previous);
  else
    cantrip_count := 0;
  end if;
  return next;
end;
$function$;

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

CREATE OR REPLACE FUNCTION public.validate_character_spell_source()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_class public.character_classes%rowtype;
  v_member public.party_members%rowtype;
  v_policy public.class_spellcasting_policies%rowtype;
  v_spell_level integer;
  v_spell_classes text[];
  v_spell_slots jsonb;
  v_cantrips_known integer[];
  v_row jsonb;
  v_max_spell_level integer := 0;
  v_index integer;
  v_subclass jsonb;
  v_enforce boolean := current_setting('grimoire.spell_limits', true) is distinct from 'suspended';
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
  v_subclass := private.subclass_casting(v_class.party_member_id, v_class.class_name, v_class.class_definition_kind,
      v_class.class_definition_id, v_class.subclass_definition_id);

  select level, classes into v_spell_level, v_spell_classes from public.library_spells where id = new.spell_id;
  if not found then select level, classes into v_spell_level, v_spell_classes from public.spells where id::text = new.spell_id; end if;
  if not found then raise exception 'Spell does not exist'; end if;
  -- An always-prepared row skips the class list and every count, so it has to
  -- be one the server gave (a subclass grant) or one a class feature's spell
  -- pick admits. A copy or a conversion (limits suspended) carries rows as they
  -- stand, including ones written before this check existed.
  -- Only a new claim is checked: an insert, or an update that changes the spell,
  -- its class or the flag. Toggling anything else on a row that predates the
  -- check must not fail on it (#1027 review).
  if new.always_prepared and not new.granted_by_subclass and v_enforce
     and (tg_op = 'INSERT' or old.always_prepared is distinct from new.always_prepared
          or old.spell_id is distinct from new.spell_id
          or old.source_class_id is distinct from new.source_class_id)
     and not exists (
       select 1 from private.feature_spell_picks(new.source_class_id) pick
       where pick.spell_level = v_spell_level
         and exists (select 1 from unnest(coalesce(v_spell_classes, '{}'::text[])) spell_class
                     where lower(spell_class) = any (pick.lists))
     ) then
    raise exception 'No feature of this % lets it take % as an always-prepared spell', v_class.class_name, new.spell_id
      using errcode = '42501';
  end if;
  if not new.always_prepared
     and not (v_class.class_name = any(coalesce(v_spell_classes, '{}'::text[])))
     and not (v_subclass is not null and (v_subclass ->> 'list') = any(coalesce(v_spell_classes, '{}'::text[])))
     and not (
       v_class.subclass_definition_id is not null
       and exists (
         select 1
         from public.custom_subclasses subclass,
              lateral (
                select case when jsonb_typeof(subclass.expanded_spells) = 'object'
                            then subclass.expanded_spells else '{}'::jsonb end as tiers
                union all
                select case when v_class.subclass_variant is not null
                                 and jsonb_typeof(subclass.expanded_spell_variants) = 'object'
                                 and jsonb_typeof(subclass.expanded_spell_variants -> v_class.subclass_variant) = 'object'
                            then subclass.expanded_spell_variants -> v_class.subclass_variant else '{}'::jsonb end
              ) lists,
              jsonb_each(lists.tiers) tier(spell_level, ids),
              jsonb_array_elements_text(case when jsonb_typeof(tier.ids) = 'array'
                                             then tier.ids else '[]'::jsonb end) listed(spell_id)
         where subclass.id = v_class.subclass_definition_id and listed.spell_id = new.spell_id
       )
     ) then
    raise exception '% is not on the % spell list', new.spell_id, v_class.class_name;
  end if;

  if v_class.class_definition_kind = 'system' then
    select policy.* into v_policy from public.class_spellcasting_policies policy
    where policy.ruleset = private.party_member_ruleset(v_member.id) and policy.class_name = v_class.class_name;
  end if;
  if v_policy.ruleset is not null then
    if v_spell_level = 0 and v_policy.cantrip_limit is null and not new.always_prepared then
      raise exception '% does not have a cantrip progression', v_class.class_name;
    end if;
    v_max_spell_level := v_policy.max_spell_level[least(v_class.levels, 20)];
  else
    if v_class.class_definition_kind = 'system' then
      select spell_slots, cantrips_known into v_spell_slots, v_cantrips_known
      from public.system_classes where class_name = v_class.class_name
        and id = v_class.class_definition_id limit 1;
    else
      select spell_slots, cantrips_known into v_spell_slots, v_cantrips_known
      from public.custom_classes where id = v_class.class_definition_id;
    end if;
    -- A class that does not cast takes its subclass's casting (a third caster):
    -- the same test as the other three functions (subclass_casting is null
    -- unless the class casts nothing), never "the class has no slot table".
    if v_subclass is not null then
      v_spell_slots := v_subclass -> 'spell_slots';
      v_cantrips_known := private.jsonb_int_array(v_subclass -> 'cantrips_known');
    end if;
    if v_spell_slots is null then raise exception '% is not configured as a spellcasting class', v_class.class_name; end if;
    if v_spell_level = 0 then
      if v_cantrips_known is null and not new.always_prepared then raise exception '% does not have a cantrip progression', v_class.class_name; end if;
      return new;
    end if;
    v_row := v_spell_slots -> (least(v_class.levels, 20) - 1);
    if v_row is null or jsonb_typeof(v_row) <> 'array' then
      raise exception 'Missing spell-slot progression for % level %', v_class.class_name, v_class.levels;
    end if;
    if jsonb_array_length(v_row) > 0 then
      for v_index in 0..least(jsonb_array_length(v_row), 9) - 1 loop
        if coalesce((v_row ->> v_index)::integer, 0) > 0 then v_max_spell_level := v_index + 1; end if;
      end loop;
    end if;
  end if;
  if v_spell_level > 0 and v_spell_level > v_max_spell_level then
    raise exception 'A level-% % cannot acquire a level-% spell', v_class.levels, v_class.class_name, v_spell_level;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.validate_character_spell_limits()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_class public.character_classes%rowtype;
  v_member public.party_members%rowtype;
  v_policy public.class_spellcasting_policies%rowtype;
  v_caster_type text;
  v_spells_known jsonb;
  v_cantrips_known integer[];
  v_prepared_ability text;
  v_prepared_divisor integer;
  v_spell_level integer;
  v_limit integer;
  v_existing integer;
  v_score integer;
  v_subclass jsonb;
  v_enforce boolean := current_setting('grimoire.spell_limits', true) is distinct from 'suspended';
begin
  if new.source_type <> 'class' then return new; end if;
  -- Counted rows are counted under the class row's lock, so concurrent inserts
  -- for one class take turns rather than each seeing room for one more.
  perform 1 from public.character_classes where id = new.source_class_id for update;
  -- An always-prepared row counts toward no prepared or known limit, but a
  -- feature's picks are themselves counted: no more than its features grant at
  -- that spell level. A subclass grant is the sync's, which owes exactly its list.
  if new.always_prepared then
    if new.granted_by_subclass or not v_enforce then return new; end if;
    -- As in validate_character_spell_source: only a new claim is counted.
    if not (tg_op = 'INSERT' or old.always_prepared is distinct from new.always_prepared
          or old.spell_id is distinct from new.spell_id
          or old.source_class_id is distinct from new.source_class_id) then return new; end if;
    v_spell_level := public.character_spell_level(new.spell_id);
    select coalesce(sum(pick.picks), 0) into v_limit
    from private.feature_spell_picks(new.source_class_id) pick
    where pick.spell_level = v_spell_level;
    select count(*) into v_existing from public.character_spells existing
    where existing.source_class_id = new.source_class_id
      and existing.source_type = 'class' and existing.always_prepared
      -- A pick the subclass sync took over still holds its slot: removing the
      -- grant restores it (restore_subclass_picks), so it cannot be spent twice.
      and (not existing.granted_by_subclass or existing.pick_was_always_prepared)
      and public.character_spell_level(existing.spell_id) = v_spell_level
      and existing.id is distinct from new.id;
    if v_existing >= v_limit then
      raise exception 'The features of this % grant % always-prepared level-% spell picks', (select class_name from public.character_classes where id = new.source_class_id), v_limit, v_spell_level
        using errcode = '42501';
    end if;
    return new;
  end if;
  select * into strict v_class from public.character_classes where id = new.source_class_id;
  select * into strict v_member from public.party_members where id = new.party_member_id;
  v_spell_level := public.character_spell_level(new.spell_id);

  if v_class.class_definition_kind = 'system' then
    select policy.* into v_policy from public.class_spellcasting_policies policy
    where policy.ruleset = private.party_member_ruleset(v_member.id) and policy.class_name = v_class.class_name;
  end if;
  if v_policy.ruleset is not null then
    if v_spell_level = 0 then
      v_limit := v_policy.cantrip_limit[least(v_class.levels, 20)];
    else
      v_limit := v_policy.prepared_limit[least(v_class.levels, 20)];
      if v_policy.caster_type <> 'spellbook' then new.is_prepared := true; end if;
      if v_policy.caster_type = 'spellbook' and not new.is_prepared then return new; end if;
    end if;
    if v_limit is null then return new; end if;
    select count(*) into v_existing from public.character_spells existing
    where existing.party_member_id = new.party_member_id and existing.source_class_id = new.source_class_id
      and existing.source_type = 'class' and not existing.always_prepared
      and ((v_spell_level = 0 and public.character_spell_level(existing.spell_id) = 0)
        or (v_spell_level > 0 and public.character_spell_level(existing.spell_id) > 0))
      and (v_spell_level = 0 or v_policy.caster_type <> 'spellbook' or existing.is_prepared)
      and existing.id is distinct from new.id;
    if v_enforce and v_existing >= v_limit then
      raise exception '% can prepare at most % % at class level %', v_class.class_name, v_limit,
        case when v_spell_level = 0 then 'cantrips' else 'spells' end, v_class.levels;
    end if;
    return new;
  end if;

  if v_class.class_definition_kind = 'system' then
    select caster_type, spells_known, cantrips_known, prepared_ability, prepared_divisor
      into v_caster_type, v_spells_known, v_cantrips_known, v_prepared_ability, v_prepared_divisor
    from public.system_classes where class_name = v_class.class_name
      and id = v_class.class_definition_id limit 1;
  else
    select caster_type, spells_known, cantrips_known, prepared_ability, prepared_divisor
      into v_caster_type, v_spells_known, v_cantrips_known, v_prepared_ability, v_prepared_divisor
    from public.custom_classes where id = v_class.class_definition_id;
  end if;
  -- A class that does not cast takes its subclass's casting (a third caster).
  if coalesce(v_caster_type, 'none') = 'none' then
    v_subclass := private.subclass_casting(v_class.party_member_id, v_class.class_name, v_class.class_definition_kind,
      v_class.class_definition_id, v_class.subclass_definition_id);
    if v_subclass is not null then
      v_caster_type := v_subclass ->> 'caster_type';
      v_spells_known := v_subclass -> 'spells_known';
      v_cantrips_known := private.jsonb_int_array(v_subclass -> 'cantrips_known');
      v_prepared_ability := v_subclass ->> 'ability';
      v_prepared_divisor := 3;
    end if;
  end if;
  if v_spell_level = 0 then
    v_limit := v_cantrips_known[least(v_class.levels, 20)];
  elsif v_caster_type = 'known' then
    v_limit := nullif(v_spells_known ->> (least(v_class.levels, 20) - 1), '')::integer;
  elsif new.is_prepared and v_caster_type in ('prepared', 'spellbook') then
    v_score := case v_prepared_ability when 'int' then v_member."int" when 'wis' then v_member.wis
      when 'cha' then v_member.cha else 10 end;
    v_limit := greatest(1, floor((v_score - 10)::numeric / 2)::integer
      + floor(v_class.levels::numeric / greatest(coalesce(v_prepared_divisor, 1), 1))::integer);
  else
    return new;
  end if;
  if v_limit is null then return new; end if;
  select count(*) into v_existing from public.character_spells existing
  where existing.party_member_id = new.party_member_id and existing.source_class_id = new.source_class_id
    and existing.source_type = 'class' and not existing.always_prepared
    and ((v_spell_level = 0 and public.character_spell_level(existing.spell_id) = 0)
      or (v_spell_level > 0 and public.character_spell_level(existing.spell_id) > 0))
    and (v_spell_level = 0 or v_caster_type = 'known' or existing.is_prepared)
    and existing.id is distinct from new.id;
  if v_enforce and v_existing >= v_limit then raise exception '% spell limit of % reached', v_class.class_name, v_limit; end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.cast_character_spell_v4(p_party_member_id uuid, p_slot_level integer, p_slot_pool text, p_slot_template jsonb DEFAULT NULL::jsonb, p_concentration_state jsonb DEFAULT NULL::jsonb, p_metamagic_names text[] DEFAULT '{}'::text[], p_character_spell_id uuid DEFAULT NULL::uuid, p_metamagic_choices jsonb DEFAULT '{}'::jsonb, p_parent_cast_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_member public.party_members%rowtype;
  v_grant public.character_spells%rowtype;
  v_class public.character_classes%rowtype;
  v_parent public.spell_cast_records%rowtype;
  v_option public.metamagic_options%rowtype;
  v_spell record;
  v_ruleset text;
  v_turn_key text;
  v_class_name text;
  v_caster_type text;
  v_ritual_style text;
  v_ready boolean;
  v_method text;
  v_cast_id uuid;
  v_choices jsonb;
  v_resources jsonb;
  v_slots jsonb;
  v_concentration jsonb;
  v_sorcerer_level integer;
  v_innate_active boolean := false;
  v_metamagic_count integer;
  v_eff_slot_level integer;
  v_reactive boolean := false;
  v_quickened boolean := false;
  v_known boolean;
  v_cost integer;
  v_sp_total integer := 0;
  v_sp_current integer;
  v_limit integer := 1;
  v_free_used boolean := false;
  v_name text;
  v_damage_type text;
  v_original_type boolean;
  v_result jsonb;
begin
  if p_slot_level < 0 or p_slot_level > 9 then raise exception 'Invalid cast level'; end if;
  select * into v_member from public.party_members where id = p_party_member_id for update;
  if not found then raise exception 'Party member not found'; end if;
  if not coalesce((v_member.owner_user_id = (select auth.uid()) or (v_member.owner_user_id is null and v_member.user_id = (select auth.uid()))
    or private.is_campaign_dm(v_member.campaign_id)
    or exists (select 1 from public.campaign_members cm
      where cm.user_id = (select auth.uid()) and cm.party_member_id = v_member.id)), false)
  then raise exception 'Access denied'; end if;
  if p_character_spell_id is null then raise exception 'Casting requires an exact character spell'; end if;
  if jsonb_typeof(coalesce(p_metamagic_choices, '{}'::jsonb)) <> 'object' then
    raise exception 'Invalid Metamagic choices';
  end if;

  select * into v_grant from public.character_spells
    where id = p_character_spell_id and party_member_id = p_party_member_id for update;
  if not found then raise exception 'Character spell not found'; end if;
  select * into v_spell from (
    select id::text as id, name, level, ritual, attack_type, range, duration, casting_time,
      damage_rolls, higher_levels, target_description
    from public.spells where id::text = v_grant.spell_id
    union all
    select id, name, level, ritual, attack_type, range, duration, casting_time,
      damage_rolls, higher_levels, target_description
    from public.library_spells where id = v_grant.spell_id
  ) resolved_spell limit 1;
  if not found then raise exception 'Spell content version not found'; end if;

  v_ruleset := private.party_member_ruleset(v_member.id);
  v_turn_key := private.active_turn_key(v_member.campaign_id);
  v_sorcerer_level := public.sorcerer_level(v_member);
  v_choices := coalesce(v_member.class_choices, '{}'::jsonb);
  v_resources := coalesce(v_member.class_resources, '{}'::jsonb);
  v_metamagic_count := coalesce(array_length(p_metamagic_names, 1), 0);

  if v_grant.source_type = 'class' then
    select cc.* into v_class from public.character_classes cc
      where cc.id = v_grant.source_class_id and cc.party_member_id = p_party_member_id;
    v_class_name := v_class.class_name;
    if v_class_name is null then raise exception 'Class casting requires an exact source class'; end if;
    if v_ruleset = '2024' and v_class.class_definition_kind = 'system' then
      select caster_type into v_caster_type from public.class_spellcasting_policies
        where ruleset = v_ruleset and class_name = v_class_name;
    end if;
    if v_caster_type is null then
      select caster_type into v_caster_type from public.system_classes
        where class_name = v_class_name
          and id = v_class.class_definition_id
          and v_class.class_definition_kind = 'system' limit 1;
      if v_caster_type is null then
        select caster_type into v_caster_type from public.custom_classes where class_name = v_class_name
          and id = v_class.class_definition_id
          and v_class.class_definition_kind = 'custom'
          and (campaign_id = v_member.campaign_id or campaign_id is null) order by (campaign_id is not null) desc limit 1;
      end if;
    end if;
    -- A class that does not cast takes its subclass's casting (a third caster).
    if coalesce(v_caster_type, 'none') = 'none' then
      v_caster_type := coalesce(private.subclass_casting(v_class.party_member_id, v_class.class_name, v_class.class_definition_kind,
        v_class.class_definition_id, v_class.subclass_definition_id) ->> 'caster_type', v_caster_type);
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
    -- Post-roll path: a single post-roll option modifies a cast that already
    -- happened. It never spends a slot and never touches turn state.
    if v_metamagic_count = 1 then
      select * into v_option from public.metamagic_options
        where ruleset = v_ruleset and name = p_metamagic_names[1];
    end if;
    if v_metamagic_count <> 1 or not coalesce(v_option.post_roll, false) then
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
    if p_metamagic_names[1] = any(v_parent.metamagic_names) then
      raise exception '% was already used on this cast', p_metamagic_names[1];
    end if;
    if coalesce(array_length(v_parent.metamagic_names, 1), 0) >= 2 then
      raise exception 'A spell cannot have more than two Metamagic options';
    end if;
    v_reactive := true;
    v_eff_slot_level := 0;
  else
    if exists (select 1 from unnest(coalesce(p_metamagic_names, '{}'::text[])) mm(option_name)
      join public.metamagic_options mo on mo.ruleset = v_ruleset and mo.name = mm.option_name
      where mo.post_roll) then
      raise exception 'Empowered Spell and Seeking Spell must be applied after their roll';
    end if;
    v_eff_slot_level := p_slot_level;

    if v_grant.source_type <> 'class' and p_slot_level = 0 then
      v_method := 'feature';
    elsif v_spell.level = 0 then
      if p_slot_level <> 0 then raise exception 'Cantrips do not spend spell slots'; end if;
      v_method := 'at_will';
    elsif p_slot_level = 0 then
      if not v_spell.ritual then raise exception 'This spell does not have the Ritual tag'; end if;
      if v_class.class_definition_kind = 'system' then
        select ritual_style into v_ritual_style from public.class_ritual_policies
          where ruleset = v_ruleset and class_name = v_class_name;
      end if;
      -- Unlisted (and custom) classes fall back to the edition default:
      -- 2024 rituals ride on preparation, 2014 rituals need a class feature.
      v_ritual_style := coalesce(v_ritual_style, case when v_ruleset = '2024' then 'prepared' else 'none' end);
      v_ready := v_grant.is_prepared or v_grant.always_prepared;
      case v_ritual_style
        when 'known' then null;
        when 'spellbook' then
          if not v_grant.is_known then raise exception '% ritual must be in the spellbook', v_class_name; end if;
        when 'spellbook_or_prepared' then
          if not (v_grant.is_known or v_ready) then
            raise exception 'Ritual casting requires % to be prepared or in the spellbook', v_spell.name;
          end if;
        when 'prepared' then
          if not v_ready then raise exception 'Ritual casting requires % to be prepared', v_spell.name; end if;
        else
          raise exception '% cannot ritual-cast this spell under % rules', v_class_name, v_ruleset;
      end case;
      v_method := 'ritual';
    else
      if p_slot_level < v_spell.level then raise exception 'Cast slot cannot be below the spell level'; end if;
      v_method := 'slot';
    end if;
  end if;

  if v_metamagic_count > 0 then
    if v_sorcerer_level < 2 then raise exception 'Metamagic requires an eligible Sorcerer'; end if;
    v_innate_active := coalesce((v_choices ->> 'innate_sorcery_active')::boolean, false)
      and coalesce((v_choices ->> 'innate_sorcery_expires_at')::timestamptz, '-infinity') > now();
    if v_ruleset = '2024' and v_sorcerer_level >= 7 and v_innate_active then v_limit := 2; end if;
    if v_metamagic_count > v_limit then raise exception 'Too many Metamagic options for this casting'; end if;
    if v_metamagic_count <> coalesce(array_length(array(select distinct unnest(p_metamagic_names)), 1), 0) then
      raise exception 'A Metamagic option cannot be applied twice';
    end if;

    foreach v_name in array p_metamagic_names loop
      if jsonb_typeof(v_choices -> 'metamagic_options') = 'array' then
        select exists(select 1 from jsonb_array_elements_text(v_choices -> 'metamagic_options') x where x = v_name) into v_known;
      else
        v_known := v_choices ->> 'metamagic_options' = v_name;
      end if;
      if not v_known then raise exception 'Character does not know %', v_name; end if;
      select * into v_option from public.metamagic_options where ruleset = v_ruleset and name = v_name;
      if not found then raise exception 'Unsupported Metamagic option'; end if;

      -- Eligibility against the exact spell version being cast.
      case v_name
        when 'Careful Spell', 'Heightened Spell' then
          if v_spell.attack_type is distinct from 'save' then raise exception '% requires a saving-throw spell', v_name; end if;
        when 'Distant Spell' then
          if not (coalesce(v_spell.range, '') = 'Touch' or coalesce(v_spell.range, '') ~* '(feet|ft\.|mile|^[0-9]+)') then raise exception 'Distant Spell requires a ranged or Touch spell'; end if;
        when 'Extended Spell' then
          if not (coalesce(v_spell.duration, '') ~* '(minute|hour|day|until dispelled)') or coalesce(v_spell.duration, '') ~* '^1 round$' then raise exception 'Extended Spell requires a duration of at least 1 minute'; end if;
        when 'Quickened Spell' then
          if v_spell.casting_time is distinct from 'Action' then raise exception 'Quickened Spell requires an Action casting time'; end if;
          v_quickened := true;
        when 'Transmuted Spell' then
          select exists(select 1 from jsonb_array_elements(coalesce(v_spell.damage_rolls, '[]'::jsonb)) roll
            where lower(roll ->> 'type') in ('acid','cold','fire','lightning','poison','thunder')) into v_original_type;
          if not v_original_type then raise exception 'Transmuted Spell requires eligible elemental damage'; end if;
          v_damage_type := lower(p_metamagic_choices ->> 'transmuted_damage_type');
          if coalesce(v_damage_type, '') not in ('acid','cold','fire','lightning','poison','thunder') then raise exception 'Choose a valid Transmuted Spell damage type'; end if;
          if exists(select 1 from jsonb_array_elements(coalesce(v_spell.damage_rolls, '[]'::jsonb)) roll where lower(roll ->> 'type') = v_damage_type) then
            raise exception 'Transmuted Spell must change the damage type';
          end if;
        when 'Twinned Spell' then
          if v_ruleset = '2024' then
            if coalesce(v_spell.higher_levels, '') !~* 'additional (creature|target)' then raise exception 'This spell is not eligible for revised Twinned Spell'; end if;
          elsif v_spell.range ~* '^self$' or coalesce(v_spell.target_description, '') !~* '^1\M' then
            raise exception 'This spell is not eligible for original Twinned Spell';
          end if;
        when 'Empowered Spell' then
          if jsonb_array_length(coalesce(v_spell.damage_rolls, '[]'::jsonb)) = 0 then raise exception 'Empowered Spell requires spell damage'; end if;
        when 'Seeking Spell' then
          if coalesce(v_spell.attack_type, '') not in ('ranged_spell', 'melee_spell') then raise exception 'Seeking Spell requires a spell attack'; end if;
        else null;
      end case;

      v_cost := case when v_option.cost_scaling = 'spell_level'
        then greatest(v_eff_slot_level, v_option.sp_cost)
        else v_option.sp_cost end;
      -- Arcane Apotheosis makes one option free each encounter turn while
      -- Innate Sorcery is active; without a trusted turn boundary it charges.
      if v_ruleset = '2024' and v_sorcerer_level >= 18 and v_innate_active and not v_free_used
         and v_turn_key is not null
         and v_choices ->> 'arcane_apotheosis_turn' is distinct from v_turn_key then
        v_free_used := true;
        v_choices := jsonb_set(v_choices, '{arcane_apotheosis_turn}', to_jsonb(v_turn_key), true);
      else
        v_sp_total := v_sp_total + v_cost;
      end if;
    end loop;

    v_sp_current := coalesce((v_resources #>> '{sorcery_points,current}')::integer, 0);
    if v_sp_current < v_sp_total then raise exception 'Not enough Sorcery Points'; end if;
    if v_sp_total > 0 then
      v_resources := jsonb_set(v_resources, '{sorcery_points,current}', to_jsonb(v_sp_current - v_sp_total), false);
    end if;
  end if;

  -- Turn-scoped action economy (skipped for post-roll modifications, which
  -- belong to the original cast's action).
  if not v_reactive and v_turn_key is not null then
    if v_ruleset = '2024' and p_slot_level > 0 then
      if v_choices ->> 'spell_slot_cast_turn' = v_turn_key then
        raise exception '2024 rules allow only one spell-slot expenditure per turn';
      end if;
      v_choices := jsonb_set(v_choices, '{spell_slot_cast_turn}', to_jsonb(v_turn_key), true);
    elsif v_ruleset = '2014' then
      -- The Bonus Action restriction applies both to Quickened Spell and to
      -- spells whose printed casting time is already a Bonus Action.
      if (v_quickened or v_spell.casting_time = 'Bonus Action')
         and v_choices ->> 'noncantrip_spell_turn' = v_turn_key then
        raise exception 'A leveled spell was already cast this turn';
      end if;
      if not v_quickened
         and v_choices ->> 'bonus_action_spell_turn' = v_turn_key
         and not (v_spell.casting_time = 'Action' and v_spell.level = 0) then
        raise exception 'Only an Action cantrip can follow a Bonus Action spell this turn';
      end if;
      if v_spell.level > 0 then
        v_choices := jsonb_set(v_choices, '{noncantrip_spell_turn}', to_jsonb(v_turn_key), true);
      end if;
      if v_quickened or v_spell.casting_time = 'Bonus Action' then
        v_choices := jsonb_set(v_choices, '{bonus_action_spell_turn}', to_jsonb(v_turn_key), true);
      end if;
    end if;
  end if;

  -- Limited-use feature/innate grants spend a use in the same transaction.
  if v_grant.source_type <> 'class' and v_grant.uses_per_day is not null then
    if coalesce(v_grant.uses_remaining, 0) <= 0 then raise exception 'No innate spell uses remaining'; end if;
    update public.character_spells set uses_remaining = uses_remaining - 1 where id = v_grant.id;
  end if;

  if not v_reactive and p_slot_level > 0 then
    v_slots := public.spend_spell_slot(p_party_member_id, p_slot_level, p_slot_pool, p_slot_template);
  else
    v_slots := v_member.spell_slots;
  end if;

  if v_reactive or p_concentration_state is null then
    v_concentration := v_member.concentration;
  else
    if jsonb_typeof(p_concentration_state) <> 'object'
       or nullif(p_concentration_state ->> 'spellName', '') is null then
      raise exception 'Invalid concentration state';
    end if;
    v_concentration := p_concentration_state;
  end if;

  update public.party_members
    set class_resources = v_resources,
        class_choices = v_choices,
        concentration = v_concentration
    where id = p_party_member_id;

  v_result := jsonb_build_object(
    'spell_slots', v_slots,
    'class_resources', v_resources,
    'concentration', v_concentration,
    'metamagic_cost', v_sp_total,
    'arcane_apotheosis_free', v_free_used,
    'metamagic_choices', coalesce(p_metamagic_choices, '{}'::jsonb)
  );
  if v_grant.source_type <> 'class' and v_grant.uses_per_day is not null then
    v_result := v_result || jsonb_build_object('uses_remaining', v_grant.uses_remaining - 1);
  end if;

  if v_reactive then
    update public.spell_cast_records set
      metamagic_names = array_append(metamagic_names, p_metamagic_names[1]),
      metamagic_choices = metamagic_choices || coalesce(p_metamagic_choices, '{}'::jsonb)
    where id = v_parent.id;
    return v_result || jsonb_build_object('cast_id', v_parent.id, 'reactive', true);
  end if;

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
$function$;

revoke execute on function public.required_level_up_spell_choices(uuid, text, integer, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.required_level_up_spell_choices(uuid, text, integer, text, uuid, uuid) to service_role;
