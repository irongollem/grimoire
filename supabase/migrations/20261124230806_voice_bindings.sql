-- The app's own voices as slots of the registry (#1272 follow-up, the maintainer's request, 24 Nov 2026).
--
-- The Narrators and Ooru spoke in voices named in code (`NARRATOR_VOICES`, `FAMILIAR_VOICE` in
-- `_shared/narratorVoice.ts`), so swapping one meant a coding round, and they showed among the account's voices to
-- import, where one taken into the cast pool could be handed to any NPC. Now each is a signature slot with a
-- `binding`, the fixed name the code asks for, and swapping a voice is refilling its slot on the Voices page.
--
--   narrator-man-elevenlabs     the man narrates the table here, and reads a note with feeling
--   narrator-man-inworld        the man's plain note reading, and his stand-in without an ElevenLabs key
--   narrator-woman-inworld      the woman narrates the table here, and reads a note plainly
--   narrator-woman-elevenlabs   the woman's note read with feeling, and her stand-in without an Inworld key
--   familiar                    Ooru, on ElevenLabs only; its preview text is the greeting the Familiar opens with
--
-- A bound slot is always a signature voice (never cast to an NPC), stays on its binding's service (the code asks
-- each binding of one service), and cannot be removed: it can only be refilled. The voices are the ones the code
-- named until now (checked against `_shared/narratorVoice.ts`, 24 Nov 2026).

alter table public.speech_voices
  add column binding text unique
    check (binding is null or binding in ('narrator-man-elevenlabs', 'narrator-man-inworld', 'narrator-woman-inworld', 'narrator-woman-elevenlabs', 'familiar'));

alter table public.speech_voices
  add constraint speech_voices_bound_is_own check (binding is null or kind = 'own'),
  add constraint speech_voices_bound_service check (
    binding is null
    or service is null
    or (binding in ('narrator-man-elevenlabs', 'narrator-woman-elevenlabs', 'familiar') and service = 'elevenlabs')
    or (binding in ('narrator-man-inworld', 'narrator-woman-inworld') and service = 'inworld')
  );

-- A bound slot may hold a voice a character slot also holds: the woman Narrator's ElevenLabs voice is Alice, one of the
-- ready-made voices in the cast pool, and she stays castable. "One slot per voice" holds among character slots only.
alter table public.speech_voices drop constraint speech_voices_one_slot_per_voice;
create unique index speech_voices_one_slot_per_voice on public.speech_voices (service, voice_id) where binding is null;

comment on column public.speech_voices.binding is
  'The app''s own use of this voice (a Narrator, Ooru), the name the code asks for it by; null for a character''s voice. A bound slot is a signature voice on its binding''s service and is never removed, only refilled (#1272).';

-- A bound slot is never removed: the code asks for it by name, and the Narrator going silent is not a thing a click
-- on the Voices page should do. Refilling its voice is how it changes.
create or replace function private.guard_bound_speech_voice()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.binding is not null then
    raise exception 'That voice is the app''s own (%): refill it instead of removing it.', old.binding using errcode = '42501';
  end if;
  return old;
end;
$$;

revoke execute on function private.guard_bound_speech_voice() from public, anon, authenticated;

create trigger speech_voices_guard_bound
  before delete on public.speech_voices
  for each row execute procedure private.guard_bound_speech_voice();

-- Ooru's greeting is the familiar slot's preview text: what the empty Familiar panel shows, and what its first
-- listen speaks (kept, so every later listen is free).
insert into public.speech_voices (name, description, sex, age, kind, origin, service, voice_id, binding, preview_text) values
  ('Narrator (man)', 'The Narrator''s man''s voice: an old storyteller by the fire, warm and unhurried.', 'man', 'old', 'own', 'imported', 'elevenlabs', 'uT0AExtVkYtYQMNBHqmV', 'narrator-man-elevenlabs', null),
  ('Narrator (man), Inworld', 'The Narrator''s man''s voice on Inworld: plain note readings, and the stand-in without ElevenLabs.', 'man', 'old', 'own', 'imported', 'inworld', 'snappy-magpie-0676__design-voice-970db65e', 'narrator-man-inworld', null),
  ('Narrator (woman)', 'The Narrator''s woman''s voice, on Inworld.', 'woman', 'adult', 'own', 'imported', 'inworld', 'snappy-magpie-0676__design-voice-1e599405', 'narrator-woman-inworld', null),
  ('Narrator (woman), ElevenLabs', 'The Narrator''s woman''s voice on ElevenLabs: a note read with feeling, and the stand-in without Inworld.', 'woman', 'adult', 'own', 'stock', 'elevenlabs', 'Xb7hH8MSUJpSbSDYk0k2', 'narrator-woman-elevenlabs', null),
  ('Ooru', 'Ooru, the owl in the Familiar box.', null, null, 'own', 'imported', 'elevenlabs', 'kGl89T0PY344jeMOzVyf', 'familiar',
   'Ooh, there you are! I''m Ooru, your faithful familiar. Tell me what you seek, and I''ll ruffle a few feathers to find it. And if it doesn''t exist yet? Well, we''ll conjure it together!');
