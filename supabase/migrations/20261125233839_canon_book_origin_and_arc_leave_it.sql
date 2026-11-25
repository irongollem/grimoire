-- Two follow-ups of #1279 wave 2.
--
-- 1. Where a Scriptorium document came from. "Open as a book" must find the book a campaign drew before, however the DM
--    renamed it. A tag the DM can delete is not a record of origin, and a title match breaks on the first rename, so the
--    document says it: `drawn_from = 'canon'` on a book drawn from the campaign's canon (DM's or players'). Null is a
--    document the DM made. Books drawn before this column are recognised once, here, by the title drawing gave them.
alter table public.scriptorium_documents add column drawn_from text;
alter table public.scriptorium_documents add constraint scriptorium_documents_drawn_from_known
  check (drawn_from is null or drawn_from = 'canon');

update public.scriptorium_documents d
   set drawn_from = 'canon'
  from public.campaigns c
 where c.id = d.campaign_id
   and d.kind = 'book'
   and d.doc_type = 'custom'
   and d.title in (c.name || ': the DM''s book', c.name || ': the players'' book');

-- 2. "Leave it" on an arc. Tonight and the read-through call a running arc with no open force and no active quest a loose
--    end; a DM who means it to wait could not say so, because only canon entries had `loose_end_left_at`.
alter table public.canon_arcs add column loose_end_left_at timestamptz;
