-- Monster cutout art (#917).
--
-- A monster gains a second image beside its picture: a cutout, the creature
-- alone on a transparent background. A printed supplement sets creature art
-- straight on the page, and a painted scene or a framed card reads as pasted
-- on; the Scriptorium prefers the cutout in a book and falls back to the
-- picture (per embed: Auto / Cutout / Picture). Every other surface keeps the
-- picture, because cards and detail views crop to fill a frame.
--
-- The column lives on each table that carries monster art today:
--   monsters                       a DM's own monster
--   library_monster_art            a DM's private override of a library monster
--   library_monster_art_canonical  the admin's canonical art for a library monster,
--                                  promoted from the admin's own overrides, so it
--                                  has to be able to hold what an override holds
--
-- library_monsters itself does not get one: its image_url is a denormalised copy
-- that sync_library_monster_art maintains for the player and dashboard reads,
-- and a cutout is only read by the book, which merges the two art tables itself.
--
-- No grant changes: all three tables carry table-level grants, which a new
-- column inherits, and no function or policy changes, so the security-advisor
-- baseline does not move.

alter table public.monsters add column cutout_url text;
alter table public.library_monster_art add column cutout_url text;
alter table public.library_monster_art_canonical add column cutout_url text;

comment on column public.monsters.cutout_url is
  'The creature on a transparent background, preferred in Scriptorium books (#917). image_url stays the picture every other surface shows.';
comment on column public.library_monster_art.cutout_url is
  'A DM''s own cutout for a library monster (#917); wins over the canonical one like image_url does.';
comment on column public.library_monster_art_canonical.cutout_url is
  'The canonical cutout for a library monster (#917), promoted from the admin''s own override.';
