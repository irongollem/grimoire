begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

select ok(
  position('audio_scene' in pg_get_constraintdef(oid)) > 0
    and position('playlist' in pg_get_constraintdef(oid)) > 0,
  'beat attachment types distinguish audio scenes and playlists'
) from pg_constraint where conname = 'quest_beat_attachments_attachment_type_check';

select ok(
  position('when ''audio_scene''' in lower(pg_get_functiondef('private.validate_quest_beat_attachment()'::regprocedure))) > 0,
  'audio scene placements validate their authoritative Soundboard record'
);

select ok(
  position('when ''playlist''' in lower(pg_get_functiondef('private.validate_quest_beat_attachment()'::regprocedure))) > 0,
  'music playlist placements validate their authoritative Soundboard record'
);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('69600000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue696-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);
insert into public.campaigns (id, user_id, name)
values ('69600000-0000-4000-8000-000000000010', '69600000-0000-4000-8000-000000000001', 'Audio quest');
insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('69600000-0000-4000-8000-000000000010', '69600000-0000-4000-8000-000000000001', 'dm', 'DM')
on conflict (campaign_id, user_id) do update set role = excluded.role;
insert into public.quests (id, user_id, campaign_id, title)
values ('69600000-0000-4000-8000-000000000020', '69600000-0000-4000-8000-000000000001', '69600000-0000-4000-8000-000000000010', 'Soundtrack quest');
insert into public.quest_beats (id, quest_id, campaign_id, title)
values ('69600000-0000-4000-8000-000000000030', '69600000-0000-4000-8000-000000000020', '69600000-0000-4000-8000-000000000010', 'Audio beat');
insert into public.soundboard_playlists (id, campaign_id, user_id, name, playlist_type) values
  ('69600000-0000-4000-8000-000000000040', '69600000-0000-4000-8000-000000000010', '69600000-0000-4000-8000-000000000001', 'Rainy docks', 'ambient'),
  ('69600000-0000-4000-8000-000000000041', '69600000-0000-4000-8000-000000000010', '69600000-0000-4000-8000-000000000001', 'Chase music', 'music');

set local role authenticated;
select set_config('request.jwt.claim.sub', '69600000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok($$
  insert into public.quest_beat_attachments (beat_id, quest_id, campaign_id, attachment_type, ref_id)
  values ('69600000-0000-4000-8000-000000000030', '69600000-0000-4000-8000-000000000020', '69600000-0000-4000-8000-000000000010', 'audio_scene', '69600000-0000-4000-8000-000000000040')
$$, 'an ambient Soundboard scene can be placed as an audio scene');

select lives_ok($$
  insert into public.quest_beat_attachments (beat_id, quest_id, campaign_id, attachment_type, ref_id)
  values ('69600000-0000-4000-8000-000000000030', '69600000-0000-4000-8000-000000000020', '69600000-0000-4000-8000-000000000010', 'playlist', '69600000-0000-4000-8000-000000000041')
$$, 'a music Soundboard playlist can be placed as a playlist');

select throws_ok($$
  insert into public.quest_beat_attachments (beat_id, quest_id, campaign_id, attachment_type, ref_id)
  values ('69600000-0000-4000-8000-000000000030', '69600000-0000-4000-8000-000000000020', '69600000-0000-4000-8000-000000000010', 'audio_scene', '69600000-0000-4000-8000-000000000041')
$$, '23514', null, 'music cannot be mislabeled as an audio scene');

select throws_ok($$
  insert into public.quest_beat_attachments (beat_id, quest_id, campaign_id, attachment_type, ref_id)
  values ('69600000-0000-4000-8000-000000000030', '69600000-0000-4000-8000-000000000020', '69600000-0000-4000-8000-000000000010', 'playlist', '69600000-0000-4000-8000-000000000040')
$$, '23514', null, 'an ambient scene cannot be mislabeled as a music playlist');

select * from finish();
rollback;
