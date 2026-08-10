begin;

create extension if not exists pgtap with schema extensions;
select plan(9);

select has_function('public', 'get_player_visible_quests', array['uuid', 'uuid', 'uuid'], 'quest DTO supports an explicit DM preview audience');
select has_function('public', 'get_player_visible_quest_beats', array['uuid', 'uuid', 'uuid'], 'beat DTO supports an explicit DM preview audience');
select hasnt_function('public', 'get_player_visible_quests', array['uuid', 'uuid'], 'preview replaces rather than expands the public quest RPC surface');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('67600000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue676-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('67600000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue676-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('67600000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue676-other@example.invalid', '', '{}'::jsonb, '{}'::jsonb);
insert into public.campaigns (id, user_id, name)
values ('67600000-0000-4000-8000-000000000010', '67600000-0000-4000-8000-000000000001', 'Preview parity');
insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('67600000-0000-4000-8000-000000000010', '67600000-0000-4000-8000-000000000001', 'dm', 'DM')
on conflict (campaign_id, user_id) do update set role = excluded.role;
insert into public.party_members (id, user_id, owner_user_id, campaign_id, name) values
  ('67600000-0000-4000-8000-000000000020', '67600000-0000-4000-8000-000000000001', '67600000-0000-4000-8000-000000000002', '67600000-0000-4000-8000-000000000010', 'Shared hero'),
  ('67600000-0000-4000-8000-000000000021', '67600000-0000-4000-8000-000000000001', '67600000-0000-4000-8000-000000000003', '67600000-0000-4000-8000-000000000010', 'Unshared hero');
insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('67600000-0000-4000-8000-000000000010', '67600000-0000-4000-8000-000000000002', 'player', 'Player', '67600000-0000-4000-8000-000000000020'),
  ('67600000-0000-4000-8000-000000000010', '67600000-0000-4000-8000-000000000003', 'player', 'Other', '67600000-0000-4000-8000-000000000021');
insert into public.quests (id, user_id, campaign_id, title, notes, player_visible_to)
values ('67600000-0000-4000-8000-000000000030', '67600000-0000-4000-8000-000000000001', '67600000-0000-4000-8000-000000000010', 'Safe quest', 'DM NOTES', array['67600000-0000-4000-8000-000000000020']::uuid[]);
insert into public.quest_beats (id, quest_id, campaign_id, title, dm_content, reveal_text, visibility)
values ('67600000-0000-4000-8000-000000000040', '67600000-0000-4000-8000-000000000030', '67600000-0000-4000-8000-000000000010', 'DM title', 'DM LEAD', 'Player reveal', 'revealed');

create temp table player_result (quest jsonb, beats jsonb);
grant select, insert on player_result to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '67600000-0000-4000-8000-000000000002', true);
insert into player_result
select
  (select to_jsonb(q) from public.get_player_visible_quests(null, '67600000-0000-4000-8000-000000000030', null) q),
  (select jsonb_agg(to_jsonb(b) order by b.id) from public.get_player_visible_quest_beats('67600000-0000-4000-8000-000000000010', '67600000-0000-4000-8000-000000000030', null) b);

select set_config('request.jwt.claim.sub', '67600000-0000-4000-8000-000000000001', true);
select is(
  (select to_jsonb(q) from public.get_player_visible_quests(null, '67600000-0000-4000-8000-000000000030', '67600000-0000-4000-8000-000000000020') q),
  (select quest from player_result),
  'DM quest preview is byte-for-byte the real player DTO'
);
select is(
  (select jsonb_agg(to_jsonb(b) order by b.id) from public.get_player_visible_quest_beats('67600000-0000-4000-8000-000000000010', '67600000-0000-4000-8000-000000000030', '67600000-0000-4000-8000-000000000020') b),
  (select beats from player_result),
  'DM story preview is byte-for-byte the real player beat DTO'
);
select is((select count(*)::integer from public.get_player_visible_quest_beats('67600000-0000-4000-8000-000000000010', null, '67600000-0000-4000-8000-000000000021')), 0, 'an unshared audience sees no beats');
select ok((select not (to_jsonb(q) ? 'notes') or to_jsonb(q)->'notes' = 'null'::jsonb from public.get_player_visible_quests(null, '67600000-0000-4000-8000-000000000030', '67600000-0000-4000-8000-000000000020') q), 'preview quest DTO keeps DM notes null');
select ok((select to_jsonb(b)::text not like '%DM LEAD%' and to_jsonb(b)::text not like '%DM title%' from public.get_player_visible_quest_beats('67600000-0000-4000-8000-000000000010', null, '67600000-0000-4000-8000-000000000020') b), 'preview beat DTO contains no DM title or lead');

select set_config('request.jwt.claim.sub', '67600000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$ select * from public.get_player_visible_quest_beats('67600000-0000-4000-8000-000000000010', null, '67600000-0000-4000-8000-000000000020') $$,
  'P0001', 'Only a campaign DM can choose a preview audience',
  'players cannot forge the DM preview parameter'
);

select * from finish();
rollback;
