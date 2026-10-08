begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(9);

-- match_campaign_quests (20261008160126, #599): the quest leg of campaign-wide
-- semantic search. Three things must hold. The scope predicate returns the
-- campaign's own quests plus the campaign OWNER's global (null-campaign)
-- quests, and never another campaign's quest nor another user's global one.
-- The same-model gate keeps vectors from a different embedding model out of the
-- ranking. And the RPC is service-role only: it takes the owner as an argument,
-- so letting a client call it would let anyone name any owner.
--
-- Every row is planted at distance 0 from the query, so a leak shows up as an
-- extra row rather than hiding behind a ranking.

create function pg_temp.vec() returns vector
language sql immutable as $$
  select ('[1' || repeat(',0', 1535) || ']')::vector(1536);
$$;

select has_function(
  'public', 'match_campaign_quests',
  array['vector', 'uuid', 'uuid', 'text', 'integer'],
  'match_campaign_quests exists with the documented signature'
);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('59900000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue599-owner@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('59900000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue599-other@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name) values
  ('59900000-0000-4000-8000-000000000010', '59900000-0000-4000-8000-000000000001', 'T599 Campaign'),
  ('59900000-0000-4000-8000-000000000011', '59900000-0000-4000-8000-000000000001', 'T599 Other Campaign');

insert into public.quests (id, user_id, campaign_id, title, status) values
  ('59900000-0000-4000-8000-0000000000a1', '59900000-0000-4000-8000-000000000001', '59900000-0000-4000-8000-000000000010', 'T599 campaign quest',  'active'),
  ('59900000-0000-4000-8000-0000000000a2', '59900000-0000-4000-8000-000000000001', null,                                   'T599 owner global',     'completed'),
  ('59900000-0000-4000-8000-0000000000a3', '59900000-0000-4000-8000-000000000002', null,                                   'T599 stranger global',  'completed'),
  ('59900000-0000-4000-8000-0000000000a4', '59900000-0000-4000-8000-000000000001', '59900000-0000-4000-8000-000000000011', 'T599 other campaign',   'active'),
  ('59900000-0000-4000-8000-0000000000a5', '59900000-0000-4000-8000-000000000001', '59900000-0000-4000-8000-000000000010', 'T599 wrong model',      'active');

insert into public.quest_embeddings (quest_id, embedding, embedding_model, source_hash) values
  ('59900000-0000-4000-8000-0000000000a1', pg_temp.vec(), 'test-model-599',  'h'),
  ('59900000-0000-4000-8000-0000000000a2', pg_temp.vec(), 'test-model-599',  'h'),
  ('59900000-0000-4000-8000-0000000000a3', pg_temp.vec(), 'test-model-599',  'h'),
  ('59900000-0000-4000-8000-0000000000a4', pg_temp.vec(), 'test-model-599',  'h'),
  ('59900000-0000-4000-8000-0000000000a5', pg_temp.vec(), 'other-model-599', 'h');

create function pg_temp.titles() returns text[]
language sql as $$
  select coalesce(array_agg(title order by title), '{}')
  from public.match_campaign_quests(
    pg_temp.vec(),
    '59900000-0000-4000-8000-000000000010',
    '59900000-0000-4000-8000-000000000001',
    'test-model-599',
    10
  );
$$;

select is(
  pg_temp.titles(),
  array['T599 campaign quest', 'T599 owner global'],
  'returns the campaign''s quests and its owner''s global quests'
);

select ok(
  not ('T599 stranger global' = any (pg_temp.titles())),
  'never returns another user''s global quest'
);

select ok(
  not ('T599 other campaign' = any (pg_temp.titles())),
  'never returns another campaign''s quest, even the same owner''s'
);

select ok(
  not ('T599 wrong model' = any (pg_temp.titles())),
  'the same-model gate keeps a differently-embedded quest out'
);

select is(
  (select status from public.match_campaign_quests(
     pg_temp.vec(), '59900000-0000-4000-8000-000000000010', '59900000-0000-4000-8000-000000000001', 'test-model-599', 10)
   where title = 'T599 campaign quest'),
  'active',
  'returns the quest''s status as text'
);

select ok(
  not has_function_privilege('anon', 'public.match_campaign_quests(vector, uuid, uuid, text, integer)', 'EXECUTE'),
  'anon cannot execute match_campaign_quests'
);

select ok(
  not has_function_privilege('authenticated', 'public.match_campaign_quests(vector, uuid, uuid, text, integer)', 'EXECUTE'),
  'authenticated cannot execute match_campaign_quests'
);

select ok(
  has_function_privilege('service_role', 'public.match_campaign_quests(vector, uuid, uuid, text, integer)', 'EXECUTE'),
  'service_role can execute match_campaign_quests'
);

select * from finish();
rollback;
