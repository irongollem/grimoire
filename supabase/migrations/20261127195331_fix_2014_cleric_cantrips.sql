-- Migration: fix_2014_cleric_cantrips
-- Correct the 2014 cleric cantrip progression: 3 through level 3, then 4.

update public.system_classes
set cantrips_known = array[3,3,3,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4]
where ruleset = '2014'
  and class_name = 'Cleric';
