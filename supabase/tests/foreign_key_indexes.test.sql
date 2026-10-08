-- Every foreign key in public has an index its key lookups can use
-- (20261008200258). Without one, a delete of the parent row scans the whole
-- child table, and a parent-to-child join cannot use an index.
--
-- The rule, applied to the live schema rather than the migration text: some
-- index with no predicate, or only "<its leading column> IS NOT NULL" (a lookup
-- on a non-null key can use that), either leads with the key's first column or
-- starts with exactly the key's columns in any order. A composite key's leading
-- id is unique on its own, so indexing it serves the key; that is why this is
-- looser than the Supabase advisor, which wants every key column in key order.
begin;
select plan(2);

select is_empty($q$
  select fk.conrelid::regclass::text || '.' || fk.conname
  from pg_constraint fk join pg_namespace n on n.oid = fk.connamespace
  where fk.contype = 'f' and n.nspname = 'public'
    and not exists (
      select 1 from pg_index i
      where i.indrelid = fk.conrelid
        and i.indisvalid
        and (i.indpred is null
             or pg_get_expr(i.indpred, i.indrelid) = format('(%I IS NOT NULL)',
                  (select attname from pg_attribute where attrelid = i.indrelid and attnum = i.indkey[0])))
        and (i.indkey[0] = fk.conkey[1]
             or ((i.indkey::int2[])[0:array_length(fk.conkey, 1) - 1] @> fk.conkey
                 and (i.indkey::int2[])[0:array_length(fk.conkey, 1) - 1] <@ fk.conkey)))
$q$, 'every foreign key in public has an index its lookups can use');

-- The rule must not accept a partial index whose predicate a key lookup cannot
-- use: document_imports.user_id had only one limited to open statuses.
select ok(exists (
  select 1 from pg_index i
  where i.indrelid = 'public.document_imports'::regclass
    and i.indisvalid
    and i.indpred is null
    and i.indkey[0] = (select attnum from pg_attribute
                       where attrelid = 'public.document_imports'::regclass and attname = 'user_id')
), 'a status-limited partial index does not count: document_imports.user_id has a full one');

select * from finish();
rollback;
