-- Migration: soundboard_audio_themes
-- Bind audio to encounters and locations by theme label rather than by track.

-- A playlist declares which themes it can serve. Reuses the same free-text tag
-- vocabulary as `sounds.tags`, so a DM labels "battle" once and anything wearing
-- that label becomes a candidate.
--
-- Deliberately many-to-many by label rather than a foreign key from encounter to
-- playlist: a dedicated track per encounter is exactly the prep burden this is
-- meant to avoid, and several playlists sharing a theme is what gives repeated
-- combats variety for free.
alter table soundboard_playlists
  add column if not exists tags text[] not null default '{}';

create index if not exists soundboard_playlists_tags_idx
  on soundboard_playlists using gin (tags);

-- What each side asks for. Null = ask for nothing, which is the default and
-- means the soundboard is never touched.
alter table encounters
  add column if not exists audio_theme text;

alter table locations
  add column if not exists audio_theme text;

comment on column soundboard_playlists.tags is
  'Theme labels this playlist can answer, e.g. {battle,boss}. Matched against encounters.audio_theme / locations.audio_theme.';

comment on column encounters.audio_theme is
  'Theme label requested when this encounter goes live; resolves against music playlists tagged with it. Null = leave audio alone.';

comment on column locations.audio_theme is
  'Theme label requested when this location is opened; resolves against ambient playlists tagged with it. Null = leave audio alone.';
