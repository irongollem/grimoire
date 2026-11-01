-- #979: Armour Class is calculated (src/rules/armorClass.ts, de8ca097), and
-- party_members.ac only held the AC a player saw before that, for a one-time
-- notice that cleared it. On 1 Nov 2026, 18 of 36 rows still held a value, 17
-- of them characters untouched for three weeks; the issue set a date rather
-- than waiting for zero, since dropping it only costs dormant characters the
-- notice. The notice goes in the same change.
alter table public.party_members drop column ac;
