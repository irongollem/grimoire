-- Migration: soundboard_gain_trim
-- Per-sound loudness-normalisation offset, so a quiet Freesound clip and a loud
-- upload can be levelled once and remembered instead of the DM riding a slider
-- every session. Composes with (does not replace) the user's volume setting.

alter table public.sounds
  add column if not exists gain_trim real not null default 1.0;

comment on column public.sounds.gain_trim is
  'Loudness-normalisation multiplier applied ahead of user volume. 1.0 = unmodified.';

alter table public.sounds
  add constraint sounds_gain_trim_range check (gain_trim > 0 and gain_trim <= 4);
