-- Migration: enforce_library_monsters_is_shared
-- Makes library_monsters.is_shared unfalsifiable at the schema level.
--
-- WHY: #583 renamed `is_srd` to `is_shared`, which changed what the column
-- MEANS — from a (wrong) claim about provenance to a claim about which table
-- the row lives in. The rename did not audit the code that writes it, and
-- mapOpen5eV2Monster went on deriving the value from
-- `publisher.key = 'wizards-of-the-coast'`. Under the old name that was at
-- least self-consistent; under the new one it is simply false, and the next
-- `npm run seed-library-monsters` would have written `false` to 2,885 of 3,541
-- rows — every Kobold Press and EN Publishing creature.
--
-- That is not a cosmetic wrong flag. `discovered_monsters` and `pinned_forms`
-- branch on `is_shared` to decide whether a monster reference is a text library
-- id or a homebrew uuid, so a false here strands the reference and the Player
-- Bestiary renders "Unknown creature" — the exact #553 failure, reintroduced by
-- a rename rather than by an id remap.
--
-- The code was fixed. This makes the schema refuse to accept the old meaning
-- again, because the next such producer will not be written by whoever
-- remembers this. Every row in this table is shared library content by
-- construction — the table IS the shared library — so `false` is never a value
-- worth storing, and an insert that tries becomes a loud failure inside the
-- seed script instead of 2,885 silently wrong rows.
--
-- The column is already `not null default true`, so this closes the only gap
-- left. If a legitimate need for a non-shared row in this table ever appears,
-- that is a schema decision worth making deliberately: drop this constraint in
-- its own migration and say why.
alter table public.library_monsters
  add constraint library_monsters_is_shared_true check (is_shared);

comment on column public.library_monsters.is_shared is
  'Always true — marks a row as shared library content, not SRD provenance. '
  'Real provenance is source_document_key -> content_sources. Enforced by '
  'library_monsters_is_shared_true (#583).';
