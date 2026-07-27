-- Migration: soundboard_broadcast
-- Let a DM share the music slot with remote players, one row per campaign.

-- The current track is denormalised onto this row on purpose.
--
-- The obvious alternative — open `sounds` up so players can read the rows a
-- broadcast points at — would hand every campaign member read access to the
-- DM's whole library in order to share one track. This row instead carries a
-- snapshot of exactly what is audible right now, which is precisely what a
-- player is entitled to and nothing more. The `sounds` bucket is already
-- public, so the URL resolves without any storage-policy change either.
create table if not exists soundboard_broadcast (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  -- The DM who owns the broadcast. Kept for auditing; authorisation goes
  -- through private.is_campaign_dm(campaign_id), not through this column.
  user_id uuid not null references auth.users(id) on delete cascade,

  -- Off by default and per session: the DM turns this on for a remote game and
  -- it goes quiet again on its own. Most tables using this are in one room,
  -- where several devices playing the same track comb-filter into a mess.
  is_live boolean not null default false,

  -- Snapshot of the audible track. Null while nothing is playing.
  sound_id uuid references sounds(id) on delete set null,
  track_name text,
  track_url text,
  artist text,
  thumbnail_url text,
  playlist_name text,

  -- Wall-clock instant that corresponds to position zero of the current track.
  -- A client joining late computes its offset from this rather than being sent
  -- a position that is stale by the time it arrives.
  started_at timestamptz,
  is_paused boolean not null default false,
  -- Where the track was frozen, so a paused broadcast does not keep advancing.
  paused_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One broadcast per campaign; the DM upserts onto it.
  unique (campaign_id)
);

create index if not exists soundboard_broadcast_campaign_idx
  on soundboard_broadcast (campaign_id);

create trigger soundboard_broadcast_updated_at
  before update on soundboard_broadcast
  for each row execute procedure update_updated_at();

alter table soundboard_broadcast enable row level security;

-- The DM owns it outright.
create policy "soundboard_broadcast_dm_all" on soundboard_broadcast
  using (private.is_campaign_dm(campaign_id))
  with check (private.is_campaign_dm(campaign_id));

-- Players read it and nothing else. No insert, update or delete: a player must
-- never be able to start, stop or retarget the table's audio.
create policy "soundboard_broadcast_member_select" on soundboard_broadcast
  for select using (private.is_campaign_member(campaign_id));

comment on table soundboard_broadcast is
  'One row per campaign describing the music the DM is sharing with remote players. Carries a denormalised snapshot of the current track so players never need read access to the sounds table.';
