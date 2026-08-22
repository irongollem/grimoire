begin;

create extension if not exists pgtap with schema extensions;
select plan(35);

select has_table('public', 'quest_beats', 'authored beats have their own table');
select has_table('public', 'quest_beat_edges', 'authored routes have their own table');
select has_table('public', 'quest_runtime_state', 'live position has separate campaign state');
select has_table('public', 'quest_beat_transitions', 'route history is append-only data');
select has_table('public', 'quest_beat_attachments', 'beats place authoritative records without cloning them');
select hasnt_column('public', 'quest_beats', 'is_current', 'current position is not authored beat state');
select hasnt_column('public', 'quest_beats', 'is_ready', 'prep readiness is not a drifting beat flag');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('65800000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue658-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('65800000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue658-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('65800000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue658-outsider@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name) values
  ('65800000-0000-4000-8000-000000000010', '65800000-0000-4000-8000-000000000001', 'Beat graph campaign'),
  ('65800000-0000-4000-8000-000000000011', '65800000-0000-4000-8000-000000000001', 'Other campaign');

insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('65800000-0000-4000-8000-000000000010', '65800000-0000-4000-8000-000000000001', 'dm', 'DM')
on conflict (campaign_id, user_id) do update set role = excluded.role;

insert into public.party_members (id, user_id, owner_user_id, campaign_id, name)
values (
  '65800000-0000-4000-8000-000000000020',
  '65800000-0000-4000-8000-000000000001',
  '65800000-0000-4000-8000-000000000002',
  '65800000-0000-4000-8000-000000000010',
  'Player hero'
);

insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id)
values (
  '65800000-0000-4000-8000-000000000010',
  '65800000-0000-4000-8000-000000000002',
  'player',
  'Player',
  '65800000-0000-4000-8000-000000000020'
);

insert into public.quests (id, user_id, campaign_id, title, player_visible_to) values
  ('65800000-0000-4000-8000-000000000030', '65800000-0000-4000-8000-000000000001', '65800000-0000-4000-8000-000000000010', 'Main quest', array['65800000-0000-4000-8000-000000000020']::uuid[]),
  ('65800000-0000-4000-8000-000000000031', '65800000-0000-4000-8000-000000000001', '65800000-0000-4000-8000-000000000010', 'Side quest', array['65800000-0000-4000-8000-000000000020']::uuid[]),
  ('65800000-0000-4000-8000-000000000032', '65800000-0000-4000-8000-000000000001', '65800000-0000-4000-8000-000000000011', 'Other campaign quest', '{}'::uuid[]);

insert into public.quest_beats (
  id, quest_id, campaign_id, title, dm_content, rumor_text, reveal_text, visibility, kind
) values
  ('65800000-0000-4000-8000-000000000040', '65800000-0000-4000-8000-000000000030', '65800000-0000-4000-8000-000000000010', 'Secret setup', 'DM secret A', 'A rumor', 'A reveal', 'rumored', 'social'),
  ('65800000-0000-4000-8000-000000000041', '65800000-0000-4000-8000-000000000030', '65800000-0000-4000-8000-000000000010', 'Revealed scene', 'DM secret B', 'B rumor', 'B reveal', 'revealed', 'combat'),
  ('65800000-0000-4000-8000-000000000042', '65800000-0000-4000-8000-000000000030', '65800000-0000-4000-8000-000000000010', 'Hidden discovery', 'DM secret C', 'C rumor', 'C reveal', 'hidden', 'discovery'),
  ('65800000-0000-4000-8000-000000000043', '65800000-0000-4000-8000-000000000031', '65800000-0000-4000-8000-000000000010', 'Side scene', null, null, null, 'hidden', 'neutral'),
  ('65800000-0000-4000-8000-000000000044', '65800000-0000-4000-8000-000000000032', '65800000-0000-4000-8000-000000000011', 'Foreign scene', null, null, null, 'hidden', 'neutral');

insert into public.quest_beats (id, quest_id, campaign_id, title)
values ('65800000-0000-4000-8000-000000000045', '65800000-0000-4000-8000-000000000030', '65800000-0000-4000-8000-000000000010', 'Default scene');

select is((select visibility from public.quest_beats where id = '65800000-0000-4000-8000-000000000045'), 'hidden', 'new beats default hidden');
select is((select kind from public.quest_beats where id = '65800000-0000-4000-8000-000000000045'), 'neutral', 'beat kind has a neutral extensible default');

select throws_ok($$
  insert into public.quest_beats (quest_id, campaign_id, title)
  values ('65800000-0000-4000-8000-000000000030', '65800000-0000-4000-8000-000000000011', 'Wrong owner')
$$, '23503', null, 'a beat cannot claim a different campaign from its quest');

select throws_ok($$
  insert into public.quest_beat_edges (quest_id, campaign_id, source_beat_id, target_beat_id)
  values ('65800000-0000-4000-8000-000000000030', '65800000-0000-4000-8000-000000000010', '65800000-0000-4000-8000-000000000040', '65800000-0000-4000-8000-000000000040')
$$, '23514', null, 'an edge cannot self-link');

select throws_ok($$
  insert into public.quest_beat_edges (quest_id, campaign_id, source_beat_id, target_beat_id)
  values ('65800000-0000-4000-8000-000000000030', '65800000-0000-4000-8000-000000000010', '65800000-0000-4000-8000-000000000040', '65800000-0000-4000-8000-000000000043')
$$, '23503', null, 'an authored edge cannot cross quests');

insert into public.quest_beat_edges (quest_id, campaign_id, source_beat_id, target_beat_id, label) values
  ('65800000-0000-4000-8000-000000000030', '65800000-0000-4000-8000-000000000010', '65800000-0000-4000-8000-000000000040', '65800000-0000-4000-8000-000000000041', 'Continue');

select throws_ok($$
  insert into public.quest_beat_edges (quest_id, campaign_id, source_beat_id, target_beat_id, label)
  values ('65800000-0000-4000-8000-000000000030', '65800000-0000-4000-8000-000000000010', '65800000-0000-4000-8000-000000000040', '65800000-0000-4000-8000-000000000041', 'Continue')
$$, '23505', null, 'duplicate source, target, and label routes are rejected');

select lives_ok($$
  insert into public.quest_beat_edges (quest_id, campaign_id, source_beat_id, target_beat_id, label)
  values ('65800000-0000-4000-8000-000000000030', '65800000-0000-4000-8000-000000000010', '65800000-0000-4000-8000-000000000041', '65800000-0000-4000-8000-000000000040', 'Loop back')
$$, 'cycles are valid authored structure');

select lives_ok($$
  insert into public.quest_runtime_state (campaign_id, quest_id, current_beat_id)
  values ('65800000-0000-4000-8000-000000000010', '65800000-0000-4000-8000-000000000030', '65800000-0000-4000-8000-000000000040');
  insert into public.quest_beat_transitions (
    campaign_id, from_quest_id, from_beat_id, to_quest_id, to_beat_id, transition_kind
  ) values (
    '65800000-0000-4000-8000-000000000010',
    '65800000-0000-4000-8000-000000000030', '65800000-0000-4000-8000-000000000040',
    '65800000-0000-4000-8000-000000000031', '65800000-0000-4000-8000-000000000043',
    'jump'
  )
$$, 'history retains the cross-quest jumps recorded before cursors were per-quest');

insert into public.npcs (id, user_id, campaign_id, name) values
  ('65800000-0000-4000-8000-000000000050', '65800000-0000-4000-8000-000000000001', '65800000-0000-4000-8000-000000000010', 'Shared guide'),
  ('65800000-0000-4000-8000-000000000051', '65800000-0000-4000-8000-000000000001', '65800000-0000-4000-8000-000000000011', 'Wrong-campaign guide');
insert into public.quest_objectives (id, quest_id, description) values
  ('65800000-0000-4000-8000-000000000060', '65800000-0000-4000-8000-000000000030', 'Main objective'),
  ('65800000-0000-4000-8000-000000000061', '65800000-0000-4000-8000-000000000031', 'Side objective');

select lives_ok($$
  insert into public.quest_beat_attachments (beat_id, quest_id, campaign_id, attachment_type, ref_id) values
    ('65800000-0000-4000-8000-000000000040', '65800000-0000-4000-8000-000000000030', '65800000-0000-4000-8000-000000000010', 'npc', '65800000-0000-4000-8000-000000000050'),
    ('65800000-0000-4000-8000-000000000041', '65800000-0000-4000-8000-000000000030', '65800000-0000-4000-8000-000000000010', 'npc', '65800000-0000-4000-8000-000000000050')
$$, 'one authoritative entity can support multiple beats');
select is(
  (select count(*)::integer from public.quest_refs where quest_id = '65800000-0000-4000-8000-000000000030' and ref_type = 'npc' and ref_id = '65800000-0000-4000-8000-000000000050'),
  1,
  'beat placement keeps one authoritative quest-level reference for existing filters'
);

select throws_ok($$
  insert into public.quest_beat_attachments (beat_id, quest_id, campaign_id, attachment_type, ref_id)
  values ('65800000-0000-4000-8000-000000000040', '65800000-0000-4000-8000-000000000030', '65800000-0000-4000-8000-000000000010', 'objective', '65800000-0000-4000-8000-000000000061')
$$, '23514', null, 'an objective attachment cannot cross quests');

select throws_ok($$
  insert into public.quest_beat_attachments (beat_id, quest_id, campaign_id, attachment_type, ref_id)
  values ('65800000-0000-4000-8000-000000000040', '65800000-0000-4000-8000-000000000030', '65800000-0000-4000-8000-000000000010', 'npc', '65800000-0000-4000-8000-000000000051')
$$, '23514', null, 'an entity attachment cannot cross campaigns');

update public.quest_beats set kind = 'explore' where id = '65800000-0000-4000-8000-000000000040';
select is((select count(*)::integer from public.quest_beat_attachments where beat_id = '65800000-0000-4000-8000-000000000040'), 1, 'changing beat kind preserves every attachment');

delete from public.npcs where id = '65800000-0000-4000-8000-000000000050';
select is((select count(*)::integer from public.quest_beat_attachments where ref_id = '65800000-0000-4000-8000-000000000050'), 2, 'deleted polymorphic targets remain visible as prep gaps');

insert into public.factions (id, user_id, campaign_id, name)
values ('65800000-0000-4000-8000-000000000070', '65800000-0000-4000-8000-000000000001', '65800000-0000-4000-8000-000000000010', 'The Lanterns');
select lives_ok($$
  insert into public.quest_refs (quest_id, ref_type, ref_id)
  values ('65800000-0000-4000-8000-000000000030', 'faction', '65800000-0000-4000-8000-000000000070')
$$, 'factions are now authoritative quest references and board facets');

set local role authenticated;
select set_config('request.jwt.claim.sub', '65800000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is((select count(*)::integer from public.quest_beats where campaign_id = '65800000-0000-4000-8000-000000000010' and not is_overview), 5, 'the DM can read authored beats');
-- Each of the two quests in this campaign also carries an auto-created overview
-- beat, and the DM reads those through the same policy.
select is((select count(*)::integer from public.quest_beats where campaign_id = '65800000-0000-4000-8000-000000000010' and is_overview), 2, 'the DM can read the per-quest overview beats');
select throws_ok($$
  update public.quest_beat_transitions set transition_kind = 'previous'
  where campaign_id = '65800000-0000-4000-8000-000000000010'
$$, '42501', null, 'authenticated history is append-only');

select set_config('request.jwt.claim.sub', '65800000-0000-4000-8000-000000000002', true);

select is((select count(*)::integer from public.quest_beats where campaign_id = '65800000-0000-4000-8000-000000000010'), 0, 'players cannot read raw beat rows');
select is((select count(*)::integer from public.get_player_visible_quest_beats('65800000-0000-4000-8000-000000000010', null, null)), 2, 'players receive rumored and revealed beats only');
select is((select player_text from public.get_player_visible_quest_beats('65800000-0000-4000-8000-000000000010') where id = '65800000-0000-4000-8000-000000000040'), 'A rumor', 'rumored beats use explicit rumor copy');
select is((select player_text from public.get_player_visible_quest_beats('65800000-0000-4000-8000-000000000010') where id = '65800000-0000-4000-8000-000000000041'), 'B reveal', 'revealed beats use explicit reveal copy');
select ok((select not (to_jsonb(b) ? 'dm_content') from public.get_player_visible_quest_beats('65800000-0000-4000-8000-000000000010') b limit 1), 'the player projection has no DM content field');
select throws_ok($$
  insert into public.quest_beats (quest_id, campaign_id, title)
  values ('65800000-0000-4000-8000-000000000030', '65800000-0000-4000-8000-000000000010', 'Player write')
$$, '42501', null, 'players cannot author beats');

select set_config('request.jwt.claim.sub', '65800000-0000-4000-8000-000000000003', true);
select is((select count(*)::integer from public.get_player_visible_quest_beats('65800000-0000-4000-8000-000000000010')), 0, 'outsiders cannot use the player projection');

reset role;
select lives_ok($$
  delete from public.campaigns where id = '65800000-0000-4000-8000-000000000010'
$$, 'campaign deletion safely cascades graph and runtime rows');
select is((select count(*)::integer from public.quest_beats where campaign_id = '65800000-0000-4000-8000-000000000010'), 0, 'campaign cascade removes authored beats');
select is((select count(*)::integer from public.quest_beat_transitions where campaign_id = '65800000-0000-4000-8000-000000000010'), 0, 'campaign cascade removes runtime history');

select * from finish();
rollback;
