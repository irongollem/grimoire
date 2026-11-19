-- A character's voice may live on a second speech service (#1021, 17 Nov 2026).
--
-- `npcs.spoken_voice_id` held an ElevenLabs voice id and nothing else. ElevenLabs will not design a child's voice
-- (its designer refused one for Crumb, who is seven), while Inworld had designed him one the same morning. So a
-- voice is now named with the service it lives on in front of it: a bare id is ElevenLabs', as before, and
-- `inworld:<id>` is Inworld's. One column, because a voice is one reference, and no new column to add to the
-- functions that return whole `npcs` rows.
--
-- Only the shape check changes. The id itself keeps the old alphabet on both services (an Inworld id looks like
-- `snappy-magpie-0676__design-voice-7cb37010`), which is what keeps it safe to put into a request's address.

alter table public.npcs
  drop constraint npcs_spoken_voice_id_shape;

alter table public.npcs
  add constraint npcs_spoken_voice_id_shape
  check (spoken_voice_id is null or spoken_voice_id ~ '^(inworld:)?[A-Za-z0-9_-]{8,64}$');

comment on column public.npcs.spoken_voice_id is
  'The voice that reads this character aloud at the AI table: an ElevenLabs voice id, or inworld:<id> for a voice on Inworld; null to cast one from the ready-made voices. DM-only.';
