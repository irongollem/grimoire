begin;

create extension if not exists pgtap with schema extensions;
select plan(28);

select has_function('public', 'get_player_visible_quest_beats', array['uuid', 'uuid'], 'player beats use a dedicated projection');
select hasnt_function('public', 'get_player_visible_quest_beat_history', array['uuid', 'uuid'], 'visit history adds no second security-definer endpoint');
select ok(not has_function_privilege('anon', 'public.get_player_visible_quest_beats(uuid,uuid)', 'EXECUTE'), 'anonymous users cannot execute the beat projection');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'get_player_visible_quest_beat%'), 1, 'beats and history share one auditable player endpoint');
select ok(position('auth.uid() is null' in lower(pg_get_functiondef('public.get_player_visible_quest_beats(uuid,uuid)'::regprocedure))) > 0, 'the security-definer projection rejects missing authentication before reading data');
select is((select count(*)::integer from pg_publication_tables where pubname = 'supabase_realtime' and tablename in ('quest_beats', 'quest_beat_edges', 'quest_beat_attachments', 'quest_beat_transitions')), 0, 'raw quest topology never enters realtime payloads');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('67400000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue674-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('67400000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue674-player-a@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('67400000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue674-player-b@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('67400000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue674-attacker@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('67400000-0000-4000-8000-000000000010', '67400000-0000-4000-8000-000000000001', 'Player-safe beats');
insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('67400000-0000-4000-8000-000000000010', '67400000-0000-4000-8000-000000000001', 'dm', 'DM')
on conflict (campaign_id, user_id) do update set role = excluded.role;

insert into public.party_members (id, user_id, owner_user_id, campaign_id, name) values
  ('67400000-0000-4000-8000-000000000020', '67400000-0000-4000-8000-000000000001', '67400000-0000-4000-8000-000000000002', '67400000-0000-4000-8000-000000000010', 'Hero A'),
  ('67400000-0000-4000-8000-000000000021', '67400000-0000-4000-8000-000000000001', '67400000-0000-4000-8000-000000000003', '67400000-0000-4000-8000-000000000010', 'Hero B');
insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('67400000-0000-4000-8000-000000000010', '67400000-0000-4000-8000-000000000002', 'player', 'Player A', '67400000-0000-4000-8000-000000000020'),
  ('67400000-0000-4000-8000-000000000010', '67400000-0000-4000-8000-000000000003', 'player', 'Player B', '67400000-0000-4000-8000-000000000021');

insert into public.quests (id, user_id, campaign_id, title, player_visible_to) values
  ('67400000-0000-4000-8000-000000000030', '67400000-0000-4000-8000-000000000001', '67400000-0000-4000-8000-000000000010', 'Quest A only', array['67400000-0000-4000-8000-000000000020']::uuid[]),
  ('67400000-0000-4000-8000-000000000031', '67400000-0000-4000-8000-000000000001', '67400000-0000-4000-8000-000000000010', 'Quest B only', array['67400000-0000-4000-8000-000000000021']::uuid[]);

insert into public.quest_beats (
  id, quest_id, campaign_id, title, dm_content, rumor_text, reveal_text, read_aloud, how_it_plays, visibility, is_improvised
) values
  ('67400000-0000-4000-8000-000000000040', '67400000-0000-4000-8000-000000000030', '67400000-0000-4000-8000-000000000010', 'Hidden title', 'DM hidden', 'Rumor A', 'Reveal A', 'Never fallback read aloud', 'Never fallback guidance', 'rumored', false),
  ('67400000-0000-4000-8000-000000000041', '67400000-0000-4000-8000-000000000030', '67400000-0000-4000-8000-000000000010', 'Revealed title', 'DM revealed', 'Unused rumor', 'Reveal B', 'Secret script', 'Secret playbook', 'revealed', false),
  ('67400000-0000-4000-8000-000000000042', '67400000-0000-4000-8000-000000000030', '67400000-0000-4000-8000-000000000010', 'Hidden branch', 'Hidden branch DM', 'Hidden rumor copy', 'Hidden reveal copy', 'Hidden script', 'Hidden playbook', 'hidden', false),
  ('67400000-0000-4000-8000-000000000043', '67400000-0000-4000-8000-000000000030', '67400000-0000-4000-8000-000000000010', 'Improvised secret', 'Improvised DM', null, 'Improvised reveal', null, null, 'hidden', true),
  ('67400000-0000-4000-8000-000000000044', '67400000-0000-4000-8000-000000000031', '67400000-0000-4000-8000-000000000010', 'B scene', 'B DM', null, 'B reveal', null, null, 'revealed', false);

insert into public.quest_beat_edges (quest_id, campaign_id, source_beat_id, target_beat_id, label) values
  ('67400000-0000-4000-8000-000000000030', '67400000-0000-4000-8000-000000000010', '67400000-0000-4000-8000-000000000040', '67400000-0000-4000-8000-000000000042', 'Secret betrayal route'),
  ('67400000-0000-4000-8000-000000000030', '67400000-0000-4000-8000-000000000010', '67400000-0000-4000-8000-000000000040', '67400000-0000-4000-8000-000000000041', 'Visible destination but DM-only edge');

insert into public.quest_objectives (id, quest_id, description, is_player_visible) values
  ('67400000-0000-4000-8000-000000000050', '67400000-0000-4000-8000-000000000030', 'Visible objective', true),
  ('67400000-0000-4000-8000-000000000051', '67400000-0000-4000-8000-000000000030', 'Secret objective', false);
insert into public.npcs (id, user_id, campaign_id, name) values
  ('67400000-0000-4000-8000-000000000060', '67400000-0000-4000-8000-000000000001', '67400000-0000-4000-8000-000000000010', 'Visible ref target'),
  ('67400000-0000-4000-8000-000000000061', '67400000-0000-4000-8000-000000000001', '67400000-0000-4000-8000-000000000010', 'Secret ref target');
insert into public.quest_refs (id, quest_id, ref_type, ref_id, is_player_visible) values
  ('67400000-0000-4000-8000-000000000070', '67400000-0000-4000-8000-000000000030', 'npc', '67400000-0000-4000-8000-000000000060', true),
  ('67400000-0000-4000-8000-000000000071', '67400000-0000-4000-8000-000000000030', 'npc', '67400000-0000-4000-8000-000000000061', false);
insert into public.quest_beat_attachments (id, beat_id, quest_id, campaign_id, attachment_type, ref_id, role) values
  ('67400000-0000-4000-8000-000000000080', '67400000-0000-4000-8000-000000000041', '67400000-0000-4000-8000-000000000030', '67400000-0000-4000-8000-000000000010', 'objective', '67400000-0000-4000-8000-000000000050', 'goal'),
  ('67400000-0000-4000-8000-000000000081', '67400000-0000-4000-8000-000000000041', '67400000-0000-4000-8000-000000000030', '67400000-0000-4000-8000-000000000010', 'objective', '67400000-0000-4000-8000-000000000051', 'secret'),
  ('67400000-0000-4000-8000-000000000082', '67400000-0000-4000-8000-000000000041', '67400000-0000-4000-8000-000000000030', '67400000-0000-4000-8000-000000000010', 'quest_ref', '67400000-0000-4000-8000-000000000070', 'ally'),
  ('67400000-0000-4000-8000-000000000083', '67400000-0000-4000-8000-000000000041', '67400000-0000-4000-8000-000000000030', '67400000-0000-4000-8000-000000000010', 'quest_ref', '67400000-0000-4000-8000-000000000071', 'traitor');

insert into public.quest_beat_transitions (
  id, campaign_id, to_quest_id, to_beat_id, transition_kind, runtime_version, to_quest_title, to_beat_title, provenance, created_at
) values
  ('67400000-0000-4000-8000-000000000090', '67400000-0000-4000-8000-000000000010', '67400000-0000-4000-8000-000000000030', '67400000-0000-4000-8000-000000000040', 'enter', 1, 'Quest A only', 'Hidden title', '{"edge_label":"DM edge"}', now() - interval '4 minutes'),
  ('67400000-0000-4000-8000-000000000091', '67400000-0000-4000-8000-000000000010', '67400000-0000-4000-8000-000000000030', '67400000-0000-4000-8000-000000000042', 'jump', 2, 'Quest A only', 'Hidden branch', '{"edge_label":"Secret betrayal route"}', now() - interval '3 minutes'),
  ('67400000-0000-4000-8000-000000000092', '67400000-0000-4000-8000-000000000010', '67400000-0000-4000-8000-000000000030', '67400000-0000-4000-8000-000000000043', 'improv', 3, 'Quest A only', 'Improvised secret', '{"reason":"unexpected"}', now() - interval '2 minutes'),
  ('67400000-0000-4000-8000-000000000093', '67400000-0000-4000-8000-000000000010', '67400000-0000-4000-8000-000000000031', '67400000-0000-4000-8000-000000000044', 'jump', 4, 'Quest B only', 'B scene', '{}', now() - interval '1 minute');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '67400000-0000-4000-8000-000000000002', true);

select is((select count(*)::integer from public.get_player_visible_quest_beats('67400000-0000-4000-8000-000000000010')), 2, 'player A sees only rumored and revealed beats on their shared quest');
select is((select player_text from public.get_player_visible_quest_beats('67400000-0000-4000-8000-000000000010') where id = '67400000-0000-4000-8000-000000000040'), 'Rumor A', 'rumored beats expose only rumor text');
select is((select player_text from public.get_player_visible_quest_beats('67400000-0000-4000-8000-000000000010') where id = '67400000-0000-4000-8000-000000000041'), 'Reveal B', 'revealed beats expose only reveal text');
select ok((select not (to_jsonb(b) ?| array['title', 'dm_content', 'read_aloud', 'how_it_plays']) from public.get_player_visible_quest_beats('67400000-0000-4000-8000-000000000010') b limit 1), 'projection contains no DM narrative fields');
select is(jsonb_array_length((select attachments from public.get_player_visible_quest_beats('67400000-0000-4000-8000-000000000010') where id = '67400000-0000-4000-8000-000000000040')), 0, 'rumors do not expose attachment summaries');
select is(jsonb_array_length((select attachments from public.get_player_visible_quest_beats('67400000-0000-4000-8000-000000000010') where id = '67400000-0000-4000-8000-000000000041')), 2, 'revealed beats include only explicitly visible attachment summaries');
select ok((select attachments::text not like '%Secret objective%' and attachments::text not like '%000000000061%' from public.get_player_visible_quest_beats('67400000-0000-4000-8000-000000000010') where id = '67400000-0000-4000-8000-000000000041'), 'attachment summaries contain no hidden label or target id');
select is(jsonb_array_length((select visits from public.get_player_visible_quest_beats('67400000-0000-4000-8000-000000000010') where id = '67400000-0000-4000-8000-000000000040')), 1, 'history includes actual visits only when their destination beat is visible');
select ok((select not ((visits->0) ?| array['from_beat_id', 'to_beat_title', 'transition_kind', 'provenance']) from public.get_player_visible_quest_beats('67400000-0000-4000-8000-000000000010') where id = '67400000-0000-4000-8000-000000000040'), 'history exposes no origin, topology, DM snapshots, or provenance');
select is((select count(*)::integer from public.quest_beats), 0, 'raw beat search cannot enumerate titles or hidden counts');
select is((select count(*)::integer from public.quest_beat_edges), 0, 'raw edge search cannot enumerate topology');
select is((select count(*)::integer from public.quest_beat_attachments), 0, 'raw attachment search cannot enumerate hidden counts');
select is((select count(*)::integer from public.quest_beat_transitions), 0, 'raw history cannot enumerate hidden visits');
select is((select count(*)::integer from public.quest_objectives), 1, 'existing objective queries keep their own visibility gate');
select is((select count(*)::integer from public.quest_refs), 1, 'existing reference queries keep their own visibility gate');

reset role;
update public.quest_beats
set visibility = 'revealed'
where id = '67400000-0000-4000-8000-000000000043';
set local role authenticated;
select is((select sum(jsonb_array_length(visits))::integer from public.get_player_visible_quest_beats('67400000-0000-4000-8000-000000000010')), 2, 'a previously hidden improvised visit appears only after deliberate reveal');
select is((select player_text from public.get_player_visible_quest_beats('67400000-0000-4000-8000-000000000010') where id = '67400000-0000-4000-8000-000000000043'), 'Improvised reveal', 'revealed improv history uses only explicit player copy');

select set_config('request.jwt.claim.sub', '67400000-0000-4000-8000-000000000003', true);
select is((select count(*)::integer from public.get_player_visible_quest_beats('67400000-0000-4000-8000-000000000010')), 1, 'player B sees only their separately shared quest');
select is((select sum(jsonb_array_length(visits))::integer from public.get_player_visible_quest_beats('67400000-0000-4000-8000-000000000010')), 1, 'player B history is independently scoped to their quest share');

select set_config('request.jwt.claim.sub', '67400000-0000-4000-8000-000000000004', true);
select is((select count(*)::integer from public.get_player_visible_quest_beats('67400000-0000-4000-8000-000000000010')), 0, 'non-member attackers receive no beats');
select is(coalesce((select sum(jsonb_array_length(visits))::integer from public.get_player_visible_quest_beats('67400000-0000-4000-8000-000000000010')), 0), 0, 'non-member attackers receive no visit history');
select is((select count(*)::integer from public.quest_refs), 0, 'non-member attackers cannot enumerate quest references');

select * from finish();
rollback;
