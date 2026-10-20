-- A public table is reachable by the Data API only through an explicit grant
-- (20261020192508). These assertions keep CI behaving the way production does
-- after Supabase's 30 Oct 2026 change, so a table shipped without its grants
-- fails here rather than as "permission denied" in production.

begin;

create extension if not exists pgtap with schema extensions;
select plan(4);

-- The default is gone in this stack too. Asserted by creating a table exactly
-- the way a migration does and reading its ACL: the question is what a new
-- table actually ends up with, not what pg_default_acl says.
create table public.explicit_grants_probe (id uuid primary key default gen_random_uuid());

select is(
  (select count(*)::integer from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'explicit_grants_probe'
      and grantee in ('anon', 'authenticated', 'service_role')),
  0,
  'a newly created public table inherits no privilege for anon, authenticated or service_role'
);

-- The block CLAUDE.md tells a migration to write is what makes it reachable.
grant select, insert, update, delete on public.explicit_grants_probe to authenticated, service_role;

select is(
  (select count(*)::integer from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'explicit_grants_probe'
      and grantee = 'authenticated'
      and privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')),
  4,
  'the explicit grant block gives authenticated the four verbs RLS governs'
);

drop table public.explicit_grants_probe;

-- Edge functions reach the database through the Data API as service_role, so
-- every relation in public must be readable by it. Partitions are read through
-- their parent; extension-owned relations are not ours.
select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind in ('r', 'p', 'v', 'm')
     and not c.relispartition
     and not exists (
       select 1 from pg_depend d
       where d.objid = c.oid and d.deptype = 'e'
     )
     and not has_table_privilege('service_role', c.oid, 'SELECT')),
  '',
  'every relation in public is readable by service_role'
);

-- A read policy for signed-in users is a statement that clients read this
-- table. Without the matching grant the policy is dead and every read fails,
-- which is exactly what a forgotten grant looks like.
select is(
  (select coalesce(string_agg(distinct p.tablename, ', ' order by p.tablename), '')
   from pg_policies p
   where p.schemaname = 'public'
     and p.cmd in ('SELECT', 'ALL')
     and p.roles && array['authenticated', 'public']::name[]
     and not has_table_privilege('authenticated', format('public.%I', p.tablename), 'SELECT')),
  '',
  'every public table with a read policy for authenticated grants it SELECT'
);

select * from finish();
rollback;
