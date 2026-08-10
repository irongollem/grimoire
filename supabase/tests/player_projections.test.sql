begin;

create extension if not exists pgtap with schema extensions;

-- Guard against stale `returns setof <table>` projection functions.
--
-- A projection with a hand-maintained positional column list silently breaks
-- with `42P13 return type mismatch` the moment its table gains a column —
-- SQL-function bodies are only validated when the function first EXECUTES, so
-- neither `create or replace` nor a LIMIT 0 plan catches it. This happened in
-- production twice in one migration (20260720000018 widened `monsters` and
-- `items`; get_player_visible_monsters/get_player_visible_items then failed
-- for every real player until 20260724000005 recreated them).
--
-- This test EXECUTES (limit 1) every set-returning function in `public` whose
-- return type is a table row type, so any future table widening that forgets
-- its projections fails CI here instead of production. New projections are
-- covered automatically — no per-function registration needed.

select plan(1);

-- Player-safe projections intentionally reject anonymous callers before they
-- inspect campaign membership. Give the schema guard a syntactically valid
-- authenticated identity; the placeholder user need not belong to a campaign
-- for the function bodies to execute and validate their return shapes.
select set_config(
  'request.jwt.claim.sub',
  '00000000-0000-4000-8000-000000000000',
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);

create or replace function pg_temp.broken_projections()
returns setof text
language plpgsql as $fn$
declare
  r record;
  argsql text;
begin
  for r in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prorettype in (select reltype from pg_class where relkind = 'r')
      and p.proretset
  loop
    -- Dummy args: any uuid/uuid[] gets a placeholder, everything else null.
    -- The goal is executing the body once, not returning meaningful rows.
    select coalesce(string_agg(
      case
        when a like '%uuid[]%' then 'null::uuid[]'
        when a like '%preview%' then 'null::uuid'
        when a like '%uuid%'   then '''00000000-0000-4000-8000-000000000000''::uuid'
        else 'null'
      end, ', '), '')
    into argsql
    from unnest(string_to_array(nullif(r.args, ''), ', ')) a;
    begin
      execute format('select * from public.%I(%s) limit 1', r.proname, argsql);
    exception when others then
      return next r.proname || ': ' || sqlerrm;
    end;
  end loop;
end $fn$;

select is(
  (select coalesce(string_agg(b, '; '), '') from pg_temp.broken_projections() b),
  '',
  'every setof-table function executes against the current schema (no stale positional column lists)'
);

select * from finish();
rollback;
