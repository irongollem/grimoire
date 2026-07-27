-- Migration: soundboard_scene_layers
-- Promote ambient playlists into real scenes: every track becomes a layer with
-- its own remembered level, and can optionally act as a random generator rather
-- than a continuous loop.
--
-- Two problems this addresses:
--
--   1. An ambient "scene" had no mix. Every layer played at whatever volume the
--      sound happened to carry globally, so a DM could not sit rain under a
--      tavern without permanently changing how rain sounds everywhere else.
--
--   2. Ambience made of pure loops is recognisable. A tavern that is three
--      loops is the same three loops every time, and players start hearing the
--      seam. A generator fires a one-shot at a random interval, at a random
--      level, from a random direction — which is what stops a room sounding
--      like a recording of a room.

alter table public.soundboard_playlist_tracks
  -- Level within this scene, independent of the sound's own volume elsewhere.
  add column if not exists layer_volume real not null default 1.0,
  -- When true this layer fires one-shots on an interval instead of looping.
  add column if not exists is_generator boolean not null default false,
  -- Seconds between firings; a value is drawn uniformly from [min, max] each
  -- time. Equal values give a fixed interval.
  add column if not exists min_interval_s real not null default 20,
  add column if not exists max_interval_s real not null default 60,
  -- Level multiplier per firing, drawn from [min, max]. Variation here is most
  -- of why a generator reads as "a room" rather than "a sound effect".
  add column if not exists min_gain real not null default 0.6,
  add column if not exists max_gain real not null default 1.0,
  -- Stereo spread, 0 = always centred, 1 = anywhere across the field.
  add column if not exists pan_spread real not null default 0.5;

comment on column public.soundboard_playlist_tracks.layer_volume is
  'Level of this layer within its scene, independent of the sound''s volume elsewhere.';
comment on column public.soundboard_playlist_tracks.is_generator is
  'True = fire one-shots at random intervals; false = loop continuously.';

alter table public.soundboard_playlist_tracks
  add constraint soundboard_playlist_tracks_layer_volume_range
    check (layer_volume >= 0 and layer_volume <= 1),
  add constraint soundboard_playlist_tracks_interval_range
    check (min_interval_s > 0 and max_interval_s >= min_interval_s and max_interval_s <= 3600),
  add constraint soundboard_playlist_tracks_gain_range
    check (min_gain > 0 and max_gain >= min_gain and max_gain <= 1),
  add constraint soundboard_playlist_tracks_pan_range
    check (pan_spread >= 0 and pan_spread <= 1);
