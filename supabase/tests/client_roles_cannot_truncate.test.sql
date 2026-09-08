-- #813: TRUNCATE bypasses RLS, so no client role may hold it — now, or on any
-- table added later.

begin;

create extension if not exists pgtap with schema extensions;
select plan(4);

select is(
  (select count(*)::integer from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee in ('anon', 'authenticated')
      and privilege_type = 'TRUNCATE'),
  0,
  'no table in public grants TRUNCATE to anon or authenticated'
);

select is(
  (select count(*)::integer from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee in ('anon', 'authenticated')
      and privilege_type = 'MAINTAIN'),
  0,
  'nor MAINTAIN — reachable on PG17 with no other privilege'
);

-- The half that lasts. Revoking on existing tables fixes today; the default
-- privilege is what stops the next `create table` in the next migration from
-- handing TRUNCATE straight back. Asserted by creating a table exactly the way
-- a migration does and reading its ACL, rather than by inspecting pg_default_acl
-- — the question is what a new table actually ends up with.
create table public.truncate_default_probe (id uuid primary key default gen_random_uuid());

select is(
  (select count(*)::integer from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'truncate_default_probe'
      and grantee in ('anon', 'authenticated')
      and privilege_type = 'TRUNCATE'),
  0,
  'a newly created table does not inherit TRUNCATE for the client roles'
);

-- …and the revoke did not take the verbs RLS actually governs with it.
select ok(
  (select count(*)::integer from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'truncate_default_probe'
      and grantee = 'authenticated'
      and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')) = 4,
  'while SELECT/INSERT/UPDATE/DELETE still arrive by default, for RLS to gate'
);

drop table public.truncate_default_probe;

select * from finish();
rollback;
