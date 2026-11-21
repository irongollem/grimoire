-- Beasts of burden in the library (#1222, decision 9; the maintainer, 20 Nov 2026: "go through the bestiary and
-- mark horses, dogs, axebeak and other common DND Beasts of Burden").
--
-- A way of travelling may take its speed from a companion (a sled pulled by an axe beak goes at the axe beak's
-- 50 ft). What a creature is good for on the road is a fact about the creature, so it is kept on the library
-- row, and a companion made from that creature brings it along: the DM's "Travel" form fills in whether it is
-- ridden or pulls, and the terrains it is at home on (which then slow it not at all), instead of the DM typing it.
--
-- `travel` is null for a creature nobody rides or yokes. Otherwise:
--   ridden   it can be ridden (PHB "Mounts and Vehicles": the camel, donkey or mule, elephant, horses, mastiff,
--            pony, warhorse; the rest by long use at the table: axe beaks in Icewind Dale, griffons and the like);
--   pulls    it can pull a cart, sled or plough;
--   at_home  terrain keys (`rules/travelSpeed.ts`: road, open, difficult, sand, snow) it crosses at full speed.
--            These are ours, not the books' (no book gives a beast a terrain), chosen for what the creature is
--            made for: the camel for sand, the mule and the goat for mountain going, the cold's creatures for
--            snow. A DM changes them per campaign in Campaign Settings, Travel.
-- A flying mount's speed is its fly speed, read from its stat block; nothing about that is stored here.
--
-- Marked by name across every source that has the creature (the 2014 and 2024 SRD, Black Flag, the Menagerie,
-- the Tome of Beasts), so each edition's row says the same thing. A name not in the library simply matches
-- nothing.

alter table public.library_monsters
  add column travel jsonb check (
    travel is null or (
      jsonb_typeof(travel) = 'object'
      and jsonb_typeof(travel -> 'ridden') = 'boolean'
      and jsonb_typeof(travel -> 'pulls') = 'boolean'
      and jsonb_typeof(travel -> 'at_home') = 'array'
    )
  );

comment on column public.library_monsters.travel is
  'What a creature is good for on the road (#1222): {ridden, pulls, at_home: terrain keys}; null for one nobody rides or yokes.';

with marks(name, ridden, pulls, at_home) as (
  values
    -- Horses and their kin (PHB Mounts and Vehicles).
    ('Riding Horse', true, true, '{}'::text[]),
    ('Horse, Riding', true, true, '{}'),
    ('Warhorse', true, false, '{}'),
    ('Horse, War', true, false, '{}'),
    ('Draft Horse', true, true, '{}'),
    ('Horse, Draft', true, true, '{}'),
    ('Pony', true, true, '{}'),
    ('Donkey', true, true, '{difficult}'),
    ('Mule', true, true, '{difficult}'),
    ('Warhorse Skeleton', true, false, '{}'),
    ('War Horse Skeleton', true, false, '{}'),
    ('Skeletal Warhorse', true, false, '{}'),
    -- The desert.
    ('Camel', true, true, '{sand}'),
    ('War Ostrich', true, false, '{sand}'),
    ('Nkosi War Ostrich', true, false, '{sand}'),
    -- Great beasts.
    ('Elephant', true, true, '{}'),
    ('Rhinoceros', false, true, '{}'),
    ('Triceratops', true, true, '{}'),
    -- The cold. A sled team is wolves (the maintainer: "a wolf better represents sled dogs than mastiffs").
    ('Wolf', true, true, '{snow}'),
    ('Dire Wolf', true, true, '{snow}'),
    ('Axe Beak', true, true, '{snow}'),
    ('Mammoth', true, true, '{snow}'),
    ('Peat Mammoth', true, true, '{snow}'),
    ('Giant Elk', true, true, '{snow}'),
    ('Elk, Giant', true, true, '{snow}'),
    ('Polar Bear', false, true, '{snow}'),
    -- Dogs and lesser mounts.
    ('Mastiff', true, true, '{}'),
    ('Giant Goat', true, false, '{difficult}'),
    ('Giant Lizard', true, true, '{}'),
    ('Lizard, Giant', true, true, '{}'),
    -- Flying mounts: they travel at their fly speed, over any ground.
    ('Griffon', true, false, '{}'),
    ('Hippogriff', true, false, '{}'),
    ('Pegasus', true, false, '{}'),
    ('Giant Eagle', true, false, '{}'),
    ('Giant Owl', true, false, '{}'),
    ('Giant Bat', true, false, '{}'),
    ('Roc', true, false, '{}'),
    ('Wyvern', true, false, '{}'),
    ('War Wyvern', true, false, '{}'),
    ('Nightmare', true, false, '{}'),
    ('Fell Nightmare', true, false, '{}')
)
update public.library_monsters m
   set travel = jsonb_build_object('ridden', marks.ridden, 'pulls', marks.pulls, 'at_home', to_jsonb(marks.at_home))
  from marks
 where m.name = marks.name;
