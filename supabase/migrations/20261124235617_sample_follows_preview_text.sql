-- Ooru's kept greeting follows its words (#1272 follow-up, 25 Nov 2026).
--
-- A voice's sample is the service's free preview; Ooru's greeting is not a voice sample but what the Familiar opens
-- with, so it is spoken from the familiar slot's preview text, once, and kept under `sample_key`. When the admin
-- rewrites the greeting, the kept recording says the old words, so the key is cleared and the next Hear Ooru speaks
-- the new ones (the object is overwritten then: its key is named by slot and voice).
--
-- Ooru's kept sample now is ElevenLabs' own preview of the voice (seen live): cleared here, so Hear Ooru says the
-- greeting.

create or replace function private.clear_greeting_on_new_words()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.binding = 'familiar' and new.preview_text is distinct from old.preview_text then
    new.sample_key := null;
  end if;
  return new;
end;
$$;

revoke execute on function private.clear_greeting_on_new_words() from public, anon, authenticated;

create trigger speech_voices_greeting_follows_words
  before update of preview_text on public.speech_voices
  for each row execute procedure private.clear_greeting_on_new_words();

update public.speech_voices set sample_key = null where binding = 'familiar';
