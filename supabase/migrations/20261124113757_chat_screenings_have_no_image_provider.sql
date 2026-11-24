-- Chat text is screened by a screen of its own (#1021 row 6a, `screenChatText` in `_shared/moderation.ts`), and its
-- rows in the screening log name no image provider: there is no renderer behind a line of chat. Until now every chat
-- surface (the AI table, Ask, a character's reply, a note read aloud, the table's voice, the campaign's own text)
-- borrowed the image screen and wrote the placeholder 'none' here. Null now says it plainly, and the placeholder rows
-- already written are set to null so the column has one meaning.

alter table public.prompt_screenings
  alter column image_provider drop not null;

update public.prompt_screenings
   set image_provider = null
 where image_provider = 'none';

comment on column public.prompt_screenings.image_provider is
  'The renderer an image prompt was bound for (openai | gemini); null for chat text, which has none.';
