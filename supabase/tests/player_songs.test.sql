begin;

create extension if not exists pgtap with schema extensions;
select plan(6);

-- get_player_songs (20261109134103): the songs page reads only music playlists a DM marked
-- "Players can listen", in campaigns the caller belongs to, and never a Spotify track. Players
-- cannot read sounds or playlists themselves, so this definer is the only way in; each
-- assertion below fails if one of its filters goes.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('11090000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ps-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('11090000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ps-kid@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('11090000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ps-stranger@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name) values
  ('11090000-0000-4000-8000-000000000010', '11090000-0000-4000-8000-000000000001', 'Kind Country');

insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('11090000-0000-4000-8000-000000000010', '11090000-0000-4000-8000-000000000002', 'player', 'Kid')
on conflict (campaign_id, user_id) do update set role = excluded.role;

insert into public.sounds (id, user_id, campaign_id, name, category, source_type, file_url) values
  ('11090000-0000-4000-8000-000000000020', '11090000-0000-4000-8000-000000000001', '11090000-0000-4000-8000-000000000010', 'PS-Shared-Song', 'music', 'upload', 'https://example.invalid/a.mp3'),
  ('11090000-0000-4000-8000-000000000021', '11090000-0000-4000-8000-000000000001', '11090000-0000-4000-8000-000000000010', 'PS-Spotify-Song', 'music', 'spotify', 'https://open.spotify.com/track/x'),
  ('11090000-0000-4000-8000-000000000022', '11090000-0000-4000-8000-000000000001', '11090000-0000-4000-8000-000000000010', 'PS-Private-Song', 'music', 'upload', 'https://example.invalid/b.mp3'),
  ('11090000-0000-4000-8000-000000000023', '11090000-0000-4000-8000-000000000001', '11090000-0000-4000-8000-000000000010', 'PS-Ambient-Layer', 'ambient', 'upload', 'https://example.invalid/c.mp3');

insert into public.soundboard_playlists (id, user_id, campaign_id, name, playlist_type, players_can_listen) values
  ('11090000-0000-4000-8000-000000000030', '11090000-0000-4000-8000-000000000001', '11090000-0000-4000-8000-000000000010', 'Shared', 'music', true),
  ('11090000-0000-4000-8000-000000000031', '11090000-0000-4000-8000-000000000001', '11090000-0000-4000-8000-000000000010', 'Private', 'music', false),
  ('11090000-0000-4000-8000-000000000032', '11090000-0000-4000-8000-000000000001', '11090000-0000-4000-8000-000000000010', 'Scene', 'ambient', true);

insert into public.soundboard_playlist_tracks (playlist_id, sound_id, sort_order) values
  ('11090000-0000-4000-8000-000000000030', '11090000-0000-4000-8000-000000000020', 0),
  ('11090000-0000-4000-8000-000000000030', '11090000-0000-4000-8000-000000000021', 1),
  ('11090000-0000-4000-8000-000000000031', '11090000-0000-4000-8000-000000000022', 0),
  ('11090000-0000-4000-8000-000000000032', '11090000-0000-4000-8000-000000000023', 0);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- A player of the campaign: the shared playlist's playable song, and nothing else.
select set_config('request.jwt.claim.sub', '11090000-0000-4000-8000-000000000002', true);
select results_eq(
  $$ select name from public.get_player_songs() $$,
  $$ values ('PS-Shared-Song') $$,
  'a player hears the shared music playlist''s song'
);
select is_empty(
  $$ select 1 from public.get_player_songs() where name = 'PS-Private-Song' $$,
  'a playlist the DM did not share stays the DM''s'
);
select is_empty(
  $$ select 1 from public.get_player_songs() where name = 'PS-Ambient-Layer' $$,
  'an ambient scene is not a song, even when flagged'
);
select is_empty(
  $$ select 1 from public.get_player_songs() where name = 'PS-Spotify-Song' $$,
  'a Spotify track is left out: it plays only through the DM''s account'
);

-- Someone outside the campaign hears nothing of it.
select set_config('request.jwt.claim.sub', '11090000-0000-4000-8000-000000000003', true);
select is_empty(
  $$ select 1 from public.get_player_songs() $$,
  'a stranger to the campaign gets no songs'
);

-- The DM is a member of their own campaign and sees what the players see.
select set_config('request.jwt.claim.sub', '11090000-0000-4000-8000-000000000001', true);
select results_eq(
  $$ select name from public.get_player_songs() $$,
  $$ values ('PS-Shared-Song') $$,
  'the DM sees the songs page as the table does'
);

select * from finish();
rollback;
