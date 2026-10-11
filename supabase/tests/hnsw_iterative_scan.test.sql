begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(4);

-- Every nearest-neighbour RPC keeps scanning the HNSW index until its filter
-- has passed match_count rows (20261010133319, #999 3.4.3). Without it, an
-- index scan returns the 40 nearest vectors in the whole table and filters
-- afterwards, so a campaign that holds few of them gets fewer rows than asked.

-- Structural: any function in public that orders by cosine distance carries the
-- setting, so a new match_* function cannot ship without it.
select is_empty($q$
  select p.oid::regprocedure::text
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosrc like '%<=>%'
    and not ('hnsw.iterative_scan=strict_order' = any (coalesce(p.proconfig, '{}')))
$q$, 'every public function ordering by vector distance sets hnsw.iterative_scan = strict_order');

-- Behavioural, on match_library_items: 12 items in an enabled source among 400
-- in another, all embedded, and the index scan forced, as the planner chooses
-- it for the library tables. (The campaign tables lost their HNSW indexes in
-- 20261011094127: each search there is narrowed to one scope and sorted
-- exactly, so it cannot starve.)
insert into public.library_items (id, name, source_document_key, source_record_key)
select 't999_item_' || g, 'T999 item ' || g,
       case when g <= 12 then 't999-scope' else 't999-crowd' end,
       't999-item-' || g
from generate_series(1, 412) g;

select setseed(0.343);
insert into public.library_item_embeddings (library_item_id, embedding, embedding_model, source_hash)
select li.id,
       (select array_agg(random())::vector(1536) from generate_series(1, 1536) where li.id is not null),
       'test-model-999', 'h'
from public.library_items li
where li.id like 't999\_item\_%';

create function pg_temp.query() returns vector
language sql stable as $$
  select embedding from public.library_item_embeddings where library_item_id = 't999_item_400';
$$;

-- Without these, a table this small is answered exactly (a sequential scan,
-- then a sort), which never starves. Turning off sorts and sequential scans
-- leaves the plan the library tables get: the HNSW index in distance order.
set local enable_seqscan = off;
set local enable_bitmapscan = off;
set local enable_sort = off;

-- Positive control: the same query without the setting comes up short, so the
-- fixture really does exercise the filtered index scan.
select cmp_ok(
  (select count(*)::int from (
     select e.library_item_id
     from public.library_item_embeddings e join public.library_items li on li.id = e.library_item_id
     where li.source_document_key = 't999-scope'
       and e.embedding_model = 'test-model-999'
     order by e.embedding <=> pg_temp.query()
     limit 10) x),
  '<', 10,
  'control: a filtered HNSW scan without iterative scan returns fewer than match_count rows'
);

select is(
  (select count(*)::int from public.match_library_items(
     pg_temp.query(), array['t999-scope'], 'none', '{}', false, 'test-model-999', 10)),
  10,
  'match_library_items returns match_count rows from a source the index scan would have starved'
);

select is(
  (select array_agg(distance order by distance) from public.match_library_items(
     pg_temp.query(), array['t999-scope'], 'none', '{}', false, 'test-model-999', 10)),
  (select array_agg(distance) from public.match_library_items(
     pg_temp.query(), array['t999-scope'], 'none', '{}', false, 'test-model-999', 10)),
  'rows come back in distance order (strict_order)'
);

select * from finish();
rollback;
