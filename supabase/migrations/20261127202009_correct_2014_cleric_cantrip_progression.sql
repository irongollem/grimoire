-- Migration: correct_2014_cleric_cantrip_progression
-- Apply the 2014 Cleric table at levels 4 and 10, where its cantrip count increases.

update public.system_classes
set cantrips_known = array[3,3,3,4,4,4,4,4,4,5,5,5,5,5,5,5,5,5,5,5]
where ruleset = '2014'
  and class_name = 'Cleric';
