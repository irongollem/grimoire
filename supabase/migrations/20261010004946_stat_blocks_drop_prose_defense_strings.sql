-- Migration: stat_blocks_drop_prose_defense_strings
--
-- Step 2 ("contract") of the #1017 release.
--
-- Every stat block now carries its resistances, immunities, vulnerabilities and
-- condition immunities as one typed `defenses` object, and every trait, action,
-- reaction, legendary and lair entry carries a `structured` payload beside its
-- prose (src/types/statBlock.types.ts). Step 1 wrote both into the existing rows
-- (`npm run stat-blocks:release -- before-merge`), additively, so the client that
-- was live then kept reading the four old strings. The client this migration
-- ships with reads only the structured shape.
--
-- Two parts.
--
-- 1. Drop the four old strings, but only from rows where that loses nothing: the
--    block is structured, and any old text that says something has a typed entry
--    or a note in `defenses` (the same rule as `contractBlocker` in
--    scripts/stat-blocks/structureRows.ts, which the release checks before the
--    merge). A row that fails it is a straggler the old client saved after step 1;
--    it is left alone, counted in a NOTICE, and converted by
--    `npm run stat-blocks:release -- after-merge`. This used to RAISE instead, but
--    a failed migration strands every migration queued behind it while Vercel
--    deploys the client regardless, which is worse than a row the release script
--    converts minutes later.
--
-- 2. Guard every later write (`private.guard_stat_block_shape`), because the old
--    client lives on in installed PWAs and cached tabs for days after a release,
--    and each stat block it saved would otherwise crash the new client:
--    - old defense text that says something is refused ("reload the app"): only
--      the app's parser can structure it, and dropping it would lose it;
--    - empty old strings are dropped;
--    - a missing `defenses` becomes an empty one;
--    - an entry with no `structured` becomes `{kind: "other", source: "parsed"}`:
--      prose kept, no roll offered, and the editor re-parses it on the next edit.
--    This is a write-time invariant, not a read fallback: nothing reads the old
--    shape, because the old shape can no longer be stored.

create function pg_temp.stat_block_passes_contract(b jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    jsonb_typeof(b -> 'defenses') = 'object'
    and not exists (
      select 1
        from unnest(array['special_abilities', 'actions', 'bonus_actions', 'reactions', 'legendary_actions', 'lair_actions']) as l(list)
        cross join lateral jsonb_array_elements(
          case when jsonb_typeof(b -> l.list) = 'array' then b -> l.list else '[]'::jsonb end
        ) as e(entry)
       where jsonb_typeof(e.entry) is distinct from 'object'
          or jsonb_typeof(e.entry -> 'structured') is distinct from 'object'
    )
    and not (
      exists (
        select 1
          from unnest(array['damage_resistances', 'damage_immunities', 'damage_vulnerabilities', 'condition_immunities']) as k(key)
         where jsonb_typeof(b -> k.key) = 'string'
           and lower(btrim(b ->> k.key)) not in ('', 'false', '[]')
      )
      and coalesce(jsonb_array_length(b -> 'defenses' -> 'resistances'), 0) = 0
      and coalesce(jsonb_array_length(b -> 'defenses' -> 'immunities'), 0) = 0
      and coalesce(jsonb_array_length(b -> 'defenses' -> 'vulnerabilities'), 0) = 0
      and coalesce(jsonb_array_length(b -> 'defenses' -> 'condition_immunities'), 0) = 0
      and coalesce(btrim(b -> 'defenses' ->> 'notes'), '') = ''
    )
$$;

do $$
declare
  tbl text;
  left_alone bigint;
begin
  foreach tbl in array array['library_monsters', 'monsters', 'npcs', 'companions', 'hall_of_heroes'] loop
    execute format($q$
      update public.%I
         set stat_block = stat_block
           - 'damage_resistances' - 'damage_immunities' - 'damage_vulnerabilities' - 'condition_immunities'
       where jsonb_typeof(stat_block) = 'object'
         and stat_block ?| array['damage_resistances', 'damage_immunities', 'damage_vulnerabilities', 'condition_immunities']
         and pg_temp.stat_block_passes_contract(stat_block)
    $q$, tbl);

    execute format($q$
      select count(*) from public.%I
       where jsonb_typeof(stat_block) = 'object' and not pg_temp.stat_block_passes_contract(stat_block)
    $q$, tbl)
    into left_alone;

    if left_alone > 0 then
      raise notice '% row(s) in public.% are not structured yet; run npm run stat-blocks:release -- after-merge to convert them.',
        left_alone, tbl;
    end if;
  end loop;
end
$$;

create function private.guard_stat_block_shape()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  b jsonb := new.stat_block;
  k text;
  l text;
begin
  if b is null or jsonb_typeof(b) <> 'object' then
    return new;
  end if;

  foreach k in array array['damage_resistances', 'damage_immunities', 'damage_vulnerabilities', 'condition_immunities'] loop
    if jsonb_typeof(b -> k) = 'string' and lower(btrim(b ->> k)) not in ('', 'false', '[]') then
      raise exception 'This stat block was saved in an older format. Reload the app and save it again.'
        using errcode = 'check_violation',
              detail = format('%s still holds prose; stat blocks now keep defenses in a typed `defenses` object (#1017).', k);
    end if;
    b := b - k;
  end loop;

  if jsonb_typeof(b -> 'defenses') is distinct from 'object' then
    b := b || jsonb_build_object('defenses', jsonb_build_object(
      'resistances', '[]'::jsonb, 'immunities', '[]'::jsonb, 'vulnerabilities', '[]'::jsonb, 'condition_immunities', '[]'::jsonb
    ));
  end if;

  foreach l in array array['special_abilities', 'actions', 'bonus_actions', 'reactions', 'legendary_actions', 'lair_actions'] loop
    if jsonb_typeof(b -> l) = 'array' then
      b := jsonb_set(b, array[l], (
        select coalesce(jsonb_agg(
                 case
                   when jsonb_typeof(x.entry) = 'object' and jsonb_typeof(x.entry -> 'structured') is distinct from 'object'
                   then x.entry || jsonb_build_object('structured', jsonb_build_object('kind', 'other', 'source', 'parsed'))
                   else x.entry
                 end
                 order by x.ord
               ), '[]'::jsonb)
          from jsonb_array_elements(b -> l) with ordinality as x(entry, ord)
      ));
    end if;
  end loop;

  new.stat_block := b;
  return new;
end
$$;

-- A trigger function needs no EXECUTE grant (the trigger system bypasses the
-- check); keep it off every role's callable surface.
revoke execute on function private.guard_stat_block_shape() from public, anon, authenticated;

create trigger library_monsters_stat_block_shape
  before insert or update of stat_block on public.library_monsters
  for each row execute procedure private.guard_stat_block_shape();

create trigger monsters_stat_block_shape
  before insert or update of stat_block on public.monsters
  for each row execute procedure private.guard_stat_block_shape();

create trigger npcs_stat_block_shape
  before insert or update of stat_block on public.npcs
  for each row execute procedure private.guard_stat_block_shape();

create trigger companions_stat_block_shape
  before insert or update of stat_block on public.companions
  for each row execute procedure private.guard_stat_block_shape();

create trigger hall_of_heroes_stat_block_shape
  before insert or update of stat_block on public.hall_of_heroes
  for each row execute procedure private.guard_stat_block_shape();
