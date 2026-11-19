-- A note read aloud (#1021 row 19).
--
-- The maintainer, 18 and 19 Nov 2026: "given we have a narrator now I like a feature allowing the session notes to
-- be read aloud (of course at the same cost)", and "when a note is playable (the dm generated the spoken words for
-- it) then those need to be listenable by the players".
--
-- The Dungeon Master has a note spoken once, in the Narrator's voice, and pays for it; the recording is kept and
-- anyone who may read the note may hear it. The audio itself is in the voices' private store, under a key the
-- `note-reading` function derives from the campaign, the note and the hash below; the row never holds a key, so a
-- forged value can only fail to find anything.
--
--   reading_hash   which text was spoken (a hash of the player-visible text), and part of the audio's key
--   reading_voice  the Narrator's voice it was spoken in
--   reading_chars  how much was spoken, which is what it cost by
--   reading_at     when; a note changed after this has a reading of an earlier version (updated_at > reading_at)
alter table public.notes
  add column reading_hash text,
  add column reading_voice text check (reading_voice in ('male', 'female')),
  add column reading_chars integer check (reading_chars > 0),
  add column reading_at timestamptz,
  add constraint notes_reading_whole check ((reading_hash is null) = (reading_at is null) and (reading_hash is null) = (reading_voice is null) and (reading_hash is null) = (reading_chars is null));

-- Only the server says a note has a reading. A note's owner and the campaign's DM may update the row (their policy
-- covers every column), so the four columns are held by a trigger instead: whatever a client sends, they keep what
-- they were, and a note a client creates starts with none. The `note-reading` function writes them as the service
-- role, after the audio is stored.
create or replace function public.guard_note_reading()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.role()) = 'service_role' or current_user in ('postgres', 'supabase_admin') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.reading_hash := null;
    new.reading_voice := null;
    new.reading_chars := null;
    new.reading_at := null;
  else
    new.reading_hash := old.reading_hash;
    new.reading_voice := old.reading_voice;
    new.reading_chars := old.reading_chars;
    new.reading_at := old.reading_at;
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_note_reading() from public, anon, authenticated;

create trigger notes_guard_reading
  before insert or update on public.notes
  for each row execute procedure public.guard_note_reading();

-- What of a note may be spoken: exactly what a player may read. The Dungeon Master's secret passages are withheld
-- by the same function that withholds them from a player's screen, so a reading can never say one aloud. For the
-- `note-reading` function alone (the service role); null when the note is gone or its text cannot be checked.
create or replace function public.note_text_for_reading(p_note_id uuid)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select private.withhold_secret_blocks(n.content) from public.notes n where n.id = p_note_id;
$$;

-- The withholding itself lives in `private` and was never needed by the service role before. Both are pure
-- functions of their argument, so the grant gives it nothing it could not already read.
grant execute on function private.withhold_secret_blocks(text) to service_role;
grant execute on function private.strip_secret_nodes(jsonb) to service_role;

revoke execute on function public.note_text_for_reading(uuid) from public, anon, authenticated;
grant execute on function public.note_text_for_reading(uuid) to service_role;

-- Says on a note that it has a reading, at the database's own time. `notes_updated_at` moves `updated_at` only
-- when what the note says changes (its title, text, category and the like), not for this, so a note is "changed
-- since it was read" exactly when `updated_at > reading_at`: both times are the database's, with no clock of the
-- function's in between. The service role's alone.
create or replace function public.set_note_reading(p_note_id uuid, p_hash text, p_voice text, p_chars integer)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.notes
     set reading_hash = p_hash, reading_voice = p_voice, reading_chars = p_chars, reading_at = now()
   where id = p_note_id;
$$;

revoke execute on function public.set_note_reading(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.set_note_reading(uuid, text, text, integer) to service_role;

-- The players' reading of notes names its columns one by one (so a new column is never handed out by accident):
-- it is recreated with the four above, in the table's own order.
CREATE OR REPLACE FUNCTION public.get_player_visible_notes(p_campaign_id uuid, p_preview_member_id uuid DEFAULT NULL::uuid)
 RETURNS SETOF notes
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
  select
    n.id,
    n.user_id,
    n.title,
    private.withhold_secret_blocks(n.content),
    n.category,
    n.tags,
    n.is_pinned,
    n.created_at,
    n.updated_at,
    n.campaign_id,
    n.is_player_visible,
    n.player_visible_to,
    n.session_start_year,
    n.session_start_month,
    n.session_start_day,
    n.session_end_year,
    n.session_end_month,
    n.session_end_day,
    n.session_real_date,
    n.linked_calendar_event_id,
    n.sort_order,
    n.ai_provenance,
    null::text,                          -- demo_source (#912): a quota marker, nothing for players
    n.session_id,
    -- The reading (below): a player hears a note they may read, so they are told it has one.
    n.reading_hash,
    n.reading_voice,
    n.reading_chars,
    n.reading_at
  from notes n
  where n.campaign_id = p_campaign_id
    and (
      exists (
        select 1 from campaign_members cm
         where cm.campaign_id = n.campaign_id
           and cm.user_id = (select auth.uid())
           and cm.party_member_id = any (n.player_visible_to)
      )
      or (
        private.is_campaign_dm(n.campaign_id)
        and case
          when p_preview_member_id is not null then p_preview_member_id = any (n.player_visible_to)
          else array_length(n.player_visible_to, 1) is not null
        end
      )
    )
$function$;
