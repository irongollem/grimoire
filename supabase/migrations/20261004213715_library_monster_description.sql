-- Migration: library_monster_description
-- Gives shared library monsters the `description` their stat block sheet already renders.
--
-- `monsters.description` (a DM's own creature) is the sheet's "Description"; `notes` is
-- "DM Notes". Library rows only ever had `notes`, so the lore a library monster carries
-- had nowhere to go but under the wrong heading, and every one of the 3,541 rows was
-- empty. Same shape as `monsters.description`: a Tiptap JSON string.
--
-- The Open5e seed (`scripts/seed-library-monsters.ts`) never writes this column, so a
-- re-import keeps it. That matters because most of the text cannot be re-derived from
-- Open5e: v2 serves no lore at all, and v1 only for Tome of Beasts 1 and 2, the SRD 2014
-- NPCs and Tal'Dorei. The rest was written for this app in its own words (4 Oct 2026),
-- deliberately not paraphrased from any book, and exists only in this column.

alter table public.library_monsters add column description text;

comment on column public.library_monsters.description is
  'Tiptap JSON. Open5e v1 lore where the book is open content, otherwise original text written for Grimoire. Not written by the Open5e seed.';
