-- Migration: stat_blocks_drop_prose_defense_strings
--
-- Step 2 ("contract") of the #1017 release.
--
-- Every stat block now carries its resistances, immunities, vulnerabilities and
-- condition immunities as one typed `defenses` object, and every trait, action,
-- reaction, legendary and lair entry carries a `structured` payload beside its
-- prose (src/types/statBlock.types.ts). Step 1 wrote both into the existing rows
-- with `npm run stat-blocks:structure -- --write --production --yes-production`,
-- additively, so the client that was live then kept reading the four old strings.
-- The client this migration ships with reads only the structured shape, so the
-- strings go.
--
-- It refuses to run while any stat block still lacks the structured shape: a row
-- the old client created after step 1 ran, or step 1 not having run at all.
-- Dropping the strings from such a row would leave it with no defenses and no
-- rollable actions, and nothing would say so. If this raises, re-run step 1 (it
-- skips rows that are already done) and push again.
--
-- No content is read or written here beyond removing the four keys; the
-- conversion itself needs the TypeScript parser and prose check, which is why it
-- is a script and not SQL.

do $$
declare
  lists constant text[] := array[
    'special_abilities', 'actions', 'bonus_actions', 'reactions', 'legendary_actions', 'lair_actions'
  ];
  tbl text;
  unstructured bigint;
begin
  foreach tbl in array array['library_monsters', 'monsters', 'npcs', 'companions'] loop
    execute format($q$
      select count(*)
        from public.%I t
       where t.stat_block is not null
         and jsonb_typeof(t.stat_block) = 'object'
         and (
           jsonb_typeof(t.stat_block -> 'defenses') is distinct from 'object'
           or exists (
             select 1
               from unnest($1) as l(list)
               cross join lateral jsonb_array_elements(
                 case when jsonb_typeof(t.stat_block -> l.list) = 'array'
                      then t.stat_block -> l.list else '[]'::jsonb end
               ) as e(entry)
              where jsonb_typeof(e.entry -> 'structured') is distinct from 'object'
           )
         )
    $q$, tbl)
    into unstructured
    using lists;

    if unstructured > 0 then
      raise exception
        '% row(s) in public.% have no structured stat block yet. Run step 1 of the #1017 release (npm run stat-blocks:structure -- --write --production --yes-production), then push again.',
        unstructured, tbl;
    end if;

    -- The shape check alone would let an empty `defenses` through beside old
    -- text that still says something, and the update below would then drop the
    -- only copy of it. A row whose old strings carry text must have SOMETHING in
    -- `defenses`: a typed entry or a note. Compared across the whole object, not
    -- per category, because the parser rightly moves condition words filed under
    -- damage immunities ("poisoned") into condition immunities.
    execute format($q$
      select count(*)
        from public.%I t
       where t.stat_block is not null
         and jsonb_typeof(t.stat_block) = 'object'
         and exists (
           select 1
             from unnest(array['damage_resistances', 'damage_immunities', 'damage_vulnerabilities', 'condition_immunities']) as k(key)
            where jsonb_typeof(t.stat_block -> k.key) = 'string'
              and lower(btrim(t.stat_block ->> k.key)) not in ('', 'false', '[]')
         )
         and coalesce(jsonb_array_length(t.stat_block -> 'defenses' -> 'resistances'), 0) = 0
         and coalesce(jsonb_array_length(t.stat_block -> 'defenses' -> 'immunities'), 0) = 0
         and coalesce(jsonb_array_length(t.stat_block -> 'defenses' -> 'vulnerabilities'), 0) = 0
         and coalesce(jsonb_array_length(t.stat_block -> 'defenses' -> 'condition_immunities'), 0) = 0
         and coalesce(btrim(t.stat_block -> 'defenses' ->> 'notes'), '') = ''
    $q$, tbl)
    into unstructured;

    if unstructured > 0 then
      raise exception
        '% row(s) in public.% still carry defense text that their typed defenses do not hold. Re-run step 1 of the #1017 release, then push again.',
        unstructured, tbl;
    end if;

    execute format($q$
      update public.%I
         set stat_block = stat_block
           - 'damage_resistances' - 'damage_immunities' - 'damage_vulnerabilities' - 'condition_immunities'
       where stat_block is not null
         and jsonb_typeof(stat_block) = 'object'
         and stat_block ?| array['damage_resistances', 'damage_immunities', 'damage_vulnerabilities', 'condition_immunities']
    $q$, tbl);
  end loop;
end
$$;
