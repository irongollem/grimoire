-- The voice registry (#1272): which voices the AI table may speak a character in, kept as rows, not code.
--
-- Until now a character was cast from fifteen ElevenLabs ready-made voices listed in `table-voice/voicePick.ts`,
-- and `npcs.spoken_voice_id` named a voice of the character's own. Nothing in the app ever wrote that column, so
-- the voices the maintainer designed were never heard, and replacing a voice meant a coding round.
--
-- A row here is a *slot*: what kind of voice it is ("Shady guy", "Booming villain", "Old woman, frail") and the one
-- voice that currently fills it, on ElevenLabs or Inworld. An NPC points at the slot, never at a raw voice id, so
-- filling a slot with a better voice re-voices everyone cast to it at once.
--
--   kind    cast   in the pool the table casts from;
--           own    a signature voice for one character (the Gaffer, Sift), never cast to anyone else. Only the admin
--                  reads these, so only the admin can give one to an NPC (the guard below).
--   origin  where the voice came from. A designed or cloned voice uses one of the account's custom voice slots;
--           one saved from the ElevenLabs Voice Library uses none, which is what lets the registry grow without a
--           limit; a stock voice is one of the service's ready-made voices; an imported one was already on the
--           account (designed in the service's own tool).
--
-- A slot may be empty (service and voice_id null): a planned voice the maintainer has written a prompt for but not
-- yet designed. Only filled, active cast slots are visible to ordinary accounts, because only those can speak.
--
-- Platform-owned, like the `library_*` tables: every account reads, the admin writes. Not campaign data, so it does
-- not ring the campaign doorbell; the admin's page refetches after its own writes, and a DM's picker reads it fresh
-- when opened.

create table public.speech_voices (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 80),
  -- Who this voice fits, in words: what casting matches a character's record against.
  description text not null default '' check (length(description) <= 1000),
  -- What the voice designer was (or will be) asked for, and the words a preview says. The maintainer edits both.
  design_prompt text check (design_prompt is null or length(design_prompt) <= 1000),
  preview_text text check (preview_text is null or length(preview_text) <= 1000),
  sex text check (sex is null or sex in ('woman', 'man')),
  age text check (age is null or age in ('child', 'young', 'adult', 'old')),
  kind text not null default 'cast' check (kind in ('cast', 'own')),
  origin text not null default 'designed' check (origin in ('stock', 'designed', 'library', 'imported')),
  service text check (service is null or service in ('elevenlabs', 'inworld')),
  -- The service's own id. The same alphabet on both services, which keeps it safe inside a request's address.
  voice_id text check (voice_id is null or voice_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  -- A short recording of the voice in the clips' private store, for the listen buttons; made on first listen.
  sample_key text check (sample_key is null or sample_key ~ '^voice-samples/[0-9a-f-]{36}\.mp3$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint speech_voices_filled check ((service is null) = (voice_id is null)),
  constraint speech_voices_one_slot_per_voice unique (service, voice_id)
);

comment on table public.speech_voices is
  'The voices the AI table speaks characters in (#1272): one row per slot, filled by a voice on ElevenLabs or Inworld. kind cast = in the casting pool; own = one character''s signature voice. Admin-written.';

create trigger speech_voices_updated_at
  before update on public.speech_voices
  for each row execute procedure update_updated_at();

alter table public.speech_voices enable row level security;

create policy "speech_voices_select" on public.speech_voices for select using (
  (kind = 'cast' and active and voice_id is not null) or (select private.is_app_admin())
);
create policy "speech_voices_insert" on public.speech_voices for insert with check ((select private.is_app_admin()));
create policy "speech_voices_update" on public.speech_voices for update using ((select private.is_app_admin()));
create policy "speech_voices_delete" on public.speech_voices for delete using ((select private.is_app_admin()));

grant select, insert, update, delete on public.speech_voices to authenticated, service_role;

-- The fifteen ready-made voices the table cast from in code, as the pool's first rows. Names, sex and age as
-- ElevenLabs labels them (17 Nov 2026); the descriptions are theirs, shortened, and the maintainer refines them on
-- the Voices page.
insert into public.speech_voices (name, description, sex, age, kind, origin, service, voice_id) values
  ('Jessica', 'A young woman, playful, bright and warm.', 'woman', 'young', 'cast', 'stock', 'elevenlabs', 'cgSgspJ2msm6clMCkdW9'),
  ('Laura', 'A young woman, enthusiastic and quirky.', 'woman', 'young', 'cast', 'stock', 'elevenlabs', 'FGY2WhTYpPnrIDTdsKH5'),
  ('Sarah', 'A young woman, mature beyond her years, reassuring and confident.', 'woman', 'young', 'cast', 'stock', 'elevenlabs', 'EXAVITQu4vr4xnSDxMaL'),
  ('Alice', 'A woman, clear and engaging, British.', 'woman', 'adult', 'cast', 'stock', 'elevenlabs', 'Xb7hH8MSUJpSbSDYk0k2'),
  ('Lily', 'A woman, velvety, British, an actress''s poise.', 'woman', 'adult', 'cast', 'stock', 'elevenlabs', 'pFZP5JQG7iQjIQuC4Bku'),
  ('Matilda', 'A woman, knowledgeable and composed.', 'woman', 'adult', 'cast', 'stock', 'elevenlabs', 'XrExE9yKIg1WjnnlVkGX'),
  ('Bella', 'An older woman, bright and warm.', 'woman', 'old', 'cast', 'stock', 'elevenlabs', 'hpp4J3VqNfWAUOO0d1Us'),
  ('Will', 'A young man, relaxed and optimistic.', 'man', 'young', 'cast', 'stock', 'elevenlabs', 'bIHbv24MWmeRgasZH58o'),
  ('Liam', 'A young man, energetic.', 'man', 'young', 'cast', 'stock', 'elevenlabs', 'TX3LPaxmHKxFdv7VOQHJ'),
  ('Charlie', 'A young man, deep, confident and lively, Australian.', 'man', 'young', 'cast', 'stock', 'elevenlabs', 'IKne3meq5aSn9XLyUdCD'),
  ('George', 'A man, warm, a captivating storyteller, British.', 'man', 'adult', 'cast', 'stock', 'elevenlabs', 'JBFqnCBsd6RMkjVDRZzb'),
  ('Daniel', 'A man, steady, a broadcaster''s voice, British.', 'man', 'adult', 'cast', 'stock', 'elevenlabs', 'onwK4e9ZLuTAKqWW03F9'),
  ('Brian', 'A man, deep, resonant and comforting.', 'man', 'adult', 'cast', 'stock', 'elevenlabs', 'nPczCjzI2devNBz1zQrb'),
  ('Callum', 'A man, husky, a trickster.', 'man', 'adult', 'cast', 'stock', 'elevenlabs', 'N2lVS1w4EtoT3dr4eOWO'),
  ('Bill', 'An old man, wise and balanced.', 'man', 'old', 'cast', 'stock', 'elevenlabs', 'pqHfZKP75CvOlQylNhV4');

-- The character's voice is now a slot. `spoken_voice_id` is null on every production row (checked 24 Nov 2026), so
-- nothing is carried over.
alter table public.npcs drop column spoken_voice_id;

alter table public.npcs
  add column speech_voice_id uuid references public.speech_voices (id) on delete set null;

create index npcs_speech_voice_id_idx on public.npcs (speech_voice_id);

comment on column public.npcs.speech_voice_id is
  'The voice slot that reads this character aloud at the AI table (#1272); null until the DM picks one or the table casts one, which it then keeps here. DM-only.';

-- A DM can name only a slot they can read: a filled, active cast slot, or anything for the admin. Without this an
-- account could put the Gaffer's own voice on its NPC by its id. Invoker, so the read goes through the caller's RLS;
-- the service role reads everything and is never refused.
create or replace function private.guard_npc_speech_voice()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.speech_voice_id is not null
     and (tg_op = 'INSERT' or new.speech_voice_id is distinct from old.speech_voice_id)
     and not exists (select 1 from public.speech_voices v where v.id = new.speech_voice_id) then
    raise exception 'That voice cannot be given to a character.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_npc_speech_voice() from public, anon, authenticated;

create trigger npcs_guard_speech_voice
  before insert or update of speech_voice_id on public.npcs
  for each row execute procedure private.guard_npc_speech_voice();

-- `get_player_visible_npcs` returns `setof npcs` from a positional list: the dropped text column goes and the new
-- uuid column is appended, as a null (DM-only: a character's true voice would unmask a disguise). The body is the
-- live definition (read from production, 24 Nov 2026) with that one line changed.
CREATE OR REPLACE FUNCTION public.get_player_visible_npcs(p_campaign_id uuid DEFAULT NULL::uuid, p_location_ids uuid[] DEFAULT NULL::uuid[], p_preview_member_id uuid DEFAULT NULL::uuid)
 RETURNS SETOF npcs
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    s.id,
    s.user_id,
    case
      when not ('name' = any (s.player_visible_fields)) then null
      when s.concealed and s.disguise_name is not null then s.disguise_name
      else s.name
    end,
    case when 'race' = any (s.player_visible_fields) then s.race else null end,
    null::text,                                            -- alignment (DM-only)
    null::text,                                            -- age (DM-only)
    case when 'occupation' = any (s.player_visible_fields) then s.occupation else null end,
    null::text,                                            -- appearance (DM-only)
    null::text,                                            -- personality (DM-only)
    null::text,                                            -- backstory (DM-only)
    null::text,                                            -- notes (DM-only)
    s.status,
    s.relationship,
    case
      when not ('portrait' = any (s.player_visible_fields)) then null
      when s.concealed and s.disguise_portrait_url is not null then s.disguise_portrait_url
      else s.portrait_url
    end,
    null::text[],                                          -- tags (DM-only; no player toggle)
    null::jsonb,                                           -- stat_block (DM-only)
    null::uuid,                                            -- scriptorium_doc_id (DM-only)
    s.created_at,
    s.updated_at,
    s.campaign_id,
    case when 'location' = any (s.player_visible_fields) then s.location_id else null::uuid end,
    s.player_visible_fields,
    case
      when not ('portrait' = any (s.player_visible_fields)) then null
      when s.concealed and s.disguise_portrait_url is not null then s.disguise_portrait_focal_point
      else s.portrait_focal_point
    end,
    null::uuid,                                            -- linked_monster_id (DM-only)
    s.relevance,
    s.player_visible_to,
    -- The cover the party knew, only once it has fallen (unmasked_at set).
    case when s.unmasked and 'name' = any (s.player_visible_fields) then s.disguise_name else null end,
    case when s.unmasked and 'portrait' = any (s.player_visible_fields) then s.disguise_portrait_url else null end,
    case when s.unmasked and 'portrait' = any (s.player_visible_fields) then s.disguise_portrait_focal_point else null end,
    false,                                                 -- is_revealed (cover shown; never leak true state)
    s.ai_provenance,
    null::text,                                            -- demo_source (#912): a quota marker, nothing for players
    case                                                   -- cutout_url (#917): the true form, so never for a concealed NPC
      when not ('portrait' = any (s.player_visible_fields)) then null
      when s.concealed then null
      else s.cutout_url
    end,
    case when s.unmasked then s.unmasked_at else null end, -- unmasked_at: when the card turns
    null::integer,                                         -- born_year (#1086; DM-only, like age)
    null::integer,                                         -- born_month
    null::integer,                                         -- born_day
    null::integer,                                         -- died_year (DM-only, like the birth date)
    null::integer,                                         -- died_month
    null::integer,                                         -- died_day
    s.size,                                                -- size (#1125): the token on the battle map shows it anyway
    null::text,                                            -- voice (#1021; DM-only, like personality)
    null::uuid                                             -- speech_voice_id (#1272; DM-only: which voice reads them aloud)
  from (
    select n.*,
      ((n.disguise_name is not null or n.disguise_portrait_url is not null)
        and not n.is_revealed) as concealed,
      (n.is_revealed and n.unmasked_at is not null
        and (n.disguise_name is not null or n.disguise_portrait_url is not null)) as unmasked
    from npcs n
    where (p_campaign_id is null or n.campaign_id = p_campaign_id)
      and (p_location_ids is null or n.location_id = any (p_location_ids))
      and (
        -- (a) individually shared with the caller
        exists (
          select 1 from campaign_members cm
          where cm.user_id = (select auth.uid())
            and cm.campaign_id = n.campaign_id
            and cm.party_member_id = any (n.player_visible_to)
        )
        -- (b) shared via the NPC's OWN location ("Share linked NPCs" on that
        --     location, shared with the caller) — direct location only.
        or exists (
          select 1 from locations l
          join campaign_members cm
            on cm.user_id = (select auth.uid()) and cm.campaign_id = l.campaign_id
          where l.id = n.location_id
            and l.is_npcs_shared
            and cm.party_member_id = any (l.player_visible_to)
        )
        -- (c) DM preview: the campaign DM sees exactly what the previewed member
        --     would see (individually shared, or location-shared to that member);
        --     with no member chosen, anything shared with at least one member.
        or (
          private.is_campaign_dm(n.campaign_id)
          and (
            (p_preview_member_id is not null and (
              p_preview_member_id = any (n.player_visible_to)
              or exists (
                select 1 from locations l
                where l.id = n.location_id
                  and l.is_npcs_shared
                  and p_preview_member_id = any (l.player_visible_to)
              )
            ))
            or (p_preview_member_id is null and (
              array_length(n.player_visible_to, 1) is not null
              or exists (
                select 1 from locations l
                where l.id = n.location_id
                  and l.is_npcs_shared
                  and array_length(l.player_visible_to, 1) is not null
              )
            ))
          )
        )
      )
  ) s;
$function$;
