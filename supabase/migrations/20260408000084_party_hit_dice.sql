-- Add hit_dice_remaining to party_members.
-- NULL = untracked (UI treats it as member.level on first render).
alter table party_members
  add column if not exists hit_dice_remaining integer default null;
