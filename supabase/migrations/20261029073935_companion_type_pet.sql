-- Migration: companion_type_pet
-- Adds the `pet` companion type (#1115). Split from `pets_never_fight` on purpose:
-- Postgres will not let a transaction use an enum label that the same
-- transaction added, and the CLI runs each migration file in one transaction.
--
-- A pet is a small, loved creature that lives with a character and does one
-- small narrative thing (Sothery, Book I, "Pets"). The maintainer's rule (29 Oct
-- 2026): it has fitting stats, like a wizard's familiar, but it ignores combat,
-- and unlike a familiar nobody commands it. The stats are there so a DM can
-- answer "what happens to the tea mouse in the fire" without inventing numbers;
-- they never put the pet in an encounter.

alter type public.companion_type add value if not exists 'pet';
