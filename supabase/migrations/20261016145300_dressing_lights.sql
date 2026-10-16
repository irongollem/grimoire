-- Migration: dressing_lights
-- Dressing props that give light, in the rules' terms (bright and dim feet), so the Cartographer can cast their glow.
--
-- Step one of map lighting (the maintainer, 16 Oct 2026: "We'll want lamps and other light casting elements later anyway
-- as we start playing around with lighting (and light blocking walls) so this could be our step 1"), in the terms of
-- the 5e rules ("ideally sticking to the DND rules concerning bright light"): a prop that emits light carries
-- `light = {"color": "#rrggbb", "bright": <feet>, "dim": <feet>}` with an optional `"intensity"` (0 < i <= 1), bright
-- light in a radius of `bright` feet and dim light for an additional `dim` feet, as the rules give it (a torch 20 and 20,
-- a candle 5 and 5, a hooded lantern 30 and 30; the same in 2014 and 2024). The renderer lays a glow in that colour that
-- holds across the bright radius and fades to nothing through the dim ring. Null is a prop that gives no light. Tile
-- packs carry the same shape per object and decal variant in their manifest (`lights`), outside the database.
--
-- What the rules list no light for gets the nearest listed source: a campfire, brazier, hearth or forge as a torch, a
-- candelabra or a ring of candles as a stronger candle, an iron stove (its fire mostly shut in) and a magma cauldron
-- between, a pool of lava as a torch and a small one as a candle-and-a-half. Glowing fungi, moss and crystals give dim
-- light only (`bright: 0`), which is what bioluminescence does: it shows its surroundings without lighting them up.
--
-- The shape is checked here because the column is written by migrations and read by every map. The check is wrapped
-- in a CASE so the casts only run once the types are known (Postgres does not promise to evaluate an AND left to right)
-- and coalesced so a missing key fails instead of passing as NULL.
--
-- Each colour is the mean of the prop's brightest, most saturated pixels in its own art (art-955
-- publisher-tools/light-colour.mts), except the tripod brazier's blue-white fire and the star altar's starlight, where
-- that reading caught the brass.

alter table public.library_dressing add column light jsonb;

alter table public.library_dressing add constraint library_dressing_light_shape check (
  light is null or coalesce(
    case
      when jsonb_typeof(light) = 'object'
        and jsonb_typeof(light -> 'color') = 'string'
        and jsonb_typeof(light -> 'bright') = 'number'
        and jsonb_typeof(light -> 'dim') = 'number'
        and (not light ? 'intensity' or jsonb_typeof(light -> 'intensity') = 'number')
      then (light ->> 'color') ~ '^#[0-9a-f]{6}$'
        and (light ->> 'bright')::numeric between 0 and 60
        and (light ->> 'dim')::numeric between 0 and 60
        and (light ->> 'bright')::numeric + (light ->> 'dim')::numeric > 0
        and (not light ? 'intensity' or ((light ->> 'intensity')::numeric > 0 and (light ->> 'intensity')::numeric <= 1))
        and (light - 'color' - 'bright' - 'dim' - 'intensity') = '{}'::jsonb
      else false
    end,
    false)
);

update public.library_dressing as d
   set light = l.light
  from (values
    -- Grimoire Dressing
    ('dressing_candelabra',               '{"color": "#ffbf57", "bright": 10, "dim": 10}'::jsonb),
    ('dressing_campfire',                 '{"color": "#ff8424", "bright": 20, "dim": 20}'::jsonb),
    ('dressing_hearth',                   '{"color": "#ff9135", "bright": 20, "dim": 20}'::jsonb),
    ('dressing_forge',                    '{"color": "#ff782f", "bright": 20, "dim": 20}'::jsonb),
    ('dressing_summoning_circle',         '{"color": "#ffd194", "bright": 5, "dim": 5}'::jsonb),
    -- Grimoire Sewers
    ('dressing_sewer_lantern',            '{"color": "#ffb957", "bright": 30, "dim": 30}'::jsonb),
    -- Grimoire Dungeons
    ('dressing_dungeon_floor_candles',    '{"color": "#ffb431", "bright": 10, "dim": 10}'::jsonb),
    ('dressing_dungeon_tool_table',       '{"color": "#ff9f61", "bright": 5, "dim": 10}'::jsonb),
    -- Grimoire Homes
    ('dressing_home_fireplace',           '{"color": "#ff9142", "bright": 20, "dim": 20}'::jsonb),
    -- Grimoire Volcanoes
    ('dressing_volcano_lava_forge',       '{"color": "#ff6f0c", "bright": 20, "dim": 20}'::jsonb),
    ('dressing_volcano_fire_altar',       '{"color": "#ff8307", "bright": 20, "dim": 20}'::jsonb),
    ('dressing_volcano_summoning_circle', '{"color": "#ff8e14", "bright": 10, "dim": 10}'::jsonb),
    ('dressing_volcano_magma_cauldron',   '{"color": "#ff7a05", "bright": 10, "dim": 10}'::jsonb),
    ('dressing_volcano_brazier_tripod',   '{"color": "#a8d8ff", "bright": 20, "dim": 20}'::jsonb),
    ('dressing_volcano_lava_pool',        '{"color": "#ff7303", "bright": 20, "dim": 20}'::jsonb),
    ('dressing_volcano_small_lava_pool',  '{"color": "#ff7303", "bright": 10, "dim": 10}'::jsonb),
    ('dressing_volcano_magma_geyser',     '{"color": "#ff8908", "bright": 15, "dim": 15}'::jsonb),
    ('dressing_volcano_lava_crack',       '{"color": "#ff8109", "bright": 5, "dim": 10}'::jsonb),
    ('dressing_volcano_hanging_cage',     '{"color": "#ff5311", "bright": 0, "dim": 10}'::jsonb),
    ('dressing_volcano_salamander_nest',  '{"color": "#ff7709", "bright": 0, "dim": 10}'::jsonb),
    -- Grimoire Palaces
    ('dressing_palace_sun_altar',         '{"color": "#ffae48", "bright": 20, "dim": 20}'::jsonb),
    ('dressing_palace_star_altar',        '{"color": "#cfe0ff", "bright": 0, "dim": 15}'::jsonb),
    ('dressing_palace_tripod',            '{"color": "#ff8e2f", "bright": 20, "dim": 20}'::jsonb),
    ('dressing_palace_flame_urn',         '{"color": "#ffb23c", "bright": 15, "dim": 15}'::jsonb),
    -- Grimoire Deserts
    ('dressing_desert_map_table',         '{"color": "#ffc578", "bright": 30, "dim": 30}'::jsonb),
    -- Grimoire Glaciers
    ('dressing_glacier_crystals',         '{"color": "#65cbff", "bright": 0, "dim": 15}'::jsonb),
    -- Grimoire Depths
    ('dressing_depths_teal_mushroom',     '{"color": "#33fff1", "bright": 0, "dim": 20}'::jsonb),
    ('dressing_depths_violet_mushroom',   '{"color": "#846aff", "bright": 0, "dim": 20}'::jsonb),
    ('dressing_depths_mushroom_cluster',  '{"color": "#33ffee", "bright": 0, "dim": 10}'::jsonb),
    ('dressing_depths_fungus_garden',     '{"color": "#8fe9ff", "bright": 0, "dim": 15}'::jsonb),
    ('dressing_depths_glowing_moss',      '{"color": "#41ffe5", "bright": 0, "dim": 5}'::jsonb),
    ('dressing_depths_glowing_pool',      '{"color": "#67fff2", "bright": 0, "dim": 15}'::jsonb),
    ('dressing_depths_crystals',          '{"color": "#9670ff", "bright": 0, "dim": 10}'::jsonb),
    ('dressing_depths_fungus_ring',       '{"color": "#a3ccff", "bright": 0, "dim": 10}'::jsonb),
    ('dressing_depths_spider_shrine',     '{"color": "#d49aff", "bright": 5, "dim": 5}'::jsonb),
    ('dressing_depths_stalagmites',       '{"color": "#6efff1", "bright": 0, "dim": 5}'::jsonb),
    ('dressing_depths_mine_cart',         '{"color": "#6ed0ff", "bright": 0, "dim": 5}'::jsonb)
  ) as l(id, light)
 where d.id = l.id;
