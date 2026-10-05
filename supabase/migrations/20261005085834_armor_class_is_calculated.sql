-- Armour Class is calculated (src/rules/armorClass.ts), never stored (#973, S9).
--
-- party_members.ac becomes "the AC a player saw before calculation": nullable, no
-- default. Nothing writes it any more (new and edited characters leave it null).
-- It is read only by the one-time notice (AcCalculatedNotice), which says "your AC
-- is now worked out from your gear: 11 (was 17)" where the old number differs and
-- then clears it. Drop the column once nobody has a non-null value left.
--
-- ac_formula = 'armor' meant "derive from equipped armour", which is now always
-- the case; the calculation ignores it, so clear it rather than leave a dead value.
alter table party_members
  alter column ac drop not null,
  alter column ac drop default;

update party_members set ac_formula = null where ac_formula = 'armor';
