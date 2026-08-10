begin;

create extension if not exists pgtap with schema extensions;
select plan(15);

select has_function('public', 'archive_quest_beat', array['uuid', 'bigint', 'uuid', 'boolean'], 'beat archival has one transactional RPC');
select ok((select prosecdef from pg_proc where oid = 'public.archive_quest_beat(uuid,bigint,uuid,boolean)'::regprocedure), 'archive owns runtime writes behind an explicit DM guard');
select ok(not has_function_privilege('anon', 'public.archive_quest_beat(uuid,bigint,uuid,boolean)', 'EXECUTE'), 'anonymous callers cannot archive beats');
select ok(has_function_privilege('authenticated', 'public.archive_quest_beat(uuid,bigint,uuid,boolean)', 'EXECUTE'), 'authenticated DMs can call the archive RPC');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('68300000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue683-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('68300000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue683-outsider@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('68300000-0000-4000-8000-000000000010', '68300000-0000-4000-8000-000000000001', 'Atomic archive campaign');

insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('68300000-0000-4000-8000-000000000010', '68300000-0000-4000-8000-000000000001', 'dm', 'Archive DM')
on conflict (campaign_id, user_id) do update set role = excluded.role;

insert into public.quests (id, user_id, campaign_id, title)
values ('68300000-0000-4000-8000-000000000020', '68300000-0000-4000-8000-000000000001', '68300000-0000-4000-8000-000000000010', 'Archive quest');

insert into public.quest_beats (id, quest_id, campaign_id, title, visibility, kind) values
  ('68300000-0000-4000-8000-000000000030', '68300000-0000-4000-8000-000000000020', '68300000-0000-4000-8000-000000000010', 'Archive me', 'revealed', 'social'),
  ('68300000-0000-4000-8000-000000000031', '68300000-0000-4000-8000-000000000020', '68300000-0000-4000-8000-000000000010', 'Keep me', 'hidden', 'neutral');

insert into public.quest_beat_edges (quest_id, campaign_id, source_beat_id, target_beat_id, label)
values ('68300000-0000-4000-8000-000000000020', '68300000-0000-4000-8000-000000000010', '68300000-0000-4000-8000-000000000030', '68300000-0000-4000-8000-000000000031', 'Continue');

insert into public.npcs (id, user_id, campaign_id, name)
values ('68300000-0000-4000-8000-000000000040', '68300000-0000-4000-8000-000000000001', '68300000-0000-4000-8000-000000000010', 'Retained guide');

insert into public.quest_beat_attachments (id, beat_id, quest_id, campaign_id, attachment_type, ref_id) values
  ('68300000-0000-4000-8000-000000000050', '68300000-0000-4000-8000-000000000030', '68300000-0000-4000-8000-000000000020', '68300000-0000-4000-8000-000000000010', 'npc', '68300000-0000-4000-8000-000000000040'),
  ('68300000-0000-4000-8000-000000000051', '68300000-0000-4000-8000-000000000031', '68300000-0000-4000-8000-000000000020', '68300000-0000-4000-8000-000000000010', 'npc', '68300000-0000-4000-8000-000000000040');

insert into public.quest_beat_transitions (id, campaign_id, to_quest_id, to_beat_id, transition_kind)
values ('68300000-0000-4000-8000-000000000060', '68300000-0000-4000-8000-000000000010', '68300000-0000-4000-8000-000000000020', '68300000-0000-4000-8000-000000000030', 'enter');

set local role authenticated;
select set_config('request.jwt.claim.sub', '68300000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$ select public.archive_quest_beat('68300000-0000-4000-8000-000000000030') $$,
  'campaign DM archives through one call'
);
select is((select kind from public.quest_beats where id = '68300000-0000-4000-8000-000000000030'), 'archived', 'target beat is archived');
select is((select visibility from public.quest_beats where id = '68300000-0000-4000-8000-000000000030'), 'hidden', 'archived beat cannot remain player visible');
select is((select count(*)::integer from public.quest_beat_attachments where beat_id = '68300000-0000-4000-8000-000000000030'), 0, 'beat-owned placements are detached');
select is((select count(*)::integer from public.quest_beat_edges where source_beat_id = '68300000-0000-4000-8000-000000000030' or target_beat_id = '68300000-0000-4000-8000-000000000030'), 0, 'beat-owned routes are detached');
select is((select count(*)::integer from public.quest_beat_transitions where id = '68300000-0000-4000-8000-000000000060'), 1, 'visit history is retained');
select is((select count(*)::integer from public.npcs where id = '68300000-0000-4000-8000-000000000040'), 1, 'authoritative linked entity is retained');
select is((select count(*)::integer from public.quest_refs where quest_id = '68300000-0000-4000-8000-000000000020' and ref_id = '68300000-0000-4000-8000-000000000040'), 1, 'broader quest reference is retained');

select set_config('request.jwt.claim.sub', '68300000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$ select public.archive_quest_beat('68300000-0000-4000-8000-000000000031') $$,
  'P0002',
  'Beat not found or not editable',
  'non-DM cannot archive an opaque beat id'
);

reset role;
select is((select kind from public.quest_beats where id = '68300000-0000-4000-8000-000000000031'), 'neutral', 'failed unauthorized archive leaves the beat unchanged');
select is((select count(*)::integer from public.quest_beat_attachments where beat_id = '68300000-0000-4000-8000-000000000031'), 1, 'failed unauthorized archive leaves prep attached');

select * from finish();
rollback;
