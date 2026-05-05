-- Migration: fighter_battle_master
-- Add superiority_dice resource to Fighter for Battle Master subclass

update system_classes
set resources = resources || jsonb_build_array(
  jsonb_build_object(
    'key', 'superiority_dice',
    'label', 'Superiority Dice',
    'rest', 'short',
    'scaling', 'table',
    'table_values', '[0,0,4,4,4,4,5,5,5,5,5,5,5,5,6,6,6,6,6,6]'::jsonb
  )
)
where class_name = 'Fighter';
