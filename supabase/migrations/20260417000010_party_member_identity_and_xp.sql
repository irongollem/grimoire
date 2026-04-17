-- Migration: party_member_identity_and_xp
-- Adds the character-creation fields every D&D character needs but that
-- have been living in free-text notes or nowhere at all. Alignment +
-- personality traits / ideals / bonds / flaws are the four structured
-- roleplay blocks from the PHB; deity is needed for Clerics/Paladins;
-- experience_points underpins the optional XP-based levelling mode.

alter table party_members
  add column if not exists alignment           text,
  add column if not exists personality_traits  text,
  add column if not exists ideals              text,
  add column if not exists bonds               text,
  add column if not exists flaws               text,
  add column if not exists deity               text,
  add column if not exists experience_points   int not null default 0;

comment on column party_members.alignment is
  'Alignment string (e.g. "Chaotic Good") or free-form. Null for unaligned / not yet chosen.';
comment on column party_members.experience_points is
  'Total XP earned. Ignored when the campaign uses milestone levelling. Never decreases.';
