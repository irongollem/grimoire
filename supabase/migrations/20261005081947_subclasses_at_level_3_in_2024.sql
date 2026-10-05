-- system_classes.subclass_level for every 2024 class is wrong in the database.
--
-- By the 2024 Player's Handbook EVERY class chooses its subclass at level 3
-- (Cleric, Warlock, Druid, Wizard and Sorcerer included; the 2014 book is the
-- one where Cleric, Sorcerer and Warlock choose at 1 and Druid and Wizard at 2).
-- The rows currently say 2024 Cleric = 1, Warlock = 1, Druid = 2, Wizard = 2,
-- which makes the creation wizard ask a 2024 Cleric for a domain at level 1 and
-- the level-up wizard ask a 2024 Druid for a circle at level 2.
-- The 2014 rows are correct and are left alone.
update system_classes
   set subclass_level = 3
 where ruleset = '2024'
   and subclass_level <> 3;
