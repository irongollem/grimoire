-- Migration: soundboard_playlists
-- Adds soundboard_playlists and soundboard_playlist_tracks tables for
-- sequential music playlists and layered ambient scene playlists.

-- ── soundboard_playlists ──────────────────────────────────────────────────

create table soundboard_playlists (
  id          uuid        primary key default gen_random_uuid(),
  campaign_id uuid        not null references campaigns(id) on delete cascade,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  page_id     uuid        references soundboard_pages(id) on delete set null,
  name        text        not null,
  playlist_type text      not null check (playlist_type in ('music', 'ambient')),
  shuffle     boolean     not null default false,
  repeat      boolean     not null default true,
  sort_order  int         not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger soundboard_playlists_updated_at
  before update on soundboard_playlists
  for each row execute procedure update_updated_at();

alter table soundboard_playlists enable row level security;

create policy "soundboard_playlists_select" on soundboard_playlists
  for select using (auth.uid() = user_id);
create policy "soundboard_playlists_insert" on soundboard_playlists
  for insert with check (auth.uid() = user_id);
create policy "soundboard_playlists_update" on soundboard_playlists
  for update using (auth.uid() = user_id);
create policy "soundboard_playlists_delete" on soundboard_playlists
  for delete using (auth.uid() = user_id);

-- ── soundboard_playlist_tracks ────────────────────────────────────────────

create table soundboard_playlist_tracks (
  id          uuid        primary key default gen_random_uuid(),
  playlist_id uuid        not null references soundboard_playlists(id) on delete cascade,
  sound_id    uuid        not null references sounds(id) on delete cascade,
  sort_order  int         not null default 0,
  created_at  timestamptz not null default now(),
  unique (playlist_id, sound_id)
);

alter table soundboard_playlist_tracks enable row level security;

-- Tracks inherit access via the playlist owner
create policy "soundboard_playlist_tracks_select" on soundboard_playlist_tracks
  for select using (
    exists (
      select 1 from soundboard_playlists p
      where p.id = playlist_id and p.user_id = auth.uid()
    )
  );
create policy "soundboard_playlist_tracks_insert" on soundboard_playlist_tracks
  for insert with check (
    exists (
      select 1 from soundboard_playlists p
      where p.id = playlist_id and p.user_id = auth.uid()
    )
  );
create policy "soundboard_playlist_tracks_delete" on soundboard_playlist_tracks
  for delete using (
    exists (
      select 1 from soundboard_playlists p
      where p.id = playlist_id and p.user_id = auth.uid()
    )
  );
