-- An always-prepared spell is earned, and the subclass bookkeeping is the
-- server's (#1027).
--
-- `character_spells.always_prepared` skips the class-list gate in
-- validate_character_spell_source and every count in
-- validate_character_spell_limits. Both trusted the flag, and the flag was
-- whatever the writer said: a client inserting a row directly, and just as
-- well apply_level_up, which copies `always_prepared` out of its client-built
-- p_spell_rows. Either way a character could take any spell up to its maximum
-- spell level, from any list, without it counting.
--
-- Moving the writes behind a definer would not have closed that, because the
-- definer that already exists passes the flag through. So the triggers stop
-- trusting it instead, whoever writes the row:
--
-- 1. An always-prepared class row is either a subclass grant (granted_by_subclass,
--    which only the server may set, below) or a class feature's spell pick
--    (Arcane Initiate's wizard cantrips, Arcane Mastery). For a pick, the class
--    row's own features must hold a spell choice of that spell level whose
--    lists the spell is on, and the class may hold no more such rows at that
--    level than its features grant picks. private.feature_spell_picks reads
--    that allowance from the class and subclass definitions' `features` maps
--    ({ "<class level>": [class_features id] }) and each feature's
--    `mechanics.choices`, as levelUpChoices.ts and choicePicksDue do on the
--    client. Lists are pooled per spell level, which is exact for every
--    feature in the library (one spell choice per level) and an upper bound for
--    a homebrew feature that mixes lists at one level.
--    Creation and level-up keep writing these rows as they do now; they pass
--    because the picks they write are the ones the features offer.
--    A copy or a ruleset conversion (grimoire.spell_limits suspended) carries
--    rows as they stand. Production holds four always-prepared rows that are
--    neither: subclass spells a client wrote before the sync existed, on
--    subclasses whose definition lists no grants. They stay; only a new write
--    is checked.
--
-- 2. granted_by_subclass, pick_was_prepared and pick_was_always_prepared are
--    written only by private.sync_subclass_spells / restore_subclass_picks and
--    by the copy. A client write of any of them is refused. So is a client
--    changing what a granted row IS (its spell, class, source, label, member,
--    or always_prepared): the flag exempts the row from both checks, so a
--    granted row retargeted at another spell would be any spell for free, and
--    one moved off its class would escape the sync that cleans it up.
--    Only a class row can be always prepared (a check constraint): a feat's,
--    species', item's or other source's spell is the player's own record, as
--    it was before, and nothing ever wrote one always prepared (production
--    holds none). The guard is SECURITY
--    INVOKER, so a client write runs it as `authenticated` and every definer
--    path as its owner, the pattern guard_party_member_owner uses.
--
-- 3. copy_party_member (clone, assume, convert-as-copy) lost the subclass
--    variant, and copied each subclass grant on top of the row the sync had
--    just written for the new class row. character_spells_party_member_spell_
--    source_class_key refuses the second, so since 20261008165034 copying any
--    character that holds a subclass grant failed outright. It now copies the
--    variant and the grant columns, and its copied rows replace the sync's
--    fresh ones.
--
-- Two things stay as they were, on purpose. A homebrew class or subclass can
-- give itself a feature that picks any spell; that content is benched by the
-- table's approval review until its DM accepts it, which is the boundary for
-- homebrew everywhere else too. And the limits trigger now locks the class row
-- before counting, so two inserts racing each other cannot both fit under a
-- limit (true of every spell limit, not only the new one).

alter table public.character_spells
  add constraint character_spells_always_prepared_is_a_class_spell
  check (not always_prepared or source_type = 'class');

-- ── The allowance ───────────────────────────────────────────────────────────

create function private.feature_spell_picks(p_class_row uuid)
returns table (spell_level integer, lists text[], picks integer)
language sql
stable
set search_path = ''
as $$
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
     where tier.lvl ~ '^[0-9]{1,3}$' and tier.lvl::integer <= class_row.levels
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
              where known.lvl ~ '^[0-9]{1,3}$' and known.lvl::integer <= class_row.levels
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
$$;

comment on function private.feature_spell_picks(uuid) is
  'The always-prepared spell picks a class row''s class and subclass features grant by its level: per spell level, the lists (lower-cased) and how many. Read by validate_character_spell_source and validate_character_spell_limits (#1027).';

revoke execute on function private.feature_spell_picks(uuid) from public, anon, authenticated;

-- ── The two spell triggers ──────────────────────────────────────────────────

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
  if new.always_prepared and not new.granted_by_subclass and v_enforce
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
    v_spell_level := public.character_spell_level(new.spell_id);
    select coalesce(sum(pick.picks), 0) into v_limit
    from private.feature_spell_picks(new.source_class_id) pick
    where pick.spell_level = v_spell_level;
    select count(*) into v_existing from public.character_spells existing
    where existing.source_class_id = new.source_class_id
      and existing.source_type = 'class' and existing.always_prepared and not existing.granted_by_subclass
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

-- ── The server's columns ────────────────────────────────────────────────────

create function private.guard_character_spell_server_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.granted_by_subclass or new.pick_was_prepared is not null or new.pick_was_always_prepared is not null then
      raise exception 'Subclass grants are written by the server' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.granted_by_subclass is distinct from old.granted_by_subclass
     or new.pick_was_prepared is distinct from old.pick_was_prepared
     or new.pick_was_always_prepared is distinct from old.pick_was_always_prepared
     or (old.granted_by_subclass and (
           new.always_prepared is distinct from old.always_prepared
           or new.spell_id is distinct from old.spell_id
           or new.source_type is distinct from old.source_type
           or new.source_class_id is distinct from old.source_class_id
           or new.source_label is distinct from old.source_label
           or new.party_member_id is distinct from old.party_member_id)) then
    raise exception 'Subclass grants are written by the server' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_character_spell_server_columns() from public, anon, authenticated;

create trigger character_spells_guard_server_columns
  before insert or update of granted_by_subclass, pick_was_prepared, pick_was_always_prepared, always_prepared,
    spell_id, source_type, source_class_id, source_label, party_member_id
  on public.character_spells
  for each row execute function private.guard_character_spell_server_columns();

-- ── The copy ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION private.copy_party_member(p_source_id uuid, p_overrides jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_new_id uuid := gen_random_uuid();
  v_class record;
  v_new_class_id uuid;
  v_class_map jsonb := '{}'::jsonb;
  v_prev_limits text := current_setting('grimoire.spell_limits', true);
begin
  insert into public.party_members
  select (jsonb_populate_record(null::public.party_members,
            to_jsonb(pm)
            || jsonb_build_object('id', v_new_id, 'created_at', now(), 'updated_at', now())
            || p_overrides)).*
    from public.party_members pm
   where pm.id = p_source_id;
  if not found then
    raise exception 'Character not found';
  end if;

  for v_class in
    select * from public.character_classes
     where party_member_id = p_source_id
     order by sort_order
  loop
    insert into public.character_classes
      (party_member_id, class_name, subclass_name, levels, is_primary, hit_dice_used, sort_order,
       class_definition_id, class_definition_kind, subclass_definition_id, subclass_variant)
    values
      (v_new_id, v_class.class_name, v_class.subclass_name, v_class.levels,
       v_class.is_primary, v_class.hit_dice_used, v_class.sort_order,
       v_class.class_definition_id, v_class.class_definition_kind, v_class.subclass_definition_id,
       v_class.subclass_variant)
    returning id into v_new_class_id;
    v_class_map := v_class_map
      || jsonb_build_object(v_class.id::text, v_new_class_id::text);
  end loop;

  -- A copy is not a new choice, so the count limit stands down: a character
  -- over its limit (a conversion can leave one there) must still be copyable.
  perform set_config('grimoire.spell_limits', 'suspended', true);
  -- Inserting the class rows ran the subclass sync, which wrote the grants
  -- afresh. The source's own rows say more (a grant that took over a pick
  -- remembers the pick), so they replace the fresh ones rather than doubling them.
  delete from public.character_spells
   where party_member_id = v_new_id and granted_by_subclass;
  insert into public.character_spells
    (party_member_id, spell_id, is_known, is_prepared, source_class_id,
     source_type, uses_per_day, uses_remaining, resets_on, source_label,
     always_prepared, casting_ability, granted_by_subclass,
     pick_was_prepared, pick_was_always_prepared)
  select v_new_id, cs.spell_id, cs.is_known, cs.is_prepared,
         (v_class_map ->> cs.source_class_id::text)::uuid,
         cs.source_type, cs.uses_per_day, cs.uses_remaining, cs.resets_on,
         cs.source_label, cs.always_prepared, cs.casting_ability, cs.granted_by_subclass,
         cs.pick_was_prepared, cs.pick_was_always_prepared
    from public.character_spells cs
   where cs.party_member_id = p_source_id;
  perform set_config('grimoire.spell_limits', coalesce(v_prev_limits, ''), true);

  return v_new_id;
end;
$function$;
