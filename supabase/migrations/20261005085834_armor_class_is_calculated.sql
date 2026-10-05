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
-- Where such a character had armour on, the stored number was never the AC they
-- saw (the sheet showed the armour's), so it is cleared with the formula and no
-- notice compares against it. Without armour on, the sheet fell back to the
-- stored number, which is then exactly the "before" the notice needs.
alter table party_members
  alter column ac drop not null,
  alter column ac drop default;

update party_members pm
   set ac = null
 where pm.ac_formula = 'armor'
   and exists (
     select 1
       from party_inventory pi
       left join items i on i.id = pi.item_id
       left join library_items li on li.id = pi.library_item_id
      where pi.carried_by = pm.id
        and pi.location = 'equipped'
        and not coalesce(pi.is_ruined, false)
        and coalesce(i.item_type, li.item_type) = 'armor'
   );

update party_members set ac_formula = null where ac_formula = 'armor';
