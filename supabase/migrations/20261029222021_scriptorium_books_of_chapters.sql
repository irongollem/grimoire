-- Migration: scriptorium_books_of_chapters
-- A Scriptorium document is a book of chapters (#1115 story 13; decisions in the epic body and on
-- the canvas "Scriptorium Chapters", approved 29 Oct 2026).
--
-- Why: Sothery is 533 pages in one row, and the editor and the Paged.js preview each worked on the
-- whole of it at every pause. A chapter is the unit the editor holds, the preview re-lays out and
-- the client autosaves, so a save is one chapter rather than 1.86 MB.
--
-- The shape, and the choices it makes:
--   * scriptorium_documents is the book: title, kind, look, page settings, sharing, furniture. Its
--     `content` column goes in the follow-up migration, once every document has moved into a
--     chapter (CLAUDE.md rule 3: the good system first, then the old data into it).
--   * scriptorium_chapters holds the text, as jsonb: the server reads it (handout reveals, the
--     player projection), so it is validated JSON rather than a string to cast and hope.
--     A chapter has no owner column of its own; who may read or write it is who may read or
--     write its book, through private.can_read_book / private.can_edit_book. So moving a
--     campaign's ownership, which re-owns the book, needs nothing here.
--   * A chapter's title is written by the client from its first top-level heading, so the
--     chapter list never loads a chapter's text.
--   * Every chapter write touches its book (word count, updated_at), which is how a chapter
--     rings live sync: the book's own trigger rings when the book is shared, and a private draft
--     rings nothing, exactly as before.
--   * Players no longer read a handout's text from the table. They read it through
--     get_player_handout, which strips DM-only blocks and the Deep half of a lens pair with
--     private.strip_secret_nodes, the same rule every other projection applies. That retires the
--     refusal to share a document holding a lens pair (20261027080700): the projection withholds
--     the Deep half instead, so a book can be a handout too.
--   * scriptorium_notes are the Inspect notes: the author's own, pinned to a block in a chapter,
--     never shared and never printed.

-- ── The book ─────────────────────────────────────────────────────────────────

alter table public.scriptorium_documents
  add column kind text not null default 'book' check (kind in ('book', 'handout'));

-- The four handout papers join the two book looks.
alter table public.scriptorium_documents drop constraint scriptorium_documents_theme_check;
alter table public.scriptorium_documents add constraint scriptorium_documents_theme_check
  check (theme = any (array['onednd2024', 'phb2014', 'letter', 'notice', 'journal', 'plain']));

-- ── Who may read and write a book ────────────────────────────────────────────

-- The document's own select policy, minus its player clause: players read through
-- get_player_handout. Total: an absent book is false, never NULL.
create or replace function private.can_read_book(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select d.user_id = (select auth.uid())
        or (d.campaign_id is not null and coalesce(private.is_campaign_dm(d.campaign_id), false))
        or (d.campaign_id is null and d.user_id = any ((select private.dm_library_authors())::uuid[]))
      from public.scriptorium_documents d
     where d.id = p_document_id), false);
$$;

-- The document's update policy: its author, or a DM of its campaign.
create or replace function private.can_edit_book(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select d.user_id = (select auth.uid())
        or (d.campaign_id is not null and coalesce(private.is_campaign_dm(d.campaign_id), false))
      from public.scriptorium_documents d
     where d.id = p_document_id), false);
$$;

-- ── Chapters ─────────────────────────────────────────────────────────────────

create table public.scriptorium_chapters (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.scriptorium_documents (id) on delete cascade,
  position integer not null,
  title text not null default '',
  content jsonb not null default '{"type": "doc", "content": [{"type": "paragraph"}]}'::jsonb
    check (jsonb_typeof(content) = 'object' and content ->> 'type' = 'doc'
           and jsonb_typeof(content -> 'content') = 'array'),
  word_count integer not null default 0 check (word_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The target of the notes' composite key: a note's chapter belongs to the note's book.
  unique (id, document_id)
);

create index scriptorium_chapters_document_idx on public.scriptorium_chapters (document_id, position);

create trigger scriptorium_chapters_updated_at
  before update on public.scriptorium_chapters
  for each row execute procedure update_updated_at();

alter table public.scriptorium_chapters enable row level security;

create policy "scriptorium_chapters_select" on public.scriptorium_chapters
  for select using (private.can_read_book(document_id));
create policy "scriptorium_chapters_insert" on public.scriptorium_chapters
  for insert with check (private.can_edit_book(document_id));
create policy "scriptorium_chapters_update" on public.scriptorium_chapters
  for update using (private.can_edit_book(document_id)) with check (private.can_edit_book(document_id));
create policy "scriptorium_chapters_delete" on public.scriptorium_chapters
  for delete using (private.can_edit_book(document_id));

grant select, insert, update, delete on public.scriptorium_chapters to authenticated, service_role;

-- Every chapter write keeps its book's word count and updated_at, and through the book's update
-- the doorbell (signal_handout_change rings when the book is shared). Runs as the writer, who may
-- edit the book by the chapter policy above.
create or replace function private.touch_book_from_chapters()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    update public.scriptorium_documents d
       set word_count = (select coalesce(sum(c.word_count), 0)::integer
                           from public.scriptorium_chapters c where c.document_id = d.id)
     where d.id in (select distinct o.document_id from old_rows o);
  elsif tg_op = 'UPDATE' then
    update public.scriptorium_documents d
       set word_count = (select coalesce(sum(c.word_count), 0)::integer
                           from public.scriptorium_chapters c where c.document_id = d.id)
     where d.id in (select n.document_id from new_rows n union select o.document_id from old_rows o);
  else
    update public.scriptorium_documents d
       set word_count = (select coalesce(sum(c.word_count), 0)::integer
                           from public.scriptorium_chapters c where c.document_id = d.id)
     where d.id in (select distinct n.document_id from new_rows n);
  end if;
  return null;
end;
$$;

revoke execute on function private.touch_book_from_chapters() from public, anon, authenticated;

create trigger scriptorium_chapters_touch_book_insert
  after insert on public.scriptorium_chapters
  referencing new table as new_rows
  for each statement execute procedure private.touch_book_from_chapters();
create trigger scriptorium_chapters_touch_book_update
  after update on public.scriptorium_chapters
  referencing old table as old_rows new table as new_rows
  for each statement execute procedure private.touch_book_from_chapters();
create trigger scriptorium_chapters_touch_book_delete
  after delete on public.scriptorium_chapters
  referencing old table as old_rows
  for each statement execute procedure private.touch_book_from_chapters();

-- The whole book as one Tiptap document, chapters in order: what a handout's reveals read.
create or replace function private.book_body(p_document_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('type', 'doc', 'content', coalesce(jsonb_agg(b.node order by c.position, c.created_at, b.ord), '[]'::jsonb))
    from public.scriptorium_chapters c
    cross join lateral jsonb_array_elements(c.content -> 'content') with ordinality as b(node, ord)
   where c.document_id = p_document_id;
$$;

-- ── Notes (Inspect) ──────────────────────────────────────────────────────────

create table public.scriptorium_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  document_id uuid not null references public.scriptorium_documents (id) on delete cascade,
  chapter_id uuid not null,
  -- The top-level block the note is pinned to (BlockId). Null when that block was deleted:
  -- the note stays, at the head of its chapter.
  block_id text,
  body text not null check (btrim(body) <> ''),
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (chapter_id, document_id)
    references public.scriptorium_chapters (id, document_id) on delete cascade
);

create index scriptorium_notes_document_idx on public.scriptorium_notes (document_id);
create index scriptorium_notes_user_idx on public.scriptorium_notes (user_id);
create index scriptorium_notes_chapter_idx on public.scriptorium_notes (chapter_id, document_id);

create trigger scriptorium_notes_updated_at
  before update on public.scriptorium_notes
  for each row execute procedure update_updated_at();

alter table public.scriptorium_notes enable row level security;

-- The author's own; a note can be made only on a book the author may edit.
create policy "scriptorium_notes_select" on public.scriptorium_notes
  for select using ((select auth.uid()) = user_id);
create policy "scriptorium_notes_insert" on public.scriptorium_notes
  for insert with check ((select auth.uid()) = user_id and private.can_edit_book(document_id));
-- A note stays inside a book its author may still edit: an update cannot carry it to another
-- book, and a DM who left the table cannot keep writing notes on its books.
create policy "scriptorium_notes_update" on public.scriptorium_notes
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and private.can_edit_book(document_id));
create policy "scriptorium_notes_delete" on public.scriptorium_notes
  for delete using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.scriptorium_notes to authenticated, service_role;

-- ── The player's read ────────────────────────────────────────────────────────

-- A handout as a holder may read it: the book's reader columns, its chapter list, and one
-- chapter's text (the first when none is named) with DM-only blocks and Deep halves stripped.
-- A DM of the campaign gets the same stripped view, which is what a "see it as players do"
-- preview needs.
create or replace function public.get_player_handout(p_document_id uuid, p_chapter_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_doc public.scriptorium_documents;
  v_chapter public.scriptorium_chapters;
begin
  select * into v_doc from public.scriptorium_documents d where d.id = p_document_id;
  if not found or v_doc.campaign_id is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if not (
    exists (select 1 from public.campaign_members cm
             where cm.user_id = (select auth.uid())
               and cm.campaign_id = v_doc.campaign_id
               and cm.party_member_id = any (v_doc.player_visible_to))
    or coalesce(private.is_campaign_dm(v_doc.campaign_id), false)
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select * into v_chapter
    from public.scriptorium_chapters c
   where c.document_id = v_doc.id and (p_chapter_id is null or c.id = p_chapter_id)
   order by c.position, c.created_at
   limit 1;

  return jsonb_build_object(
    'id', v_doc.id,
    'title', v_doc.title,
    'kind', v_doc.kind,
    'doc_type', v_doc.doc_type,
    'campaign_id', v_doc.campaign_id,
    'theme', v_doc.theme,
    'updated_at', v_doc.updated_at,
    'chapters', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'position', c.position, 'title', c.title)
                                           order by c.position, c.created_at), '[]'::jsonb)
                   from public.scriptorium_chapters c where c.document_id = v_doc.id),
    'chapter', case when v_chapter.id is null then null else jsonb_build_object(
                 'id', v_chapter.id,
                 'title', v_chapter.title,
                 'content', private.strip_secret_nodes(v_chapter.content)) end);
end;
$$;

revoke execute on function public.get_player_handout(uuid, uuid) from public, anon;
grant execute on function public.get_player_handout(uuid, uuid) to authenticated, service_role;

-- ── A handout no longer refuses a lens pair ─────────────────────────────────

drop trigger scriptorium_documents_handout_no_lens_pair on public.scriptorium_documents;
drop function private.scriptorium_documents_handout_no_lens_pair();

-- ── The demo catalogue ───────────────────────────────────────────────────────

insert into private.demo_campaign_tables (table_name, tier, parent_column, parent_table, copy, reason) values
  ('scriptorium_chapters', 2, 'document_id', 'scriptorium_documents', true, null),
  ('scriptorium_notes', 2, 'document_id', 'scriptorium_documents', false,
   'the author''s own review notes on a book; a new user''s copy starts without them');

-- ── The three ways a handout is given read its chapters ─────────────────────
-- Unchanged but for where the text comes from: private.book_body instead of the
-- document's own content column, which the follow-up migration drops.


CREATE OR REPLACE FUNCTION public.share_handout(p_document_id uuid, p_party_member_ids uuid[], p_dry_run boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_doc record;
  v_members uuid[];
  v_reveals jsonb;
begin
  select d.id, d.user_id, d.campaign_id, d.player_visible_to
    into v_doc
    from public.scriptorium_documents d
   where d.id = p_document_id;

  -- Any DM of the document's campaign, its author or not (#590): a co-DM
  -- running the session hands over the owner's handouts.
  if not found then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if v_doc.campaign_id is null then
    raise exception 'Only a campaign''s document can be shared with its players' using errcode = '22023';
  end if;
  if not coalesce(private.is_campaign_dm(v_doc.campaign_id), false) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct pm.id), '{}') into v_members
    from public.party_members pm
   where pm.campaign_id = v_doc.campaign_id
     and pm.id = any (coalesce(p_party_member_ids, '{}'));

  if cardinality(v_members) <> (select count(distinct x) from unnest(coalesce(p_party_member_ids, '{}')) x) then
    raise exception 'Every recipient must be a party member of this campaign' using errcode = '22023';
  end if;

  v_reveals := private.apply_handout_reveals(v_doc.campaign_id, private.book_body(v_doc.id)::text, v_members, p_dry_run);

  -- Only when the set actually changes: the write bumps updated_at, which
  -- relights every holder's "new" dot, and re-sharing to the same table (the
  -- pending-reveal banner's Reveal) changes nothing they can read.
  if not p_dry_run
     and not (v_doc.player_visible_to @> v_members and v_doc.player_visible_to <@ v_members) then
    update public.scriptorium_documents
       set player_visible_to = v_members
     where id = v_doc.id;
  end if;

  return v_reveals || jsonb_build_object(
    'added', to_jsonb(array(select x from unnest(v_members) x except select y from unnest(v_doc.player_visible_to) y)),
    'removed', to_jsonb(array(select y from unnest(v_doc.player_visible_to) y except select x from unnest(v_members) x)));
end;
$function$;

CREATE OR REPLACE FUNCTION public.take_notice_board_pin(p_pin_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_pin public.notice_board_pins;
  v_board public.notice_boards;
  v_member uuid;
  v_taker text;
  v_party uuid[];
  v_doc public.scriptorium_documents;
  v_added uuid[];
  v_what text;
  v_campaign uuid;
begin
  -- Authorize first, on the campaign alone, and only then lock: a caller outside the campaign learns nothing (a pin
  -- that does not exist is refused the same way) and holds no lock.
  select p.campaign_id into v_campaign from public.notice_board_pins p where p.id = p_pin_id;
  v_member := private.my_party_member_id(v_campaign);
  if (select auth.uid()) is null or v_campaign is null or v_member is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  -- Locked before anything else is read from it: two players tapping at once queue here, and the second finds it taken.
  select * into v_pin from public.notice_board_pins where id = p_pin_id for update;
  if not found or v_pin.status = 'draft' then
    raise exception 'Notice not found' using errcode = 'P0002';
  end if;
  select * into v_board from public.notice_boards where id = v_pin.board_id;
  if not v_board.is_revealed or v_board.presented_at is null then
    raise exception 'The board is not in front of the party' using errcode = '42501';
  end if;
  if v_pin.quest_id is null and v_pin.handout_id is null then
    raise exception 'This notice offers nothing to take' using errcode = '22023';
  end if;
  if v_pin.status = 'taken' then
    return jsonb_build_object(
      'outcome', 'already_taken',
      'taken_by_name', (select pm.name from public.party_members pm where pm.id = v_pin.taken_by),
      'quest_id', v_pin.quest_id,
      'handout_id', v_pin.handout_id);
  end if;

  select pm.name into v_taker from public.party_members pm where pm.id = v_member;
  update public.notice_board_pins
     set status = 'taken',
         taken_by = v_member,
         taken_at = now(),
         taken_session_number = (select s.number from public.campaign_sessions s
                                  where s.campaign_id = v_pin.campaign_id
                                    and s.started_at is not null and s.ended_at is null)
   where id = v_pin.id;

  v_party := array(select pm.id from public.party_members pm where pm.campaign_id = v_pin.campaign_id);
  if v_pin.quest_id is not null then
    perform private.reveal_quest_to(v_pin.campaign_id, v_pin.quest_id, v_party);
  end if;
  if v_pin.handout_id is not null then
    -- give_handout's share: add who lacks it, and apply the handout's own entity reveals.
    select * into v_doc from public.scriptorium_documents d
     where d.id = v_pin.handout_id and d.campaign_id = v_pin.campaign_id;
    if found then
      v_added := array(select x from unnest(v_party) x except select y from unnest(v_doc.player_visible_to) y);
      perform private.apply_handout_reveals(v_pin.campaign_id, private.book_body(v_doc.id)::text, v_doc.player_visible_to || v_added, false);
      if cardinality(v_added) > 0 then
        update public.scriptorium_documents set player_visible_to = v_doc.player_visible_to || v_added where id = v_doc.id;
      end if;
    end if;
  end if;

  -- Worded as the player's own toast words it (noticePhrase in src/lib/noticeBoard/faces.ts).
  v_what := case when nullif(btrim(v_pin.headline), '') is null then
                   case v_pin.style when 'poster' then 'a wanted poster' when 'letter' then 'a sealed letter'
                                    when 'image' then 'a picture' else 'a notice' end
                 when v_pin.style = 'poster' then 'the wanted poster for ' || btrim(v_pin.headline)
                 else '“' || btrim(v_pin.headline) || '”' end;
  insert into public.campaign_messages (campaign_id, user_id, sender_name, message, type)
  values (v_pin.campaign_id, v_board.user_id, 'Grimoire',
          '📌 ' || coalesce(v_taker, 'Someone') || ' took ' || v_what || ' from ' || v_board.name || '.', 'system');

  return jsonb_build_object('outcome', 'taken', 'taken_by_name', v_taker,
                            'quest_id', v_pin.quest_id, 'handout_id', v_pin.handout_id);
end;
$function$;

CREATE OR REPLACE FUNCTION private.perform_quest_consequence(p_event_id uuid, p_year integer, p_month integer, p_day integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_ev  public.quest_consequence_events%rowtype;
  v_q   public.quests%rowtype;
  v_id  uuid;
  v_prev_rel public.npc_relationship;
  v_ladder text[] := array['hostile', 'unfriendly', 'indifferent', 'friendly', 'helpful'];
  v_idx int;
  v_step int;
  v_to text;
  v_prev_quest_status public.quest_status_enum;
  v_text text;
  v_prev_status text;
  v_prev_visible boolean;
  v_doc record;
  v_added uuid[];
  v_prev_location uuid;
  v_npc public.npcs%rowtype;
  v_prev_standing public.npc_relationship;
  v_clock public.quest_clocks%rowtype;
  v_tid uuid;
begin
  select * into v_ev from public.quest_consequence_events where id = p_event_id;
  if not found or v_ev.performed_at is not null or v_ev.undone_at is not null then
    return;
  end if;
  select * into v_q from public.quests where id = v_ev.quest_id;

  if v_ev.action in ('raise', 'reveal', 'complete', 'fail') then
    -- Only reached for a HELD ledger verb being fired from the log: a normal
    -- one already moved the objective inline in apply_quest_consequences.
    -- Recording previous_status/previous_is_player_visible here, at the
    -- moment it actually happens, is what lets `previous` undo it correctly
    -- later — a held event's own columns are null until this runs.
    select status, is_player_visible into v_prev_status, v_prev_visible
      from public.quest_objectives where id = v_ev.target_objective_id;

    update public.quest_objectives
       set status = case v_ev.action
             when 'raise' then case when status = 'dormant' then 'pending' else status end
             when 'reveal' then case when status = 'dormant' then 'pending' else status end
             when 'complete' then case when status in ('dormant', 'pending') then 'complete' else status end
             when 'fail' then case when status in ('dormant', 'pending') then 'failed' else status end
           end,
           is_player_visible = case when v_ev.action = 'reveal' then true else is_player_visible end
     where id = v_ev.target_objective_id;

    update public.quest_consequence_events
       set previous_status = v_prev_status, previous_is_player_visible = v_prev_visible
     where id = p_event_id;

  elsif v_ev.action = 'create_calendar_event' then
    insert into public.calendar_events (
      user_id, campaign_id, title, description, event_type,
      harptos_year, harptos_month, harptos_day, linked_quest_id, player_visible
    ) values (
      v_q.user_id, v_ev.campaign_id,
      coalesce(nullif(btrim(v_ev.action_payload ->> 'title'), ''), v_q.title),
      v_ev.action_payload ->> 'description',
      -- #1011: event_type is NOT NULL; a rule written without one (an AI
      -- spine, an import) files under quest rather than failing at fire time.
      coalesce(nullif(btrim(v_ev.action_payload ->> 'event_type'), ''), 'quest'),
      p_year, p_month, p_day, v_ev.quest_id,
      false
    ) returning id into v_id;
    update public.quest_consequence_events set calendar_event_id = v_id where id = p_event_id;

  elsif v_ev.action = 'send_broadcast' then
    insert into public.campaign_messages (campaign_id, user_id, sender_name, message, type)
    values (v_ev.campaign_id, v_q.user_id, 'Grimoire',
            coalesce(nullif(btrim(v_ev.action_payload ->> 'message'), ''),
                     'Something has changed in ' || v_q.title || '.'),
            'system')
    returning id into v_id;
    update public.quest_consequence_events set message_id = v_id where id = p_event_id;

  elsif v_ev.action = 'shift_npc_relationship' then
    select n.relationship into v_prev_rel
      from public.npcs n
     where n.id = v_ev.target_npc_id and n.campaign_id = v_ev.campaign_id;

    v_to := v_ev.action_payload ->> 'to';
    if v_to is not null then
      -- The absolute form: "becomes helpful". Unlike a step it applies from
      -- `unknown` too — the DM is stating the stance outright, not moving it
      -- from one they never set — and it records the previous value
      -- (`unknown` included) so `previous` puts it back exactly.
      if v_to <> all (v_ladder) then
        raise exception 'shift_npc_relationship: unknown stance %', v_to using errcode = '22023';
      end if;
      if v_prev_rel is not null and v_prev_rel::text <> v_to then
        update public.npcs
           set relationship = v_to::public.npc_relationship
         where id = v_ev.target_npc_id;
        update public.quest_consequence_events
           set previous_relationship = v_prev_rel
         where id = p_event_id;
      end if;
    else
      v_step := coalesce((v_ev.action_payload ->> 'step')::int, 0);
      if v_prev_rel is not null and v_prev_rel <> 'unknown' and v_step <> 0 then
        v_idx := array_position(v_ladder, v_prev_rel::text);
        v_idx := least(greatest(v_idx + v_step, 1), array_length(v_ladder, 1));
        update public.npcs
           set relationship = v_ladder[v_idx]::public.npc_relationship
         where id = v_ev.target_npc_id;
        update public.quest_consequence_events
           set previous_relationship = v_prev_rel
         where id = p_event_id;
      end if;
    end if;

  elsif v_ev.action = 'unlock_quest' then
    select q.status into v_prev_quest_status
      from public.quests q
     where q.id = v_ev.target_quest_id and q.campaign_id = v_ev.campaign_id;

    if v_prev_quest_status = 'undiscovered' then
      update public.quests set status = 'active' where id = v_ev.target_quest_id;
      -- The bridge's target quest is entered sideways: its own entry beat is
      -- the rumour the party has now caused, so surface it the same way a
      -- quest arrived at by cursor would (see the enum-rebuild comment above).
      update public.quest_beats b
         set visibility = 'rumored'
        from public.quests q
       where q.id = v_ev.target_quest_id and q.entry_beat_id = b.id and b.visibility = 'hidden';
      update public.quest_consequence_events
         set previous_quest_status = v_prev_quest_status
       where id = p_event_id;
    end if;

  elsif v_ev.action = 'grant_knowledge' then
    v_text := v_ev.action_payload ->> 'text';
    if nullif(btrim(v_text), '') is null then
      raise exception 'grant_knowledge requires action_payload.text' using errcode = '22023';
    end if;
    insert into public.player_journal_entries (
      user_id, campaign_id, title, content, category, is_private,
      ref_type, ref_id, ref_label
    ) values (
      v_q.user_id, v_ev.campaign_id, left(btrim(v_text), 120), v_text, 'discovery', false,
      'quest', v_ev.quest_id, v_q.title
    ) returning id into v_id;
    update public.quest_consequence_events set journal_entry_id = v_id where id = p_event_id;

  elsif v_ev.action = 'owe_favor' then
    v_text := v_ev.action_payload ->> 'text';
    if nullif(btrim(v_text), '') is null then
      raise exception 'owe_favor requires action_payload.text' using errcode = '22023';
    end if;
    insert into public.npc_favors (campaign_id, npc_id, quest_id, text, source_event_id, created_by)
    values (v_ev.campaign_id, v_ev.target_npc_id, v_ev.quest_id, v_text, p_event_id, auth.uid())
    returning id into v_id;
    update public.quest_consequence_events set favor_id = v_id where id = p_event_id;

  elsif v_ev.action = 'award_milestone' then
    v_text := v_ev.action_payload ->> 'text';
    if nullif(btrim(v_text), '') is null then
      raise exception 'award_milestone requires action_payload.text' using errcode = '22023';
    end if;
    insert into public.party_milestones (campaign_id, quest_id, text, source_event_id, created_by)
    values (v_ev.campaign_id, v_ev.quest_id, v_text, p_event_id, auth.uid())
    returning id into v_id;
    update public.quest_consequence_events set milestone_id = v_id where id = p_event_id;

    insert into public.campaign_messages (campaign_id, user_id, sender_name, message, type)
    values (v_ev.campaign_id, v_q.user_id, 'Grimoire', '🏅 ' || v_text, 'system')
    returning id into v_id;
    update public.quest_consequence_events set message_id = v_id where id = p_event_id;

  elsif v_ev.action = 'give_handout' then
    -- The handout reaches the whole party, through the same reveal path as a
    -- DM's own share_handout (20261004105821), so a handout a quest gives
    -- reveals exactly what one handed over by hand does. Scoped to the
    -- event's campaign: this runs as definer, and a rule naming another
    -- campaign's document must change nothing. A handout moved out of the
    -- campaign since the rule was written is simply not given.
    select d.id, d.player_visible_to into v_doc
      from public.scriptorium_documents d
     where d.id = v_ev.target_document_id and d.campaign_id = v_ev.campaign_id
       and d.user_id = v_q.user_id;
    if found then
      v_added := array(
        select pm.id from public.party_members pm
         where pm.campaign_id = v_ev.campaign_id
        except
        select x from unnest(v_doc.player_visible_to) x);
      perform private.apply_handout_reveals(
        v_ev.campaign_id, private.book_body(v_doc.id)::text, v_doc.player_visible_to || v_added, false);
      -- Nobody new: no write, or updated_at would relight every holder's dot.
      if cardinality(v_added) > 0 then
        update public.scriptorium_documents
           set player_visible_to = v_doc.player_visible_to || v_added
         where id = v_doc.id;
      end if;
      -- The undo handle: only the recipients this event added, so undoing it
      -- never takes the handout from someone the DM gave it to by hand.
      update public.quest_consequence_events set handout_member_ids = v_added where id = p_event_id;
    end if;

  elsif v_ev.action = 'tick_clock' then
    -- Only reached for a HELD tick fired from the log; an unheld one moved
    -- the clock inline in apply_quest_consequences. Filling it here fires
    -- its rules under an assert transition of their own, as a tick from the
    -- run cockpit does.
    select * into v_clock from public.quest_clocks
     where id = v_ev.target_clock_id and campaign_id = v_ev.campaign_id for update;
    if found then
      update public.quest_consequence_events set previous_clock_filled = v_clock.filled where id = p_event_id;
      perform private.tick_quest_clock_by(v_clock.id, coalesce((v_ev.action_payload ->> 'step')::int, 1), null);
    end if;

  elsif v_ev.action = 'move_npc' then
    -- #1011. Scoped to the event's campaign on both ends: a definer must not
    -- move another campaign's NPC, or into another campaign's place.
    select n.location_id into v_prev_location
      from public.npcs n
     where n.id = v_ev.target_npc_id and n.campaign_id = v_ev.campaign_id;
    if found and exists (
      select 1 from public.locations l
       where l.id = v_ev.target_location_id and l.campaign_id = v_ev.campaign_id
    ) then
      update public.npcs set location_id = v_ev.target_location_id where id = v_ev.target_npc_id;
      update public.quest_consequence_events
         set previous_location_id = v_prev_location, npc_moved = true
       where id = p_event_id;
    end if;

  elsif v_ev.action = 'add_companion' then
    -- #1011. The same row CompanionForm seeds from an NPC: name, portrait,
    -- and the leading numbers of its stat block's HP, AC and speed. It joins
    -- the party unassigned; the DM gives it an owner on the Party page.
    select * into v_npc from public.npcs n
     where n.id = v_ev.target_npc_id and n.campaign_id = v_ev.campaign_id;
    if found then
      insert into public.companions (
        user_id, campaign_id, name, companion_type, source_type, source_npc_id,
        max_hp, current_hp, ac, speed, portrait_url, portrait_focal_point
      ) values (
        v_q.user_id, v_ev.campaign_id, v_npc.name, 'ally', 'npc', v_npc.id,
        coalesce(substring(v_npc.stat_block ->> 'hit_points' from '(\d+)')::int, 1),
        coalesce(substring(v_npc.stat_block ->> 'hit_points' from '(\d+)')::int, 1),
        coalesce(substring(v_npc.stat_block ->> 'armor_class' from '(\d+)')::int, 10),
        coalesce(substring(v_npc.stat_block ->> 'speed' from '(\d+)')::int, 30),
        v_npc.portrait_url, v_npc.portrait_focal_point
      ) returning id into v_id;
      update public.quest_consequence_events set companion_id = v_id where id = p_event_id;
    end if;

  elsif v_ev.action = 'shift_faction_standing' then
    -- #1011: the party's standing with a faction, on the NPC ladder and with
    -- the same two payload forms as shift_npc_relationship.
    select f.party_standing into v_prev_standing
      from public.factions f
     where f.id = v_ev.target_faction_id and f.campaign_id = v_ev.campaign_id;

    v_to := v_ev.action_payload ->> 'to';
    if v_to is not null then
      if v_to <> all (v_ladder) then
        raise exception 'shift_faction_standing: unknown stance %', v_to using errcode = '22023';
      end if;
      if v_prev_standing is not null and v_prev_standing::text <> v_to then
        update public.factions set party_standing = v_to::public.npc_relationship where id = v_ev.target_faction_id;
        update public.quest_consequence_events set previous_standing = v_prev_standing where id = p_event_id;
      end if;
    else
      v_step := coalesce((v_ev.action_payload ->> 'step')::int, 0);
      if v_prev_standing is not null and v_prev_standing <> 'unknown' and v_step <> 0 then
        v_idx := array_position(v_ladder, v_prev_standing::text);
        v_idx := least(greatest(v_idx + v_step, 1), array_length(v_ladder, 1));
        update public.factions set party_standing = v_ladder[v_idx]::public.npc_relationship where id = v_ev.target_faction_id;
        update public.quest_consequence_events set previous_standing = v_prev_standing where id = p_event_id;
      end if;
    end if;
  end if;

  update public.quest_consequence_events
     set performed_at = now(), held_at = null,
         performed_on_year = p_year, performed_on_month = p_month, performed_on_day = p_day
   where id = p_event_id;
end $function$;

-- ── Copying a campaign to a new owner copies its handouts' chapters ─────────
-- transfer_campaign_ownership (copy mode) clones the outgoing DM's account-wide documents the
-- campaign reaches (NPC sheets, beat handouts). Unchanged but for the chapter copy after each
-- document: without it the new owner received books with no text.

CREATE OR REPLACE FUNCTION public.transfer_campaign_ownership(p_campaign_id uuid, p_new_owner_id uuid, p_leave_campaign boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid       uuid := auth.uid();
  v_owner     uuid;
  v_new_role  text;
  v_monsters  jsonb := '{}'::jsonb;  -- old id (text) -> new id (text)
  v_traps     jsonb := '{}'::jsonb;
  v_bgs       jsonb := '{}'::jsonb;
  v_docs      jsonb := '{}'::jsonb;
  v_items     jsonb := '{}'::jsonb;  -- (#733)
  v_npcs      jsonb := '{}'::jsonb;  -- (#733)
  v_factions  jsonb := '{}'::jsonb;  -- (#733)
  v_locations jsonb := '{}'::jsonb;  -- (#733)
  v_new       uuid;
  r           record;
begin
  -- ── Authorization ─────────────────────────────────────────────────────────
  -- SECURITY DEFINER bypasses RLS, so identity is re-derived from auth.uid() and
  -- never taken from a caller-supplied id.
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select user_id into v_owner from public.campaigns where id = p_campaign_id;

  if v_owner is null then
    raise exception 'Campaign not found';
  end if;

  if v_owner <> v_uid then
    raise exception 'Only the campaign owner can transfer it';
  end if;

  if p_new_owner_id = v_uid then
    raise exception 'You already own this campaign';
  end if;

  -- The recipient must already be a member. That is the consent step: a campaign
  -- can only be handed to someone who chose to join it via an invite link, never
  -- pushed onto an arbitrary account id.
  select role into v_new_role
  from public.campaign_members
  where campaign_id = p_campaign_id and user_id = p_new_owner_id;

  if v_new_role is null then
    raise exception 'The new owner must already be a member of this campaign';
  end if;

  -- ── 1. Clone the personal-library rows the campaign hydrates from ─────────
  perform set_config('grimoire.bypass_quota', 'on', true);

  -- monsters: referenced by encounters (blueprint combatants and spawn events),
  -- NPC stat-block links, the campaign bestiary, pinned wildshape forms,
  -- companions, live wildshape state, the campaign's monster exclusions, and
  -- (#630) quest_refs / quest_beat_attachments. The union that used to live
  -- inline here moved to private.campaign_referenced_monster_ids, shared with
  -- the scoped-copy wrapper's exclusion set so the two cannot drift again.
  for r in
    select m.*
    from public.monsters m
    where m.user_id = v_owner
      and m.id in (select private.campaign_referenced_monster_ids(p_campaign_id))
  loop
    v_new := gen_random_uuid();
    insert into public.monsters
    select (jsonb_populate_record(
              null::public.monsters,
              to_jsonb(r) || jsonb_build_object('id', v_new, 'user_id', p_new_owner_id)
            )).*;
    v_monsters := v_monsters || jsonb_build_object(r.id::text, v_new::text);
  end loop;

  -- traps: referenced by encounters.trap_ids (uuid[], no FK). Union moved to
  -- private.campaign_referenced_trap_ids (#630) -- same sharing rationale as
  -- the monster loop above.
  for r in
    select t.*
    from public.traps t
    where t.user_id = v_owner
      and t.id in (select private.campaign_referenced_trap_ids(p_campaign_id))
  loop
    v_new := gen_random_uuid();
    insert into public.traps
    select (jsonb_populate_record(
              null::public.traps,
              to_jsonb(r) || jsonb_build_object('id', v_new, 'user_id', p_new_owner_id)
            )).*;
    v_traps := v_traps || jsonb_build_object(r.id::text, v_new::text);
  end loop;

  -- backgrounds: character sheets resolve their origin features through
  -- party_members.background_id. Library backgrounds (text slugs) are shared and
  -- stay as they are; only a uuid, the owner's own row, is copied.
  for r in
    select b.*
    from public.backgrounds b
    where b.user_id = v_owner
      and b.id::text in (
        select pm.background_id from public.party_members pm
          where pm.campaign_id = p_campaign_id and pm.background_id is not null
      )
  loop
    v_new := gen_random_uuid();
    insert into public.backgrounds
    select (jsonb_populate_record(
              null::public.backgrounds,
              to_jsonb(r) || jsonb_build_object('id', v_new, 'user_id', p_new_owner_id)
            )).*;
    v_bgs := v_bgs || jsonb_build_object(r.id::text, v_new::text);
  end loop;

  -- scriptorium_documents: NPC handouts / stat-block sheets. A plain copy of the
  -- row plus its chapters (#1115) is a complete copy.
  -- (#733) Reachability extended with two unions: handouts attached directly
  -- to a quest beat, and the handout of a quest-referenced GLOBAL npc that the
  -- npc loop below is about to clone (that npc's own scriptorium_doc_id link
  -- must resolve for the new owner too).
  for r in
    select d.*
    from public.scriptorium_documents d
    where d.user_id = v_owner
      -- (#915) Only account-wide documents are copied. A document scoped to
      -- this campaign is the campaign's own content and moves with it below.
      and d.campaign_id is null
      and d.id in (
        select n.scriptorium_doc_id from public.npcs n
          where n.campaign_id = p_campaign_id and n.scriptorium_doc_id is not null
        union
        -- (#733) handouts attached directly to a quest beat.
        select qba.ref_id::uuid
          from public.quest_beat_attachments qba
         where qba.campaign_id = p_campaign_id
           and qba.attachment_type = 'handout'
           and qba.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        union
        -- (#733) a quest-referenced GLOBAL npc's own handout.
        select n.scriptorium_doc_id
          from public.npcs n
         where n.campaign_id is null
           and n.user_id = v_owner
           and n.scriptorium_doc_id is not null
           and (
             exists (
               select 1 from public.quest_refs qr
               join public.quests q on q.id = qr.quest_id
               where q.campaign_id = p_campaign_id
                 and qr.ref_type = 'npc'
                 and qr.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                 and qr.ref_id::uuid = n.id
             )
             or exists (
               select 1 from public.quest_beat_attachments qba
               where qba.campaign_id = p_campaign_id
                 and qba.attachment_type = 'npc'
                 and qba.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                 and qba.ref_id::uuid = n.id
             )
           )
      )
  loop
    v_new := gen_random_uuid();
    insert into public.scriptorium_documents
    select (jsonb_populate_record(
              null::public.scriptorium_documents,
              to_jsonb(r) || jsonb_build_object('id', v_new, 'user_id', p_new_owner_id)
            )).*;
    v_docs := v_docs || jsonb_build_object(r.id::text, v_new::text);
    -- (#1115) A document's text is its chapters: the copy takes them along.
    insert into public.scriptorium_chapters (document_id, position, title, content, word_count)
    select v_new, c.position, c.title, c.content, c.word_count
      from public.scriptorium_chapters c
     where c.document_id = r.id;
  end loop;

  -- (#733) items: referenced by quest_refs ('item') and quest_beat_attachments
  -- ('item'). Only the outgoing DM's GLOBAL items are candidates -- campaign-
  -- scoped items already move with the campaign in step 3 below, ids intact.
  for r in
    select i.*
    from public.items i
    where i.user_id = v_owner
      and i.campaign_id is null
      and (
        exists (
          select 1 from public.quest_refs qr
          join public.quests q on q.id = qr.quest_id
          where q.campaign_id = p_campaign_id
            and qr.ref_type = 'item'
            and qr.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and qr.ref_id::uuid = i.id
        )
        or exists (
          select 1 from public.quest_beat_attachments qba
          where qba.campaign_id = p_campaign_id
            and qba.attachment_type = 'item'
            and qba.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and qba.ref_id::uuid = i.id
        )
      )
  loop
    v_new := gen_random_uuid();
    insert into public.items
    select (jsonb_populate_record(
              null::public.items,
              to_jsonb(r) || jsonb_build_object('id', v_new, 'user_id', p_new_owner_id)
            )).*;
    v_items := v_items || jsonb_build_object(r.id::text, v_new::text);
  end loop;

  -- (#733) npcs: referenced by quest_refs ('npc') and quest_beat_attachments
  -- ('npc'). A cloned npc's own linked_monster_id / scriptorium_doc_id are
  -- remapped in the second-order block below, once every map here is full.
  for r in
    select n.*
    from public.npcs n
    where n.user_id = v_owner
      and n.campaign_id is null
      and (
        exists (
          select 1 from public.quest_refs qr
          join public.quests q on q.id = qr.quest_id
          where q.campaign_id = p_campaign_id
            and qr.ref_type = 'npc'
            and qr.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and qr.ref_id::uuid = n.id
        )
        or exists (
          select 1 from public.quest_beat_attachments qba
          where qba.campaign_id = p_campaign_id
            and qba.attachment_type = 'npc'
            and qba.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and qba.ref_id::uuid = n.id
        )
      )
  loop
    v_new := gen_random_uuid();
    insert into public.npcs
    select (jsonb_populate_record(
              null::public.npcs,
              to_jsonb(r) || jsonb_build_object('id', v_new, 'user_id', p_new_owner_id)
            )).*;
    v_npcs := v_npcs || jsonb_build_object(r.id::text, v_new::text);
  end loop;

  -- (#733) factions: referenced by quest_refs ('faction') and
  -- quest_beat_attachments ('faction'). Cloned SHALLOW -- faction_* junction
  -- rows (memberships, relations, deity/item/location links) are campaign
  -- relations, not part of the faction record itself, and are deliberately
  -- NOT cloned here. A campaign faction's own junction rows already travel
  -- with it via step 3 below (ids stable); a cloned GLOBAL faction starts
  -- with none, which is correct -- it never had campaign relations of its own.
  for r in
    select f.*
    from public.factions f
    where f.user_id = v_owner
      and f.campaign_id is null
      and (
        exists (
          select 1 from public.quest_refs qr
          join public.quests q on q.id = qr.quest_id
          where q.campaign_id = p_campaign_id
            and qr.ref_type = 'faction'
            and qr.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and qr.ref_id::uuid = f.id
        )
        or exists (
          select 1 from public.quest_beat_attachments qba
          where qba.campaign_id = p_campaign_id
            and qba.attachment_type = 'faction'
            and qba.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and qba.ref_id::uuid = f.id
        )
      )
  loop
    v_new := gen_random_uuid();
    insert into public.factions
    select (jsonb_populate_record(
              null::public.factions,
              to_jsonb(r) || jsonb_build_object('id', v_new, 'user_id', p_new_owner_id)
            )).*;
    v_factions := v_factions || jsonb_build_object(r.id::text, v_new::text);
  end loop;

  -- (#733, rewritten by #797) locations: referenced by quest_refs ('location')
  -- and by quest_beats.staged_at_location_id -- the place a beat happens at.
  -- This used to chase a beat attachment's ref_id and the room id array beside
  -- it; both went when staging became a column, so a beat now names exactly one
  -- place and the sweep is one predicate instead of two. A cloned location's
  -- own parent_id / source_map_id are handled in the second-order block below.
  for r in
    select l.*
    from public.locations l
    where l.user_id = v_owner
      and l.campaign_id is null
      and (
        exists (
          select 1 from public.quest_refs qr
          join public.quests q on q.id = qr.quest_id
          where q.campaign_id = p_campaign_id
            and qr.ref_type = 'location'
            and qr.ref_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            and qr.ref_id::uuid = l.id
        )
        or exists (
          -- A staged place AND everything under it. The old attachment cloned
          -- rooms because metadata->'room_ids' happened to list them, which
          -- meant a room the DM forgot to list stayed behind. Staging names the
          -- site, so the site's rooms follow by descent — a dungeon that
          -- arrives without its rooms is not a dungeon.
          --
          -- No uuid-shape regex here, unlike the quest_refs arm above: ref_id is
          -- untyped text, while staged_at_location_id is a uuid column with a
          -- foreign key behind it.
          with recursive staged as (
            select qb.staged_at_location_id as id
              from public.quest_beats qb
             where qb.campaign_id = p_campaign_id
               and qb.staged_at_location_id is not null
            union
            select c.id
              from public.locations c
              join staged s on c.parent_id = s.id
          )
          select 1 from staged where staged.id = l.id
        )
      )
  loop
    v_new := gen_random_uuid();
    insert into public.locations
    select (jsonb_populate_record(
              null::public.locations,
              to_jsonb(r) || jsonb_build_object('id', v_new, 'user_id', p_new_owner_id)
            )).*;
    v_locations := v_locations || jsonb_build_object(r.id::text, v_new::text);
  end loop;

  -- ── Second-order remaps within the newly cloned rows ───────────────────────
  -- (#733) A clone's own FK columns may point at ANOTHER row that was ALSO
  -- cloned in this same transaction (a cloned npc's linked_monster_id /
  -- scriptorium_doc_id, or a cloned location's parent_id pointing at another
  -- cloned location). Every map above is fully populated by this point, so
  -- these updates target the CLONE ids (v_npcs / v_locations values) --
  -- never campaign_id = p_campaign_id rows, which the step-2-style repoints
  -- below handle separately. npcs has no faction-reference column to remap.
  update public.npcs
     set linked_monster_id = (v_monsters->>linked_monster_id::text)::uuid
   where id in (select value::uuid from jsonb_each_text(v_npcs))
     and linked_monster_id is not null
     and v_monsters ? linked_monster_id::text;

  update public.npcs
     set scriptorium_doc_id = (v_docs->>scriptorium_doc_id::text)::uuid
   where id in (select value::uuid from jsonb_each_text(v_npcs))
     and scriptorium_doc_id is not null
     and v_docs ? scriptorium_doc_id::text;

  -- Cloned locations: remap parent_id clone-to-clone (a cloned room's parent
  -- may be another cloned location), then null source_map_id -- the new owner
  -- can open neither the outgoing DM's Cartographer map nor the deep-link
  -- target, same rule as the campaign-location source_map_id null-out below.
  update public.locations
     set parent_id = (v_locations->>parent_id::text)::uuid
   where id in (select value::uuid from jsonb_each_text(v_locations))
     and parent_id is not null
     and v_locations ? parent_id::text;

  update public.locations
     set source_map_id = null
   where id in (select value::uuid from jsonb_each_text(v_locations))
     and source_map_id is not null;

  -- ── 2. Repoint the campaign's references at the clones ────────────────────

  -- Plain FK columns.
  update public.npcs
     set linked_monster_id = (v_monsters->>linked_monster_id::text)::uuid
   where campaign_id = p_campaign_id
     and linked_monster_id is not null
     and v_monsters ? linked_monster_id::text;

  update public.discovered_monsters
     set monster_id = (v_monsters->>monster_id::text)::uuid
   where campaign_id = p_campaign_id
     and monster_id is not null
     and v_monsters ? monster_id::text;

  update public.pinned_forms
     set monster_id = (v_monsters->>monster_id::text)::uuid
   where campaign_id = p_campaign_id
     and monster_id is not null
     and v_monsters ? monster_id::text;

  -- text column, so no cast on either side.
  update public.companions
     set source_monster_id = v_monsters->>source_monster_id
   where campaign_id = p_campaign_id
     and source_monster_id is not null
     and v_monsters ? source_monster_id;

  update public.party_members
     set background_id = v_bgs->>background_id
   where campaign_id = p_campaign_id
     and background_id is not null
     and v_bgs ? background_id::text;

  update public.npcs
     set scriptorium_doc_id = (v_docs->>scriptorium_doc_id::text)::uuid
   where campaign_id = p_campaign_id
     and scriptorium_doc_id is not null
     and v_docs ? scriptorium_doc_id::text;

  -- (#733) Every remaining campaign-content FK column that can hold an
  -- npc/item/faction/location id, found by enumerating information_schema
  -- for foreign keys targeting those four tables (see the migration's own
  -- report for the full accept/reject list). Same guarded-repoint shape as
  -- the plain FK columns above: touch only campaign rows, only non-null
  -- values, only when the value is actually a key in the relevant map.
  update public.companions
     set source_npc_id = (v_npcs->>source_npc_id::text)::uuid
   where campaign_id = p_campaign_id
     and source_npc_id is not null
     and v_npcs ? source_npc_id::text;

  update public.calendar_events
     set linked_location_id = (v_locations->>linked_location_id::text)::uuid
   where campaign_id = p_campaign_id
     and linked_location_id is not null
     and v_locations ? linked_location_id::text;

  update public.campaigns
     set current_location_id = (v_locations->>current_location_id::text)::uuid
   where id = p_campaign_id
     and current_location_id is not null
     and v_locations ? current_location_id::text;

  update public.encounters
     set location_id = (v_locations->>location_id::text)::uuid
   where campaign_id = p_campaign_id
     and location_id is not null
     and v_locations ? location_id::text;

  update public.locations
     set npc_owner_id = (v_npcs->>npc_owner_id::text)::uuid
   where campaign_id = p_campaign_id
     and npc_owner_id is not null
     and v_npcs ? npc_owner_id::text;

  -- Campaign locations only -- distinct from the clone-to-clone parent_id
  -- remap in the second-order block above, which targets the fresh clones.
  update public.locations
     set parent_id = (v_locations->>parent_id::text)::uuid
   where campaign_id = p_campaign_id
     and parent_id is not null
     and v_locations ? parent_id::text;

  update public.npc_inventory
     set item_id = (v_items->>item_id::text)::uuid
   where campaign_id = p_campaign_id
     and item_id is not null
     and v_items ? item_id::text;

  update public.npc_inventory
     set npc_id = (v_npcs->>npc_id::text)::uuid
   where campaign_id = p_campaign_id
     and npc_id is not null
     and v_npcs ? npc_id::text;

  -- World Web (#1084): a tie's ends follow the copies, either end, and so do kin links. Both ends move in one
  -- statement: world_links_normalize may reorder a symmetric link's ends, so a second statement could miss the other.
  update public.world_links
     set from_npc_id = coalesce((v_npcs->>from_npc_id::text)::uuid, from_npc_id),
         to_npc_id = coalesce((v_npcs->>to_npc_id::text)::uuid, to_npc_id)
   where campaign_id = p_campaign_id and (v_npcs ? from_npc_id::text or v_npcs ? to_npc_id::text);
  update public.kin_links
     set from_npc_id = coalesce((v_npcs->>from_npc_id::text)::uuid, from_npc_id),
         to_npc_id = coalesce((v_npcs->>to_npc_id::text)::uuid, to_npc_id)
   where campaign_id = p_campaign_id and (v_npcs ? from_npc_id::text or v_npcs ? to_npc_id::text);

  update public.npcs
     set location_id = (v_locations->>location_id::text)::uuid
   where campaign_id = p_campaign_id
     and location_id is not null
     and v_locations ? location_id::text;

  update public.party_inventory
     set item_id = (v_items->>item_id::text)::uuid
   where campaign_id = p_campaign_id
     and item_id is not null
     and v_items ? item_id::text;

  update public.party_members
     set current_location_id = (v_locations->>current_location_id::text)::uuid
   where campaign_id = p_campaign_id
     and current_location_id is not null
     and v_locations ? current_location_id::text;

  update public.puzzle_rooms
     set location_id = (v_locations->>location_id::text)::uuid
   where campaign_id = p_campaign_id
     and location_id is not null
     and v_locations ? location_id::text;

  update public.quests
     set giver_npc_id = (v_npcs->>giver_npc_id::text)::uuid
   where campaign_id = p_campaign_id
     and giver_npc_id is not null
     and v_npcs ? giver_npc_id::text;

  update public.quests
     set location_id = (v_locations->>location_id::text)::uuid
   where campaign_id = p_campaign_id
     and location_id is not null
     and v_locations ? location_id::text;

  -- FK children reachable only through a campaign-scoped parent -- same join
  -- shape as the ownership updates for these same tables in step 3 below.
  update public.crafting_recipe_ingredients ci
     set item_id = (v_items->>ci.item_id::text)::uuid
    from public.crafting_recipes cr
   where cr.id = ci.recipe_id
     and cr.campaign_id = p_campaign_id
     and ci.item_id is not null
     and v_items ? ci.item_id::text;

  update public.crafting_recipe_outputs co
     set item_id = (v_items->>co.item_id::text)::uuid
    from public.crafting_recipes cr
   where cr.id = co.recipe_id
     and cr.campaign_id = p_campaign_id
     and co.item_id is not null
     and v_items ? co.item_id::text;

  update public.world_links
     set from_item_id = coalesce((v_items->>from_item_id::text)::uuid, from_item_id),
         to_item_id = coalesce((v_items->>to_item_id::text)::uuid, to_item_id)
   where campaign_id = p_campaign_id and (v_items ? from_item_id::text or v_items ? to_item_id::text);

  update public.world_links
     set from_location_id = coalesce((v_locations->>from_location_id::text)::uuid, from_location_id),
         to_location_id = coalesce((v_locations->>to_location_id::text)::uuid, to_location_id)
   where campaign_id = p_campaign_id and (v_locations ? from_location_id::text or v_locations ? to_location_id::text);

  update public.faction_npcs fn
     set npc_id = (v_npcs->>fn.npc_id::text)::uuid
    from public.factions f
   where f.id = fn.faction_id
     and f.campaign_id = p_campaign_id
     and v_npcs ? fn.npc_id::text;

  update public.world_links
     set from_faction_id = coalesce((v_factions->>from_faction_id::text)::uuid, from_faction_id),
         to_faction_id = coalesce((v_factions->>to_faction_id::text)::uuid, to_faction_id)
   where campaign_id = p_campaign_id and (v_factions ? from_faction_id::text or v_factions ? to_faction_id::text);

  update public.store_items si
     set item_id = (v_items->>si.item_id::text)::uuid
    from public.locations l
   where l.id = si.location_id
     and l.campaign_id = p_campaign_id
     and v_items ? si.item_id::text;

  -- uuid[] columns -- rebuilt in place, order preserved, unmapped ids untouched.
  update public.encounters e
     set trap_ids = (
           select coalesce(array_agg(coalesce((v_traps->>u.tid::text)::uuid, u.tid) order by u.ord), '{}'::uuid[])
           from unnest(e.trap_ids) with ordinality as u(tid, ord)
         )
   where e.campaign_id = p_campaign_id
     and exists (select 1 from unnest(e.trap_ids) t where v_traps ? t::text);

  update public.campaigns c
     set excluded_monster_ids = (
           select array_agg(coalesce((v_monsters->>u.mid::text)::uuid, u.mid) order by u.ord)
           from unnest(c.excluded_monster_ids) with ordinality as u(mid, ord)
         )
   where c.id = p_campaign_id
     and c.excluded_monster_ids is not null
     and exists (select 1 from unnest(c.excluded_monster_ids) m where v_monsters ? m::text);

  -- JSONB columns. `combatants`, `events` and `wildshape_state` nest monster ids
  -- at three different depths, so rather than rebuilding each shape we substitute
  -- the uuid inside the serialized document. A v4 uuid is globally unique, so a
  -- match anywhere in the document IS that monster reference -- combatant slot
  -- ids and the like are distinct uuids and cannot collide.
  for r in select key as old_id, value as new_id from jsonb_each_text(v_monsters)
  loop
    update public.encounters
       set combatants = replace(combatants::text, r.old_id, r.new_id)::jsonb
     where campaign_id = p_campaign_id
       and combatants is not null
       and position(r.old_id in combatants::text) > 0;

    update public.encounters
       set events = replace(events::text, r.old_id, r.new_id)::jsonb
     where campaign_id = p_campaign_id
       and events is not null
       and position(r.old_id in events::text) > 0;

    update public.party_members
       set wildshape_state = replace(wildshape_state::text, r.old_id, r.new_id)::jsonb
     where campaign_id = p_campaign_id
       and wildshape_state is not null
       and position(r.old_id in wildshape_state::text) > 0;
  end loop;

  -- (#733) Combatants also carry npc_id (CombatantDef: "either monster_id or
  -- npc_id is set, not both") -- events and wildshape_state never reference an
  -- npc, only combatants does, so this pass is narrower than the monster one.
  for r in select key as old_id, value as new_id from jsonb_each_text(v_npcs)
  loop
    update public.encounters
       set combatants = replace(combatants::text, r.old_id, r.new_id)::jsonb
     where campaign_id = p_campaign_id
       and combatants is not null
       and position(r.old_id in combatants::text) > 0;
  end loop;

  -- Editor deep-links into the outgoing DM's Cartographer workspace: the new
  -- owner can open neither target, so drop the link rather than keep a dead one.
  update public.locations
     set source_map_id = null
   where campaign_id = p_campaign_id and source_map_id is not null;

  update public.puzzle_rooms
     set dungeon_feature_id = null
   where campaign_id = p_campaign_id and dungeon_feature_id is not null;

  -- ── 3. Move the campaign's own content ────────────────────────────────────
  -- The authored rows move through private.move_campaign_content, shared with
  -- a co-DM handing their chair back (#590), so the two cannot drift. It also
  -- carries what this list never did: site plans (doors, regions, placements,
  -- the site state log), session records and DM item entries, which stayed
  -- the outgoing owner's, readable by them as a player and gone with their
  -- account.
  perform private.move_campaign_content(p_campaign_id, v_owner, p_new_owner_id, false, true);

  -- (#983) The outgoing DM's DM notes in this campaign (written_as_dm, #590:
  -- never their player notes, nor the new owner's player notes, which a seat
  -- that rotated may have left behind), which a notes column would have
  -- carried along with its row. A co-DM taking
  -- over may keep their own on the same entity: the outgoing text joins theirs
  -- rather than arriving as a second note the scratchpad would never show.
  update public.entity_notes n
     set content = jsonb_build_object('type', 'doc', 'content',
           private.note_blocks(n.content) || (
             select coalesce(jsonb_agg(b.blk order by o.created_at, o.id, b.ord), '[]'::jsonb)
               from public.entity_notes o
              cross join lateral jsonb_array_elements(private.note_blocks(o.content))
                    with ordinality as b(blk, ord)
              where o.campaign_id = p_campaign_id and o.user_id = v_owner
                and o.written_as_dm
                and o.entity_type = n.entity_type and o.entity_id = n.entity_id))::text
   where n.user_id = p_new_owner_id and n.written_as_dm
     -- Their oldest, which is the one the scratchpad shows.
     and n.id = (select m.id from public.entity_notes m
                  where m.user_id = n.user_id and m.written_as_dm
                    and m.entity_type = n.entity_type and m.entity_id = n.entity_id
                  order by m.created_at, m.id limit 1)
     and exists (select 1 from public.entity_notes o
                  where o.campaign_id = p_campaign_id and o.user_id = v_owner
                    and o.written_as_dm
                    and o.entity_type = n.entity_type and o.entity_id = n.entity_id);
  delete from public.entity_notes o
   where o.campaign_id = p_campaign_id and o.user_id = v_owner
     and o.written_as_dm
     and exists (select 1 from public.entity_notes n
                  where n.user_id = p_new_owner_id and n.written_as_dm
                    and n.entity_type = o.entity_type and n.entity_id = o.entity_id);
  update public.entity_notes
     set user_id = p_new_owner_id
   where campaign_id = p_campaign_id and user_id = v_owner
     and written_as_dm;
  -- A co-DM taking over may have touched the same entity; theirs is kept.
  delete from public.dm_note_touches o
   where o.campaign_id = p_campaign_id and o.user_id = v_owner
     and exists (select 1 from public.dm_note_touches n
                  where n.user_id = p_new_owner_id and n.campaign_id = o.campaign_id
                    and n.entity_type = o.entity_type and n.entity_id = o.entity_id);
  update public.dm_note_touches         set user_id = p_new_owner_id where campaign_id = p_campaign_id and user_id = v_owner;

  -- ── 4. Swap the roles ─────────────────────────────────────────────────────
  -- Order matters. campaign_members_guard_self_update lets a row through
  -- unconditionally when private.is_campaign_dm(campaign_id) holds for auth.uid()
  -- -- which is the OUTGOING DM here. Demoting them first would revoke that and
  -- the trigger would then reject the promotion as an illegal self role change.
  --
  -- The new owner also stops being a player: a DM has no character, and leaving
  -- the link set would make their character read as "taken" in the member list
  -- and block the DM from reassigning it to a real player.
  update public.campaign_members
     set role = 'dm', party_member_id = null
   where campaign_id = p_campaign_id and user_id = p_new_owner_id;

  if p_leave_campaign then
    delete from public.campaign_members
     where campaign_id = p_campaign_id and user_id = v_owner;
  else
    update public.campaign_members
       set role = 'player'
     where campaign_id = p_campaign_id and user_id = v_owner;
  end if;

  -- ── 5. The campaign row ───────────────────────────────────────────────────
  -- BYOK credentials belong to the outgoing DM and are cleared, never handed
  -- over. spotify_client_id stays: it is a public OAuth client id and #180 wants
  -- the campaign's Spotify setup to travel with it. falai_api_key is not
  -- listed: the column was dropped by 20260809145858 (#641, fal.ai removed as
  -- an image provider) along with every other reference to it.
  update public.campaigns
     set user_id           = p_new_owner_id,
         openai_api_key    = null,
         anthropic_api_key = null,
         gemini_api_key    = null
   where id = p_campaign_id;

  -- ── 6. Repoint quest references at the clones ─────────────────────────────
  -- Runs AFTER the campaign row flip: the patched validator arms accept a
  -- global clone through the campaign-owner branch only once campaigns.user_id
  -- is the recipient. For every synced kind, quest_refs goes FIRST: repointing
  -- an attachment fires sync_quest_ref_from_beat_attachment, whose mirror
  -- insert must land as an ON CONFLICT no-op against the already-repointed row
  -- instead of leaving an old+new duplicate pair. (#733: this now covers every
  -- ref_type the sync trigger produces -- npc, faction, location, item,
  -- monster -- not only monster. 'handout' is not in this list because the
  -- sync trigger has no 'handout' case and quest_refs' own CHECK constraint
  -- does not allow that ref_type -- attachments only, no mirror row.)
  update public.quest_refs qr
     set ref_id = v_monsters->>qr.ref_id
    from public.quests q
   where q.id = qr.quest_id
     and q.campaign_id = p_campaign_id
     and qr.ref_type = 'monster'
     and v_monsters ? qr.ref_id;

  update public.quest_refs qr
     set ref_id = v_npcs->>qr.ref_id
    from public.quests q
   where q.id = qr.quest_id
     and q.campaign_id = p_campaign_id
     and qr.ref_type = 'npc'
     and v_npcs ? qr.ref_id;

  update public.quest_refs qr
     set ref_id = v_locations->>qr.ref_id
    from public.quests q
   where q.id = qr.quest_id
     and q.campaign_id = p_campaign_id
     and qr.ref_type = 'location'
     and v_locations ? qr.ref_id;

  update public.quest_refs qr
     set ref_id = v_items->>qr.ref_id
    from public.quests q
   where q.id = qr.quest_id
     and q.campaign_id = p_campaign_id
     and qr.ref_type = 'item'
     and v_items ? qr.ref_id;

  update public.quest_refs qr
     set ref_id = v_factions->>qr.ref_id
    from public.quests q
   where q.id = qr.quest_id
     and q.campaign_id = p_campaign_id
     and qr.ref_type = 'faction'
     and v_factions ? qr.ref_id;

  update public.quest_beat_attachments
     set ref_id = v_monsters->>ref_id
   where campaign_id = p_campaign_id
     and attachment_type = 'monster'
     and v_monsters ? ref_id;

  update public.quest_beat_attachments
     set ref_id = v_npcs->>ref_id
   where campaign_id = p_campaign_id
     and attachment_type = 'npc'
     and v_npcs ? ref_id;

  update public.quest_beat_attachments
     set ref_id = v_items->>ref_id
   where campaign_id = p_campaign_id
     and attachment_type = 'item'
     and v_items ? ref_id;

  update public.quest_beat_attachments
     set ref_id = v_factions->>ref_id
   where campaign_id = p_campaign_id
     and attachment_type = 'faction'
     and v_factions ? ref_id;

  update public.quest_beat_attachments
     set ref_id = v_docs->>ref_id
   where campaign_id = p_campaign_id
     and attachment_type = 'handout'
     and v_docs ? ref_id;

  -- #797: staging is a column, so repointing it is a single uuid swap. The
  -- room-id rebuild that used to sit here went with the list it maintained --
  -- production never held a non-empty room id array on any attachment, ever.
  --
  -- private.guard_beat_staging() fires on this UPDATE and passes because
  -- campaigns.user_id was already set to p_new_owner_id further up, so the
  -- clone (user_id = p_new_owner_id, campaign_id null) satisfies the
  -- campaign-owner arm. Moving this above that update would break transfers.
  update public.quest_beats qb
     set staged_at_location_id = (v_locations->>qb.staged_at_location_id::text)::uuid
   where qb.campaign_id = p_campaign_id
     and qb.staged_at_location_id is not null
     and v_locations ? qb.staged_at_location_id::text;
end;
$function$;
