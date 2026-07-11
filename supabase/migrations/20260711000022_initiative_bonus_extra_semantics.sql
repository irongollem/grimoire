-- Migration: initiative_bonus_extra_semantics
-- Redefine party_members.initiative_bonus from "total initiative bonus" to
-- "extra on top of the DEX modifier" (feat/special bonuses like Alert). The
-- creation form used to seed it with the DEX mod and the PDF renderer computed
-- initiative_bonus + dexMod, double-counting; the field now consistently means
-- the extra, and the DEX mod is added wherever initiative is shown/rolled. (#526)
--
-- Convert existing rows so every character's EFFECTIVE initiative is unchanged:
-- new_extra = old_total - dexMod. Rows auto-seeded to the DEX mod become 0; a
-- character with a genuine custom total keeps the same effective value.
-- Uses floor() on numeric (not integer division, which truncates toward zero and
-- would be wrong for odd scores below 10).

update public.party_members
set initiative_bonus = initiative_bonus - floor((dex - 10)::numeric / 2)::int
where initiative_bonus is not null;
