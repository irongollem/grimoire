-- Migration: species_avg_height_backfill
-- Add avg_height to species. Height resolves at runtime: party_member.height → species.avg_height → size default.

-- 1. Add avg_height to species
alter table species add column if not exists avg_height text;

-- 2. Set known averages by name
update species set avg_height = case name
  when 'Human'       then '5''9"'
  when 'Elf'         then '5''6"'
  when 'Drow'        then '5''4"'
  when 'Half-Elf'    then '5''8"'
  when 'Dwarf'       then '4''6"'
  when 'Halfling'    then '3''1"'
  when 'Gnome'       then '3''6"'
  when 'Goblin'      then '3''6"'
  when 'Half-Orc'    then '6''2"'
  when 'Dragonborn'  then '6''4"'
  when 'Tiefling'    then '5''9"'
  when 'Goliath'     then '7''2"'
  when 'Firbolg'     then '7''3"'
  when 'Catfolk'     then '5''6"'
  when 'Derro'       then '4''0"'
  when 'Doppelganger' then '5''9"'
  -- Gullkin: custom race, left null (falls back to size default below)
  else null
end
where name in (
  'Human','Elf','Drow','Half-Elf','Dwarf','Halfling','Gnome','Goblin',
  'Half-Orc','Dragonborn','Tiefling','Goliath','Firbolg',
  'Catfolk','Derro','Doppelganger'
);

