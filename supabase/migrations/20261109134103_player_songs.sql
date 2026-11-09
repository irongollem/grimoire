-- Songs for players: a DM marks a music playlist "Players can listen", and everyone at that table can play it on
-- /songs, a full-screen page of big picture buttons made for a phone pinned to the home screen. It began with the
-- maintainer's five-year-old, a player in his campaign who cannot read yet and wanted the campaign's songs.
--
--   * A flag on the playlist, not a share table: a player reads it through their own sign-in, so there is no
--     token to keep secret, and copying a playlist (the demo copy, dev:campaigns) copies the choice with it.
--   * Players cannot read sounds or playlists (both are DM-only under RLS), and widening those policies would
--     open every sound in the campaign. So the songs come out through one definer that serves only flagged music
--     playlists, only the fields a player needs (no storage path, tags or prompt), from campaigns the caller is a
--     member of. It takes no argument, so it can name no one but the caller (`self` in the definer registry).
--   * Spotify tracks are left out: they play only through the DM's own Spotify account.

alter table public.soundboard_playlists
  add column players_can_listen boolean not null default false;

comment on column public.soundboard_playlists.players_can_listen is
  'A music playlist every member of the campaign may play on /songs (get_player_songs). Ignored on ambient playlists.';

create function public.get_player_songs()
returns table (
  campaign_id uuid,
  campaign_name text,
  playlist_id uuid,
  playlist_name text,
  sound_id uuid,
  name text,
  file_url text,
  thumbnail_url text,
  artist text,
  gain_trim real
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, p.id, p.name, s.id, s.name, s.file_url, s.thumbnail_url, s.artist, s.gain_trim::real
  from public.campaign_members cm
  join public.campaigns c on c.id = cm.campaign_id
  join public.soundboard_playlists p
    on p.campaign_id = cm.campaign_id and p.players_can_listen and p.playlist_type = 'music'
  join public.soundboard_playlist_tracks t on t.playlist_id = p.id
  join public.sounds s on s.id = t.sound_id
  where cm.user_id = (select auth.uid())
    and s.source_type <> 'spotify'
  order by c.name, c.id, p.sort_order, p.name, p.id, t.sort_order, s.name, s.id
$$;

comment on function public.get_player_songs() is
  'The caller''s songs: every track of a players_can_listen music playlist in a campaign they belong to. /songs.';

revoke execute on function public.get_player_songs() from public, anon;
grant execute on function public.get_player_songs() to authenticated, service_role;
