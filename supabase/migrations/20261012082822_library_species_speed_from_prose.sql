-- Library species read from Open5e in prose lost their speed.
--
-- `parseSpeed` read only the 2024 SRD's terse "30 feet", so every 2014 SRD and
-- Tome of Heroes species, whose Speed trait is prose ("Your base walking speed
-- is 25 feet."), was seeded with `speed` null, and the character builder fell
-- back to 30 ft for dwarves, gnomes and halflings. The same import split
-- languages on the commas inside a parenthetical ("Machine Speech (a
-- whistling") and kept choices as if they were languages ("one of the
-- following: Abyssal"), and dropped the Speed, Size and Languages traits even
-- when their field could not hold the rule ("determined by your Heritage
-- Subrace", "not reduced by wearing heavy armor", a language choice).
--
-- The values below are `buildImportedFields` (src/lib/library/open5eSpeciesImport.ts,
-- fixed in the same commit) run over the live Open5e v2 records. Only these three
-- columns move: a re-seed would also reset art, focal points and heights, which
-- the seed treats as create-only. A kept trait is prepended unless the row
-- already carries a trait of that name, so the migration is idempotent.
--
-- Not repairable from the source: toh_shade is an empty record upstream (no
-- traits at all), and the darakhul heritages and gearforged chassis carry no
-- size or speed in Open5e, so those parents keep size and speed null with the
-- deferring trait on the sheet instead.

update public.library_species s
set
  speed = coalesce(v.speed, s.speed),
  languages = v.languages,
  traits = (
    select coalesce(jsonb_agg(k), '[]'::jsonb)
    from jsonb_array_elements(v.kept) k
    where not exists (
      select 1 from jsonb_array_elements(coalesce(s.traits, '[]'::jsonb)) t
      where lower(t->>'name') = lower(k->>'name')
    )
  ) || coalesce(s.traits, '[]'::jsonb)
from (values
    ('srd-2014', 'srd_dragonborn', '{"walk": 30}'::jsonb, array['Common', 'Draconic']::text[],
     $kept$[]$kept$::jsonb),
    ('srd-2014', 'srd_dwarf', '{"walk": 25}'::jsonb, array['Common', 'Dwarvish']::text[],
     $kept$[{"name": "Speed", "description": "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Your base walking speed is 25 feet. Your speed is not reduced by wearing heavy armor.\"}]}]}"}]$kept$::jsonb),
    ('srd-2014', 'srd_elf', '{"walk": 30}'::jsonb, array['Common', 'Elvish']::text[],
     $kept$[]$kept$::jsonb),
    ('srd-2014', 'srd_gnome', '{"walk": 25}'::jsonb, array['Common', 'Gnomish']::text[],
     $kept$[]$kept$::jsonb),
    ('srd-2014', 'srd_half-elf', '{"walk": 30}'::jsonb, array['Common', 'Elvish']::text[],
     $kept$[{"name": "Languages", "description": "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"You can speak, read, and write Common, Elvish, and one extra language of your choice.\"}]}]}"}]$kept$::jsonb),
    ('srd-2014', 'srd_half-orc', '{"walk": 30}'::jsonb, array['Common', 'Orc']::text[],
     $kept$[]$kept$::jsonb),
    ('srd-2014', 'srd_halfling', '{"walk": 25}'::jsonb, array['Common', 'Halfling']::text[],
     $kept$[]$kept$::jsonb),
    ('srd-2014', 'srd_human', '{"walk": 30}'::jsonb, array['Common']::text[],
     $kept$[{"name": "Languages", "description": "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"You can speak, read, and write Common and one extra language of your choice. Humans typically learn the languages of other peoples they deal with, including obscure dialects. They are fond of sprinkling their speech with words borrowed from other tongues: Orc curses, Elvish musical expressions, Dwarvish military phrases, and so on.\"}]}]}"}]$kept$::jsonb),
    ('srd-2014', 'srd_tiefling', '{"walk": 30}'::jsonb, array['Common', 'Infernal']::text[],
     $kept$[]$kept$::jsonb),
    ('toh', 'toh_alseid', '{"walk": 40}'::jsonb, array['Common', 'Elvish']::text[],
     $kept$[]$kept$::jsonb),
    ('toh', 'toh_catfolk', '{"walk": 30}'::jsonb, array['Common']::text[],
     $kept$[]$kept$::jsonb),
    ('toh', 'toh_darakhul', null, array['Common', 'Darakhul']::text[],
     $kept$[{"name": "Speed", "description": "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Your base walking speed is determined by your Heritage Subrace.\"}]}]}"}, {"name": "Size", "description": "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Your size is determined by your Heritage Subrace.\"}]}]}"}, {"name": "Languages", "description": "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"You can speak, read, and write Common, Darakhul, and a language associated with your Heritage Subrace.\"}]}]}"}]$kept$::jsonb),
    ('toh', 'toh_derro', '{"walk": 30}'::jsonb, array['Dwarvish']::text[],
     $kept$[{"name": "Speed", "description": "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Derro are fast for their size. Your base walking speed is 30 feet.\"}]}]}"}, {"name": "Languages", "description": "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"You can speak, read, and write Dwarvish and your choice of Common or Undercommon.\"}]}]}"}]$kept$::jsonb),
    ('toh', 'toh_drow', '{"walk": 30}'::jsonb, array['Elvish']::text[],
     $kept$[{"name": "Languages", "description": "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"You can speak, read, and write Elvish and your choice of Common or Undercommon.\"}]}]}"}]$kept$::jsonb),
    ('toh', 'toh_erina', '{"burrow": 20, "walk": 25}'::jsonb, array['Erina']::text[],
     $kept$[{"name": "Languages", "description": "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"You can speak Erina and either Common or Sylvan.\"}]}]}"}]$kept$::jsonb),
    ('toh', 'toh_gearforged', null, array['Common', 'Machine Speech']::text[],
     $kept$[{"name": "Speed", "description": "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Your base walking speed is determined by your Race Chassis.\"}]}]}"}, {"name": "Size", "description": "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Your size is determined by your Race Chassis.\"}]}]}"}, {"name": "Languages", "description": "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"You can speak, read, and write Common, Machine Speech (a whistling, clicking language that's incomprehensible to non-gearforged), and a language associated with your Race Chassis.\"}]}]}"}]$kept$::jsonb),
    ('toh', 'toh_minotaur', '{"walk": 30}'::jsonb, array['Common', 'Minotaur']::text[],
     $kept$[]$kept$::jsonb),
    ('toh', 'toh_mushroomfolk', '{"walk": 30}'::jsonb, array['Mushroomfolk']::text[],
     $kept$[{"name": "Size", "description": "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"A mushroomfolk's size is determined by its subrace.\"}]}]}"}, {"name": "Languages", "description": "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"You can speak, read, and write Mushroomfolk and your choice of Common or Undercommon.\"}]}]}"}]$kept$::jsonb),
    ('toh', 'toh_satarre', '{"walk": 30}'::jsonb, array['Common']::text[],
     $kept$[{"name": "Languages", "description": "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"You can speak, read, and write Common and one of the following: Abyssal, Infernal, or Void Speech. Void Speech is a language of dark gods and ancient blasphemies, and the mere sound of its sibilant tones makes many other creatures quite uncomfortable.\"}]}]}"}]$kept$::jsonb),
    ('srd-2024', 'srd-2024_human', '{"walk": 30}'::jsonb, array[]::text[],
     $kept$[{"name": "Size", "description": "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Medium (about 4–7 feet tall) or Small (about 2–4 feet tall), chosen when you select this species\"}]}]}"}]$kept$::jsonb),
    ('srd-2024', 'srd-2024_tiefling', '{"walk": 30}'::jsonb, array[]::text[],
     $kept$[{"name": "Size", "description": "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\",\"content\":[{\"type\":\"text\",\"text\":\"Medium (about 4–7 feet tall) or Small (about 3–4 feet tall), chosen when you select this species\"}]}]}"}]$kept$::jsonb)
) as v(document_key, record_key, speed, languages, kept)
where s.source_document_key = v.document_key
  and s.source_record_key = v.record_key;
