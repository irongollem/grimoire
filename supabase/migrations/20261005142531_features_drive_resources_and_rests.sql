-- A character's pools and choices come from its features (#976, wave 3).
--
-- Before: a class or subclass carried a `resources` list (the pips) and a
-- `steps` list (the level-up prompts) beside its feature map, so Rage's uses
-- lived on the Barbarian, not on Rage, and a feat could have neither. Now a
-- feature says what it does in `mechanics` (uses, toggle, choices; see
-- src/rules/features/mechanics.types.ts), and the official SRD features get
-- theirs from the admin import's catalogues. This migration:
--
--   1. Moves every homebrew class and subclass resource and step onto a feature
--      of its own, owned like the definition it came from, so nothing a DM
--      built is lost when `resources` and `steps` go (in this epic's cleanup).
--   2. Repairs the 2014 Artificer, which is in no SRD and so gets nothing from
--      the import: its infusion rows were tier markers ("Infusions known: 6,
--      items: 3") at the wrong levels, and the shared "ASI" row had no text.
--   3. Teaches the rest function two things the 2024 rules need and a toggle
--      needs: a pool that recharges on a long rest may give back some uses on a
--      short one (`short_rest_regain`), and any `<toggle>_active` choice ends on
--      every rest. Rage stayed on through the header's rest buttons because only
--      a dead inline button cleared `rage_active`; Rage now lives in
--      `class_choices.rage_active` like every other toggle.

-- ─── helpers ─────────────────────────────────────────────────────────────────

-- "Mise En Place" -> "mise_en_place": the key a pool is stored under.
create function pg_temp.pool_key(p_label text) returns text
language sql immutable as $$
  select nullif(trim(both '_' from lower(regexp_replace(coalesce(p_label, ''), '[^a-zA-Z0-9]+', '_', 'g'))), '');
$$;

-- A 20-entry per-level table as `ByLevel`: only the levels where the value
-- changes, leading zeros left out.
create function pg_temp.by_level(p_values jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_object_agg(lvl::text, val), '{}'::jsonb)
    from (
      select ordinality as lvl, value::int as val,
             lag(value::int) over (order by ordinality) as prev
        from jsonb_array_elements_text(p_values) with ordinality
    ) t
   where val > 0 and (prev is null or prev <> val);
$$;

-- The old resource shape as a `FeatureUses` amount.
create function pg_temp.uses_amount(p_resource jsonb) returns jsonb
language sql immutable as $$
  select case p_resource ->> 'scaling'
    when 'table' then jsonb_build_object('kind', 'by_level', 'values', pg_temp.by_level(p_resource -> 'table_values'))
    when 'per_level' then jsonb_build_object('kind', 'class_level', 'multiplier', 1)
    else jsonb_build_object('kind', 'fixed', 'value',
      coalesce((p_resource ->> 'fixed_value')::int, (p_resource ->> 'amount')::int, 1)) end;
$$;

-- The first level a resource gives anything, where its feature is granted.
create function pg_temp.first_level(p_resource jsonb) returns int
language sql immutable as $$
  select case when p_resource ->> 'scaling' = 'table'
    then coalesce((select min(ordinality)::int from jsonb_array_elements_text(p_resource -> 'table_values') with ordinality
                    where value::int > 0), 1)
    else 1 end;
$$;

-- Adds a feature id to a `{ "<level>": [id, ...] }` map at a level.
create function pg_temp.grant_at(p_map jsonb, p_level int, p_id uuid) returns jsonb
language sql immutable as $$
  select jsonb_set(coalesce(p_map, '{}'::jsonb), array[p_level::text],
    coalesce(p_map -> p_level::text, '[]'::jsonb) || to_jsonb(p_id::text), true);
$$;

-- ─── 1. Homebrew resources and steps become features ─────────────────────────

-- Resources. Official definitions are skipped: their pools come from the
-- import's catalogues, and the 2014 Artificer is repaired below.
do $$
declare
  v_def record;
  v_res jsonb;
  v_key text;
  v_id uuid;
begin
  for v_def in
    select 'custom_classes' as tbl, c.id, c.user_id, c.campaign_id, c.ruleset, c.resources, c.class_name as owner_name, null::int as base_level
      from public.custom_classes c
     where c.user_id is not null and jsonb_typeof(c.resources) = 'array' and jsonb_array_length(c.resources) > 0
    union all
    select 'custom_subclasses', s.id, s.user_id, s.campaign_id, s.ruleset, s.resources, s.subclass_name,
           (select min(k::int) from jsonb_object_keys(case when jsonb_typeof(s.features) = 'object' then s.features else '{}' end) k)
      from public.custom_subclasses s
     where s.user_id is not null and jsonb_typeof(s.resources) = 'array' and jsonb_array_length(s.resources) > 0
  loop
    for v_res in select value from jsonb_array_elements(v_def.resources) loop
      v_key := pg_temp.pool_key(coalesce(v_res ->> 'key', v_res ->> 'label'));
      continue when v_key is null;
      insert into public.class_features (user_id, campaign_id, ruleset, name, kind, source, tags, mechanics)
      values (v_def.user_id, v_def.campaign_id, v_def.ruleset,
              coalesce(nullif(v_res ->> 'label', ''), v_def.owner_name), 'feature', null, '{}',
              jsonb_build_object('uses', jsonb_build_object(
                'key', v_key,
                'label', coalesce(nullif(v_res ->> 'label', ''), v_def.owner_name),
                'amount', pg_temp.uses_amount(v_res),
                'recharge', case when v_res ->> 'rest' = 'short' then 'short' else 'long' end,
                'pool', false)))
      returning id into v_id;
      execute format('update public.%I set features = pg_temp.grant_at(features, $1, $2) where id = $3', v_def.tbl)
        using greatest(pg_temp.first_level(v_res), coalesce(v_def.base_level, 1)), v_id, v_def.id;

      -- A pool stored under its old label ("Mise En Place") keeps what it had.
      update public.party_members pm
         set class_resources = (pm.class_resources - (v_res ->> 'key')) || jsonb_build_object(v_key, pm.class_resources -> (v_res ->> 'key'))
       where pm.class_resources ? (v_res ->> 'key') and (v_res ->> 'key') <> v_key;
    end loop;
  end loop;
end $$;

-- Steps. A step was a level-up prompt with a list of names; it becomes a
-- feature whose choice asks the same thing, stored under the same key, so the
-- picks characters already made stay where they are. A step with no key or no
-- options asked nothing and is dropped.
do $$
declare
  v_def record;
  v_step jsonb;
  v_id uuid;
  v_options jsonb;
begin
  for v_def in
    select 'custom_classes' as tbl, c.id, c.user_id, c.campaign_id, c.ruleset, c.steps
      from public.custom_classes c
     where c.user_id is not null and jsonb_typeof(c.steps) = 'array' and jsonb_array_length(c.steps) > 0
    union all
    select 'custom_subclasses', s.id, s.user_id, s.campaign_id, s.ruleset, s.steps
      from public.custom_subclasses s
     where s.user_id is not null and jsonb_typeof(s.steps) = 'array' and jsonb_array_length(s.steps) > 0
  loop
    for v_step in select value from jsonb_array_elements(v_def.steps) loop
      v_options := coalesce((
        select jsonb_agg(o) from jsonb_array_elements_text(
          case when jsonb_typeof(v_step -> 'options') = 'array' then v_step -> 'options' else '[]' end) o
         where trim(o) <> ''), '[]'::jsonb);
      continue when pg_temp.pool_key(v_step ->> 'key') is null
                 or jsonb_array_length(v_options) = 0
                 or (v_step ->> 'level') is null;
      insert into public.class_features (user_id, campaign_id, ruleset, name, description, kind, source, tags, mechanics)
      values (v_def.user_id, v_def.campaign_id, v_def.ruleset,
              coalesce(nullif(v_step ->> 'label', ''), v_step ->> 'key'),
              null, 'feature', null, '{}',
              jsonb_build_object('choices', jsonb_build_array(jsonb_build_object(
                'key', v_step ->> 'key',
                'label', coalesce(nullif(v_step ->> 'label', ''), v_step ->> 'key'),
                'pick', jsonb_build_object('kind', 'custom', 'options', v_options),
                'count', jsonb_build_object('kind', 'per_grant', 'amount', greatest(coalesce((v_step ->> 'count')::int, 1), 1)),
                'replace_on_level_up', false))))
      returning id into v_id;
      execute format('update public.%I set features = pg_temp.grant_at(features, $1, $2) where id = $3', v_def.tbl)
        using (v_step ->> 'level')::int, v_id, v_def.id;
    end loop;
  end loop;
end $$;

-- ─── 2. The 2014 Artificer ───────────────────────────────────────────────────

-- The shared official "ASI" placeholder (the Artificer and a few homebrew
-- classes still grant it) takes the SRD's own text and becomes the choice it
-- always was.
update public.class_features f
   set name = 'Ability Score Improvement',
       description = (select d.description from public.class_features d
                       where d.user_id is null and d.source_record_key = 'srd_fighter_ability-score-improvement'
                       limit 1),
       mechanics = '{"choices": [{"key": "ability_score_improvement", "label": "Ability Score Improvement",
                     "pick": {"kind": "asi_or_feat"}, "count": {"kind": "per_grant", "amount": 1},
                     "replace_on_level_up": false}]}'::jsonb
 where f.user_id is null and f.source_record_key is null and f.name = 'ASI';

-- The Artificer's official rows are told apart by their tag, the key
-- 20260725000003 used to give them their `grimoire-system` source.
update public.class_features f
   set source = 'grimoire-system'
 where f.user_id is null and 'artificer' = any(f.tags);

-- Infuse Item: one feature, granted at 2, holding the book's table (Tasha's:
-- infusions known 4/6/8/10/12 and infused items 2/3/4/5/6 at 2/6/10/14/18).
-- The tier markers went up at 5, 9, 14 and 18, and the old steps asked at 8 and
-- 12, neither of which is the book. `infusion_slots` and `infusions_known` are
-- the keys characters already store.
update public.class_features f
   set name = 'Infuse Item',
       mechanics = '{"uses": {"key": "infusion_slots", "label": "Infused Items",
                       "amount": {"kind": "by_level", "values": {"2": 2, "6": 3, "10": 4, "14": 5, "18": 6}},
                       "recharge": "long", "pool": false},
                     "choices": [{"key": "infusions_known", "label": "Infusions",
                       "pick": {"kind": "option", "set": "artificer_infusion"},
                       "count": {"kind": "known", "values": {"2": 4, "6": 6, "10": 8, "14": 10, "18": 12}},
                       "replace_on_level_up": true}]}'::jsonb
 where f.user_id is null and 'artificer' = any(f.tags) and f.name like 'Infuse Item%';

update public.class_features f
   set mechanics = '{"activation": "reaction",
                     "uses": {"key": "flash_of_genius", "label": "Flash of Genius",
                       "amount": {"kind": "ability_mod", "ability": "int", "min": 1},
                       "recharge": "long", "pool": false}}'::jsonb
 where f.user_id is null and 'artificer' = any(f.tags) and f.name = 'Flash of Genius';

update public.class_features f
   set mechanics = '{"activation": "action"}'::jsonb
 where f.user_id is null and 'artificer' = any(f.tags) and f.name = 'Magical Tinkering';

-- The tier markers and the "Artificer Specialist feature" placeholders leave
-- the map: a subclass's features come from the subclass.
create temp table artificer_marker on commit drop as
select f.id from public.class_features f
 where f.user_id is null and 'artificer' = any(f.tags)
   and (f.name like 'Infusions known:%' or f.name = 'Artificer Specialist feature');

update public.system_classes sc
   set features = (
     select coalesce(jsonb_object_agg(l.key, kept.ids), '{}'::jsonb)
       from jsonb_each(sc.features) l,
            lateral (select coalesce(jsonb_agg(x.v), '[]'::jsonb) as ids
                       from jsonb_array_elements_text(l.value) x(v)
                      where x.v not in (select id::text from artificer_marker)) kept
      where jsonb_array_length(kept.ids) > 0)
 where sc.ruleset = '2014' and sc.class_name = 'Artificer';

delete from public.class_features f
 where f.id in (select id from artificer_marker)
   and not exists (
     select 1 from public.custom_classes d, jsonb_each(d.features) l, jsonb_array_elements_text(l.value) x(v)
      where x.v = f.id::text)
   and not exists (
     select 1 from public.custom_subclasses d, jsonb_each(d.features) l, jsonb_array_elements_text(l.value) x(v)
      where x.v = f.id::text);

-- ─── 3. Rests ────────────────────────────────────────────────────────────────

update public.party_members
   set class_choices = coalesce(class_choices, '{}'::jsonb) || '{"rage_active": true}'::jsonb
 where rage_active;

create or replace function public.take_spellcasting_rest(p_party_member_id uuid, p_rest text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_member public.party_members%rowtype;
  v_slots jsonb := '[]'::jsonb;
  v_resources jsonb := '{}'::jsonb;
  v_choices jsonb;
  v_ruleset text;
  v_sorcerer_level integer;
begin
  if p_rest not in ('short', 'long') then raise exception 'Invalid rest type'; end if;
  select * into v_member from public.party_members where id = p_party_member_id for update;
  if not found then raise exception 'Party member not found'; end if;
  if not coalesce((v_member.owner_user_id = (select auth.uid()) or (v_member.owner_user_id is null and v_member.user_id = (select auth.uid()))
    or private.is_campaign_dm(v_member.campaign_id)
    or exists (select 1 from public.campaign_members cm
      where cm.user_id = (select auth.uid()) and cm.party_member_id = v_member.id)), false)
  then raise exception 'Access denied'; end if;

  select coalesce(jsonb_agg(
    case
      when p_rest = 'long' and coalesce(slot ->> 'pool', 'spellcasting') = 'temporary' then null
      when p_rest = 'long' and coalesce(slot ->> 'recovery', case when slot ->> 'pool' = 'pact' then 'short' else 'long' end) <> 'none'
        then jsonb_set(slot, '{used}', '0'::jsonb, true)
      when p_rest = 'short' and coalesce(slot ->> 'recovery', case when slot ->> 'pool' = 'pact' then 'short' else 'long' end) = 'short'
        then jsonb_set(slot, '{used}', '0'::jsonb, true)
      else slot
    end order by ordinal
  ) filter (where not (p_rest = 'long' and coalesce(slot ->> 'pool', 'spellcasting') = 'temporary')), '[]'::jsonb)
  into v_slots
  from jsonb_array_elements(coalesce(v_member.spell_slots, '[]'::jsonb)) with ordinality rows(slot, ordinal);

  -- A short rest refills a short-rest pool, and gives a long-rest pool back
  -- its `short_rest_regain` uses (2024 Rage, Channel Divinity, Second Wind).
  select coalesce(jsonb_object_agg(key,
    case
      when (p_rest = 'long' and coalesce(value ->> 'rest', 'long') <> 'none')
        or (p_rest = 'short' and value ->> 'rest' = 'short')
        then jsonb_set(value, '{current}', coalesce(value -> 'max', value -> 'current', '0'::jsonb), true)
      -- The owner writes class_resources freely, so a value that is not a whole
      -- number is skipped rather than allowed to fail every rest of the character.
      when p_rest = 'short' and value ->> 'rest' = 'long'
           and coalesce(value ->> 'short_rest_regain', '') ~ '^[0-9]+$'
           and coalesce(value ->> 'current', '') ~ '^[0-9]+$'
           and coalesce(value ->> 'max', '') ~ '^[0-9]+$'
        then jsonb_set(value, '{current}', to_jsonb(least(
          (value ->> 'max')::int,
          (value ->> 'current')::int + (value ->> 'short_rest_regain')::int)), true)
      else value
    end
  ), '{}'::jsonb) into v_resources
  from jsonb_each(coalesce(v_member.class_resources, '{}'::jsonb));

  v_choices := coalesce(v_member.class_choices, '{}'::jsonb);
  v_ruleset := private.party_member_ruleset(v_member.id);
  v_sorcerer_level := public.sorcerer_level(v_member);
  if v_ruleset = '2024' and v_sorcerer_level >= 5 then
    if p_rest = 'short' and coalesce((v_choices ->> 'sorcerous_restoration_used')::boolean, false) is not true then
      v_choices := jsonb_set(v_choices, '{sorcerous_restoration_available}', 'true'::jsonb, true);
    elsif p_rest = 'long' then
      v_choices := jsonb_set(jsonb_set(v_choices, '{sorcerous_restoration_available}', 'false'::jsonb, true),
        '{sorcerous_restoration_used}', 'false'::jsonb, true);
    end if;
  end if;

  -- Declarative state reset: `_turn`-suffixed keys are turn-scoped and never
  -- survive a long rest; a toggle (`<key>_active`: Rage, Innate Sorcery) lasts
  -- at most minutes, so no rest of an hour or more leaves one on; everything
  -- else resets per class_choice_rest_resets.
  select coalesce(jsonb_object_agg(kv.key,
    case when r.reset_action = 'set_false' or kv.key like '%\_active' escape '\'
         then 'false'::jsonb else kv.value end), '{}'::jsonb)
  into v_choices
  from jsonb_each(v_choices) kv
  left join public.class_choice_rest_resets r
    on r.choice_key = kv.key
   and (r.rest = p_rest or (p_rest = 'long' and r.rest = 'short'))
  where coalesce(r.reset_action, '') <> 'remove'
    and not (p_rest = 'long' and kv.key like '%\_turn' escape '\');

  update public.party_members set
    spell_slots = v_slots,
    class_resources = v_resources,
    class_choices = v_choices
  where id = p_party_member_id;

  update public.character_spells set uses_remaining = uses_per_day
  where party_member_id = p_party_member_id and source_type <> 'class' and uses_per_day is not null
    and (resets_on = 'short_rest' or (p_rest = 'long' and resets_on = 'long_rest'));

  if p_rest = 'long' then
    -- Every rest surface opens the edition-defined preparation window as part
    -- of this transaction; it cannot be skipped by a second client request.
    perform public.open_spell_change_windows(p_party_member_id, 'long_rest');
  end if;

  return jsonb_build_object('spell_slots', v_slots, 'class_resources', v_resources, 'class_choices', v_choices);
end;
$function$;
