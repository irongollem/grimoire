-- Review fixes to #1027 (20261008225424, always_prepared_is_earned).
--
-- 1. A pick the subclass took over freed its slot. When a player's own
--    always-prepared feature pick is also a subclass grant, sync_subclass_spells
--    turns the row into the grant (granted_by_subclass, remembering
--    pick_was_always_prepared), and the limits trigger counted only rows that
--    are not grants. The allowance looked unspent, the player could take one
--    more, and when the grant went away restore_subclass_picks put the first
--    back with limits suspended: one more pick than the features grant. A
--    taken-over pick now keeps counting.
-- 2. An unrelated update re-checked an always-prepared row. Both triggers fire
--    on updates of source_class_id, is_prepared and always_prepared, so moving
--    or toggling a row written before the check existed (or one whose feature
--    a lower level no longer grants) failed with 42501. Only a new claim is
--    checked now: an insert, or an update that changes the spell, its class or
--    the flag. Moving a pick to another class is still a new claim on that
--    class's allowance.
-- 3. feature_spell_picks cast a level key after a regex test in the same AND,
--    and Postgres does not promise to evaluate those in order. The cast is
--    guarded with CASE, as sync_subclass_spells does.
--
-- Bodies are otherwise the ones 20261008225424 created, taken from the
-- database as they stand.

CREATE OR REPLACE FUNCTION private.feature_spell_picks(p_class_row uuid)
 RETURNS TABLE(spell_level integer, lists text[], picks integer)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with class_row as (
    select * from public.character_classes where id = p_class_row
  ),
  feature_maps as (
    select definition.features from public.system_classes definition, class_row
     where class_row.class_definition_kind = 'system' and definition.id = class_row.class_definition_id
    union all
    select definition.features from public.custom_classes definition, class_row
     where class_row.class_definition_kind <> 'system' and definition.id = class_row.class_definition_id
    union all
    select definition.features from public.custom_subclasses definition, class_row
     where definition.id = class_row.subclass_definition_id
  ),
  -- Every (feature, class level that grants it) the row has reached.
  granted as (
    select private.try_uuid(listed.feature_id) as feature_id, tier.lvl::integer as at_level
      from feature_maps, class_row,
           jsonb_each(case when jsonb_typeof(feature_maps.features) = 'object'
                           then feature_maps.features else '{}'::jsonb end) tier(lvl, ids),
           jsonb_array_elements_text(case when jsonb_typeof(tier.ids) = 'array'
                                          then tier.ids else '[]'::jsonb end) listed(feature_id)
     where case when tier.lvl ~ '^[0-9]{1,3}$' then tier.lvl::integer <= class_row.levels else false end
  ),
  spell_choices as (
    select feature.id as feature_id, granted.at_level, choice.ordinality as choice_index, choice.value as choice
      from granted
      join public.class_features feature on feature.id = granted.feature_id and feature.kind = 'feature'
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(feature.mechanics -> 'choices') = 'array'
             then feature.mechanics -> 'choices' else '[]'::jsonb end) with ordinality choice(value, ordinality)
     where choice.value -> 'pick' ->> 'kind' = 'spell'
       and jsonb_typeof(choice.value -> 'pick' -> 'level') = 'number'
       and jsonb_typeof(choice.value -> 'pick' -> 'lists') = 'array'
  ),
  -- per_grant: `amount` at every level that grants the feature.
  -- known: the total at the row's level, once per choice (valueAtLevel).
  counted as (
    select (choice -> 'pick' ->> 'level')::integer as spell_level,
           choice -> 'pick' -> 'lists' as lists,
           case when jsonb_typeof(choice -> 'count' -> 'amount') = 'number'
                then (choice -> 'count' ->> 'amount')::integer else 0 end as picks
      from spell_choices
     where choice -> 'count' ->> 'kind' = 'per_grant'
    union all
    select distinct on (feature_id, choice_index)
           (choice -> 'pick' ->> 'level')::integer,
           choice -> 'pick' -> 'lists',
           coalesce((
             select case when jsonb_typeof(known.total) = 'number' then (known.total #>> '{}')::integer else 0 end
               from jsonb_each(case when jsonb_typeof(choice -> 'count' -> 'values') = 'object'
                                    then choice -> 'count' -> 'values' else '{}'::jsonb end) known(lvl, total), class_row
              where case when known.lvl ~ '^[0-9]{1,3}$' then known.lvl::integer <= class_row.levels else false end
              order by known.lvl::integer desc limit 1), 0)
      from spell_choices
     where choice -> 'count' ->> 'kind' = 'known'
  )
  select counted.spell_level,
         array(select distinct lower(list.name)
                 from counted pooled, jsonb_array_elements_text(pooled.lists) list(name)
                where pooled.spell_level = counted.spell_level),
         sum(greatest(counted.picks, 0))::integer
    from counted
   group by counted.spell_level;
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
    if not found or v_spell_slots is null then raise exception '% is not configured as a spellcasting class', v_class.class_name; end if;
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
