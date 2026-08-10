begin;

create extension if not exists pgtap with schema extensions;
select plan(14);

select has_function('public', 'create_quest_beat_with_route', array['uuid', 'text', 'text', 'double precision', 'double precision', 'uuid', 'text'], 'beat and incoming route share one RPC');
select ok(not (select prosecdef from pg_proc where oid = 'public.create_quest_beat_with_route(uuid,text,text,double precision,double precision,uuid,text)'::regprocedure), 'creation uses caller RLS');
select ok(not has_function_privilege('anon', 'public.create_quest_beat_with_route(uuid,text,text,double precision,double precision,uuid,text)', 'EXECUTE'), 'anonymous creation is revoked');
select ok(has_function_privilege('authenticated', 'public.create_quest_beat_with_route(uuid,text,text,double precision,double precision,uuid,text)', 'EXECUTE'), 'authenticated DMs can call creation');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('68600000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue686-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('68600000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue686-outsider@example.invalid', '', '{}'::jsonb, '{}'::jsonb);
insert into public.campaigns (id, user_id, name) values ('68600000-0000-4000-8000-000000000010', '68600000-0000-4000-8000-000000000001', 'Atomic create campaign');
insert into public.campaign_members (campaign_id, user_id, role, display_name) values ('68600000-0000-4000-8000-000000000010', '68600000-0000-4000-8000-000000000001', 'dm', 'DM') on conflict (campaign_id, user_id) do update set role = excluded.role;
insert into public.quests (id, user_id, campaign_id, title) values ('68600000-0000-4000-8000-000000000020', '68600000-0000-4000-8000-000000000001', '68600000-0000-4000-8000-000000000010', 'Atomic quest');
insert into public.quest_beats (id, quest_id, campaign_id, title) values ('68600000-0000-4000-8000-000000000030', '68600000-0000-4000-8000-000000000020', '68600000-0000-4000-8000-000000000010', 'Source');

set local role authenticated;
select set_config('request.jwt.claim.sub', '68600000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok($$ select public.create_quest_beat_with_route('68600000-0000-4000-8000-000000000020', '  Next scene  ', 'social', 320, 40, '68600000-0000-4000-8000-000000000030', '  If accepted  ') $$, 'DM atomically creates an add-next beat');
select is((select title from public.quest_beats where title = 'Next scene'), 'Next scene', 'title is normalized');
select is((select visibility from public.quest_beats where title = 'Next scene'), 'hidden', 'new beat remains hidden');
select is((select canvas_x::integer from public.quest_beats where title = 'Next scene'), 320, 'submitted graph position is retained');
select is((select label from public.quest_beat_edges where source_beat_id = '68600000-0000-4000-8000-000000000030'), 'If accepted', 'incoming route is created and normalized');

select throws_ok(
  $$ select public.create_quest_beat_with_route('68600000-0000-4000-8000-000000000020', 'Must roll back', 'neutral', 0, 0, '68600000-0000-4000-8000-000000000099', '') $$,
  '23503', null, 'invalid source rejects the transaction'
);
select is((select count(*)::integer from public.quest_beats where title = 'Must roll back'), 0, 'failed route creation leaves no orphan beat');

select lives_ok($$ select public.create_quest_beat_with_route('68600000-0000-4000-8000-000000000020', 'Standalone', 'discovery', 12, 24, null, '') $$, 'standalone beat needs no route');
select is((select count(*)::integer from public.quest_beat_edges e join public.quest_beats b on b.id = e.target_beat_id where b.title = 'Standalone'), 0, 'standalone beat has no incoming route');

select set_config('request.jwt.claim.sub', '68600000-0000-4000-8000-000000000002', true);
select throws_ok($$ select public.create_quest_beat_with_route('68600000-0000-4000-8000-000000000020', 'Forbidden') $$, 'P0002', 'Quest not found or not editable', 'outsider cannot author a beat');

select * from finish();
rollback;
