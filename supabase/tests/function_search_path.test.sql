begin;

create extension if not exists pgtap with schema extensions;
select plan(2);

-- `function_search_path_mutable` reached production twice before anyone noticed
-- (20260819231506), because nothing failed when it did: the functions worked,
-- the tests passed, and the finding only existed in an advisor report someone
-- had to remember to read.
--
-- Deliberately structural, and deliberately "every function" rather than "every
-- SECURITY DEFINER function". The dangerous case is a definer function, but
-- "no function has a mutable search_path" is a property a query can check,
-- whereas "no *important* one does" is a judgement call re-made per review —
-- which is exactly the kind of rule that decays. Extension-owned functions are
-- excluded because they are not ours to alter.

select is(
  (select coalesce(string_agg(fn, ', ' order by fn), '')
   from (
     select n.nspname || '.' || p.proname as fn
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private')
       and p.prokind = 'f'
       and not exists (
         select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c
         where c like 'search_path=%'
       )
       -- Installed by an extension (pg_net lives in public); not ours to pin.
       and not exists (
         select 1 from pg_depend d
         where d.objid = p.oid and d.deptype = 'e'
       )
   ) missing),
  '',
  'every function in public and private pins its search_path'
);

-- The four this migration fixed, asserted by name so a future CREATE OR REPLACE
-- that drops the setting names the culprit instead of just moving the count.
select is(
  (select count(*)::integer
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where (n.nspname, p.proname) in (
       ('public', 'items_touch_content_updated_at'),
       ('public', 'guard_item_entry_anchors'),
       ('private', 'is_third_party_column'),
       ('private', 'is_withheld_column')
     )
     and exists (
       select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c
       where c like 'search_path=%'
     )),
  4,
  'the four functions found with a mutable search_path stay pinned'
);

select * from finish();
rollback;
