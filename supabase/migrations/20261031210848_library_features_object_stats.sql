-- Object stats for the library features that are physical things a party can
-- smash (20261030214202 gave features the columns; 20261030231807 filled the
-- new objects and the three plain chests). The maintainer's point: most
-- features can be broken by brute force, so a DM wants their AC and hit points
-- even when the intended way through is the trigger.
--
-- Not every feature has them, on purpose: Behind the Waterfall, the Illusory
-- Wall, the Mimic (a creature, with its own stat block), the Crawlspace Behind
-- Tapestry, the Loose Flagstone Cache, the Chimney Shaft, the Rubble Choke
-- Crawlway (it has its own clearing rule), the Rising Pillar Bridge, the
-- Hearthstone Stair, the Pivoting Floor Slab and the Draining Fountain Basin
-- have nothing a party would break to get through.
--
-- AC and hit points follow the DMG object table (src/rules/objects.ts), which
-- dungeon_craft_library.test.sql holds every library row to. A secret door is
-- its section of wall: stone, Medium, with the damage threshold of 10 the
-- library's Stone Door has. The break DC is the Strength check to force it
-- without the trigger, on the DMG's typical-DC ladder (an app convention).
-- Each row is updated only while every object field is still empty, so an
-- admin's own numbers are kept.

update public.library_dungeon_features as f
   set object_material = v.material, object_size = v.size, object_ac = v.ac, object_hp = v.hp,
       damage_threshold = v.threshold, break_dc = v.break_dc
  from (values
    ('grimoire_altar_with_hidden_reliquary',   'stone',   'large',  17, 27, null::smallint, 20::smallint),
    ('grimoire_candlestick_lever',             'stone',   'medium', 17, 18, 10,             25),
    ('grimoire_counterweight_portcullis_wall', 'stone',   'large',  17, 27, 10,             25),
    ('grimoire_hollowed_statue',               'stone',   'large',  17, 27, null,           20),
    ('grimoire_keyword_sealed_door',           'stone',   'medium', 17, 18, 10,             25),
    -- Glass, and fragile: one blow breaks it, and the portal with it.
    ('grimoire_mirror_portal',                 'crystal', 'medium', 13, 4,  null,           null),
    -- The narrow door behind the frame.
    ('grimoire_portrait_with_eyeholes',        'wood',    'medium', 15, 18, null,           15),
    ('grimoire_priests_hole',                  'wood',    'medium', 15, 18, null,           15),
    ('grimoire_puzzle_lock_moving_wall',       'stone',   'large',  17, 27, 10,             25),
    -- Its own trigger already slides it with a DC 10 Strength check.
    ('grimoire_recessed_weapon_rack',          'stone',   'medium', 17, 18, null,           10),
    ('grimoire_rotating_bookshelf',            'wood',    'large',  15, 27, null,           20),
    -- Bolted from the inside.
    ('grimoire_sewage_tunnel_access',          'iron',    'medium', 19, 18, null,           20),
    ('grimoire_sliding_stone_panel',           'stone',   'medium', 17, 18, 10,             25),
    ('grimoire_wine_cask_door',                'wood',    'large',  15, 27, null,           15)
  ) as v(id, material, size, ac, hp, threshold, break_dc)
 where f.id = v.id
   and f.object_material is null and f.object_size is null and f.object_ac is null and f.object_hp is null
   and f.damage_threshold is null and f.break_dc is null and f.lock_dc is null;

-- The generator learns the same: fill the stats for anything physical, secret
-- doors included, not only for ordinary objects. replace() touches the line
-- only while it still reads as 20261030214202 wrote it.
update public.ai_system_prompts
   set content = replace(content,
     $o$Leave every object field null when the feature is not a breakable thing (a hidden passage, an alcove, a spoken keyword).$o$,
     $n$Most features are physical and can be broken by brute force even when the trigger is the intended way through: a secret door is a section of stone wall, a bookshelf is wood, a statue is stone, a grate is iron. Fill the object fields for those too. Leave them null only when there is nothing physical to break (an illusion, a curtain of water, an open crawlway, a creature, a spoken keyword).$n$)
 where generator_type = 'feature';
