-- Migration: library_art_focal_point_checked
-- Records when a person confirmed a library picture's focal point (#965).
--
-- On 4 Oct 2026 every library picture without a focal point got one from a
-- vision model (#955). Most are right, none were looked at. The admin focal
-- point queue lists the unchecked ones; accepting or re-setting a point stamps
-- this column on every canonical row showing that picture. NULL means "not yet
-- checked by a person": a guess, or a point set before this column existed.
--
-- One column on each canonical art table rather than a flag inside the focal
-- point jsonb, so "unchecked" is an indexable filter and a later re-guess can
-- never silently mark itself as checked. Existing RLS covers it: the three
-- tables are admin-write already.

alter table public.library_monster_art_canonical add column focal_point_checked_at timestamptz;
alter table public.library_spell_art_canonical add column focal_point_checked_at timestamptz;
alter table public.library_art_defaults add column focal_point_checked_at timestamptz;
