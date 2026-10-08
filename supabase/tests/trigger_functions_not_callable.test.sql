begin;

create extension if not exists pgtap with schema extensions;
select plan(1);

-- The trigger system never checks EXECUTE on a trigger function, so no client
-- role needs it, and a definer one with an open grant is a function every audit
-- has to re-prove harmless (20261008232758). CLAUDE.md's Supabase section says
-- to revoke it; this fails when a new one forgets.
select is(
  (select coalesce(string_agg(n.nspname || '.' || p.proname, ', ' order by n.nspname, p.proname), '')
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prorettype = 'trigger'::regtype
      and (has_function_privilege('anon', p.oid, 'execute')
        or has_function_privilege('authenticated', p.oid, 'execute'))),
  '',
  'no trigger function in public or private is executable by anon or authenticated');

select * from finish();
rollback;
