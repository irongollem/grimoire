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

-- Behavioural, on match_campaign_quests: 12 quests in scope among 400 in
-- another campaign, all embedded, and the index scan forced, as the planner
-- will choose it once the tables grow.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('99934300-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue999-hnsw@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name) values
  ('99934300-0000-4000-8000-000000000010', '99934300-0000-4000-8000-000000000001', 'T999 scope'),
  ('99934300-0000-4000-8000-000000000011', '99934300-0000-4000-8000-000000000001', 'T999 crowd');

insert into public.quests (id, user_id, campaign_id, title, status)
select gen_random_uuid(), '99934300-0000-4000-8000-000000000001',
       case when g <= 12 then '99934300-0000-4000-8000-000000000010'::uuid
            else '99934300-0000-4000-8000-000000000011'::uuid end,
       'T999 quest ' || g, 'active'
from generate_series(1, 412) g;

select setseed(0.343);
insert into public.quest_embeddings (quest_id, embedding, embedding_model, source_hash)
select q.id,
       (select array_agg(random())::vector(1536) from generate_series(1, 1536) where q.id is not null),
       'test-model-999', 'h'
from public.quests q
where q.user_id = '99934300-0000-4000-8000-000000000001';

create function pg_temp.query() returns vector
language sql stable as $$
  select e.embedding from public.quest_embeddings e join public.quests q on q.id = e.quest_id
  where q.title = 'T999 quest 400';
$$;

-- Without these, a table this small is answered exactly (the campaign index,
-- then a sort), which never starves. Turning off sorts and sequential scans
-- leaves the plan production gets at scale: the HNSW index in distance order.
set local enable_seqscan = off;
set local enable_bitmapscan = off;
set local enable_sort = off;

-- Positive control: the same query without the setting comes up short, so the
-- fixture really does exercise the filtered index scan.
select cmp_ok(
  (select count(*)::int from (
     select e.quest_id
     from public.quest_embeddings e join public.quests q on q.id = e.quest_id
     where q.campaign_id = '99934300-0000-4000-8000-000000000010'
       and e.embedding_model = 'test-model-999'
     order by e.embedding <=> pg_temp.query()
     limit 10) x),
  '<', 10,
  'control: a filtered HNSW scan without iterative scan returns fewer than match_count rows'
);

select is(
  (select count(*)::int from public.match_campaign_quests(
     pg_temp.query(),
     '99934300-0000-4000-8000-000000000010',
     '99934300-0000-4000-8000-000000000001',
     'test-model-999',
     10)),
  10,
  'match_campaign_quests returns match_count rows from a scope the index scan would have starved'
);

select is(
  (select array_agg(distance order by distance) from public.match_campaign_quests(
     pg_temp.query(),
     '99934300-0000-4000-8000-000000000010',
     '99934300-0000-4000-8000-000000000001',
     'test-model-999',
     10)),
  (select array_agg(distance) from public.match_campaign_quests(
     pg_temp.query(),
     '99934300-0000-4000-8000-000000000010',
     '99934300-0000-4000-8000-000000000001',
     'test-model-999',
     10)),
  'rows come back in distance order (strict_order)'
);

select * from finish();
rollback;
