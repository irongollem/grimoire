-- Who a Scriptorium book is for (#1226 story 8, frame 10: "A book drawn from the campaign").
--
-- A book drawn from the campaign is for the DM or for the players. A players' book holds only what the whole party can
-- read, and its preview and print resolve every linked entry from the Open Book's whole-party snapshot rather than the
-- DM's own rows, so nothing the table has not learned is printed. The audience is a property of the book, set when it
-- is drawn; every existing book is the DM's.
alter table public.scriptorium_documents
  add column audience text not null default 'dm'
    constraint scriptorium_documents_audience check (audience in ('dm', 'players'));
