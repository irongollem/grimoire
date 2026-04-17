-- Migration: party_member_identity_extras
-- Adds the small character-creation fields that round out Identity: age,
-- gender (free-form to accommodate non-binary / unique entries), pronouns
-- (e.g. "she/her", "they/them"), and a physical description.
--
-- All four are optional — the player can leave them blank and the sheet
-- hides them. They're additive to the alignment/personality block from
-- the previous identity migration.

alter table party_members
  add column if not exists age                  text,
  add column if not exists gender               text,
  add column if not exists pronouns             text,
  add column if not exists physical_description text,
  -- experience_points also lands in PR #192 (alignment + personality bundle).
  -- Both add it via `if not exists` so whichever migration runs first wins
  -- and the second is a no-op.
  add column if not exists experience_points    int not null default 0;

comment on column party_members.age is
  'Free-form age — could be a number ("47") or descriptive ("ancient", "young adult"). Stored as text so non-numeric ages aren''t lossy.';
