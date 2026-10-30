-- Migration: scriptorium_handout_reveals_and_chapter_order
-- Three repairs to the books of chapters (20261029222021, #1115 story 13).
--
-- 1. A handout's reveals read only what its players may read. private.book_body fed
--    apply_handout_reveals the raw book, and that walks every node, secretBlock and lensDeep
--    included. While a lens pair could not be shared the Deep half never got there; once
--    20261029222021 retired that refusal, an NPC embedded in the Deep half (or in a DM-only
--    secret block) was revealed to everyone the book was given to, though get_player_handout
--    hid the text around it. book_body is read by those reveals alone (share_handout,
--    take_notice_board_pin, the give_handout consequence), so it strips at the source rather
--    than at each of the three call sites.
--
-- 2. Reordering is one statement. The client used to send one UPDATE per moved chapter, each
--    firing the statement-level touch on the book: thirty chapters moved meant thirty word
--    counts, thirty rings to every player holding the book, and a half-rewritten order when
--    one request in the middle failed.
--
-- 3. A book keeps at least one chapter. The rule lived in the client as read-then-delete, so
--    two tabs deleting different chapters of a two-chapter book both read "two" and emptied
--    it. The trigger locks the surviving book before it counts, so the second delete waits
--    for the first, counts again, and is refused.

-- ── 1. Reveals read the players' text ────────────────────────────────────────

-- The whole book as one Tiptap document, chapters in order, as its players may read it: what a
-- handout's reveals walk. DM-only blocks and Deep halves are gone, as in get_player_handout.
create or replace function private.book_body(p_document_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select private.strip_secret_nodes(jsonb_build_object('type', 'doc', 'content',
           coalesce(jsonb_agg(b.node order by c.position, c.created_at, b.ord), '[]'::jsonb)))
    from public.scriptorium_chapters c
    cross join lateral jsonb_array_elements(c.content -> 'content') with ordinality as b(node, ord)
   where c.document_id = p_document_id;
$$;

-- share_handout and apply_handout_reveals run as the DM (security invoker), so book_body does
-- too, and the DM now needs to run the strip. It is a pure function of the jsonb it is handed and
-- reads no table, and `private` is not published by PostgREST, so this grants nothing to read.
grant execute on function private.strip_secret_nodes(jsonb) to authenticated;

-- ── 2. One statement to reorder ──────────────────────────────────────────────

-- Invoker on purpose: the chapter update policy (private.can_edit_book) already decides who may
-- move chapters, so this needs no rights of its own. The explicit check turns "your update
-- matched nothing" into a refusal the client can show.
create or replace function public.reorder_scriptorium_chapters(p_document_id uuid, p_chapter_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not private.can_edit_book(p_document_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  -- The order must name every chapter of the book exactly once. A chapter added or deleted
  -- elsewhere since the client read the list makes it stale: refuse, and the client re-reads.
  if p_chapter_ids is null
     or cardinality(p_chapter_ids) <> (select count(distinct i.id) from unnest(p_chapter_ids) as i(id))
     or cardinality(p_chapter_ids) <> (select count(*) from public.scriptorium_chapters c
                                        where c.document_id = p_document_id)
     or cardinality(p_chapter_ids) <> (select count(*) from public.scriptorium_chapters c
                                        where c.document_id = p_document_id and c.id = any (p_chapter_ids)) then
    raise exception 'The chapter order does not match the book''s chapters' using errcode = '22023';
  end if;

  update public.scriptorium_chapters c
     set position = o.ord - 1
    from unnest(p_chapter_ids) with ordinality as o(id, ord)
   where c.id = o.id
     and c.document_id = p_document_id
     and c.position is distinct from (o.ord - 1)::integer;
end;
$$;

revoke execute on function public.reorder_scriptorium_chapters(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_scriptorium_chapters(uuid, uuid[]) to authenticated, service_role;

-- ── 3. A book keeps one chapter ──────────────────────────────────────────────

-- Runs as the deleter, who may edit the book (the chapter delete policy) and so may lock it.
-- A book deleted outright takes its chapters by cascade; it is already gone when this runs, so
-- nothing is locked or counted for it.
create or replace function private.keep_one_chapter()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Serialise deletes on the same book. Under read committed the count below takes a fresh
  -- snapshot after the lock is granted, so it sees a concurrent delete that just committed.
  perform 1
     from public.scriptorium_documents d
    where d.id in (select distinct o.document_id from old_rows o)
    order by d.id
      for update;
  if exists (
    select 1
      from public.scriptorium_documents d
     where d.id in (select distinct o.document_id from old_rows o)
       and not exists (select 1 from public.scriptorium_chapters c where c.document_id = d.id)
  ) then
    raise exception 'A book needs at least one chapter.' using errcode = '23514';
  end if;
  return null;
end;
$$;

revoke execute on function private.keep_one_chapter() from public, anon, authenticated;

create trigger scriptorium_chapters_keep_one
  after delete on public.scriptorium_chapters
  referencing old table as old_rows
  for each statement execute procedure private.keep_one_chapter();
