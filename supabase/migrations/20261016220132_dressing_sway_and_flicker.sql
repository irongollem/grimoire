-- Migration: dressing_sway_and_flicker
-- Dressing that moves in the battle map's live layer (#1073, story 7): plants that sway, fires that flicker, glows that
-- pulse.
--
-- The maintainer, 16 Oct 2026: "in the live layer we also expect swaying trees, moving flames, swaying mushrooms". Three
-- kinds of motion, all drawn by the live layer during play and never baked into the published picture:
--
-- 1. `sway` (new column): a prop that sways is drawn live, turned back and forth about its centre by up to `amount`
--    degrees at `speed` radians a second (each placement offset in time, so a forest does not move in lockstep), and
--    the Cartographer leaves it out of the published standing layer so no still copy shows under the moving one.
-- 2. `light.flicker` (0 < f <= 1): fire. The glow brightens and dims fast and irregularly by up to that fraction.
-- 3. `light.pulse` (0 < p <= 1): bioluminescence and magic. The glow breathes slowly by up to that fraction.
--
-- A light has at most one of flicker and pulse. The light shape check (20261016195840_dressing_lights) is rebuilt to
-- admit the two keys, with the same CASE-and-coalesce construction so a missing or mistyped key fails rather than
-- passing as NULL.

alter table public.library_dressing drop constraint library_dressing_light_shape;
alter table public.library_dressing add constraint library_dressing_light_shape check (
  light is null or coalesce(
    case
      when jsonb_typeof(light) = 'object'
        and jsonb_typeof(light -> 'color') = 'string'
        and jsonb_typeof(light -> 'bright') = 'number'
        and jsonb_typeof(light -> 'dim') = 'number'
        and (not light ? 'intensity' or jsonb_typeof(light -> 'intensity') = 'number')
        and (not light ? 'flicker' or jsonb_typeof(light -> 'flicker') = 'number')
        and (not light ? 'pulse' or jsonb_typeof(light -> 'pulse') = 'number')
      then (light ->> 'color') ~ '^#[0-9a-f]{6}$'
        and (light ->> 'bright')::numeric between 0 and 60
        and (light ->> 'dim')::numeric between 0 and 60
        and (light ->> 'bright')::numeric + (light ->> 'dim')::numeric > 0
        and (not light ? 'intensity' or ((light ->> 'intensity')::numeric > 0 and (light ->> 'intensity')::numeric <= 1))
        and (not light ? 'flicker' or ((light ->> 'flicker')::numeric > 0 and (light ->> 'flicker')::numeric <= 1))
        and (not light ? 'pulse' or ((light ->> 'pulse')::numeric > 0 and (light ->> 'pulse')::numeric <= 1))
        and not (light ? 'flicker' and light ? 'pulse')
        and (light - 'color' - 'bright' - 'dim' - 'intensity' - 'flicker' - 'pulse') = '{}'::jsonb
      else false
    end,
    false)
);

alter table public.library_dressing add column sway jsonb;
alter table public.library_dressing add constraint library_dressing_sway_shape check (
  sway is null or coalesce(
    case
      when jsonb_typeof(sway) = 'object'
        and jsonb_typeof(sway -> 'amount') = 'number'
        and jsonb_typeof(sway -> 'speed') = 'number'
      then (sway ->> 'amount')::numeric > 0 and (sway ->> 'amount')::numeric <= 8
        and (sway ->> 'speed')::numeric > 0 and (sway ->> 'speed')::numeric <= 4
        and (sway - 'amount' - 'speed') = '{}'::jsonb
      else false
    end,
    false)
);

-- Fires, candles and lanterns flicker.
update public.library_dressing as d set light = d.light || jsonb_build_object('flicker', l.f)
  from (values
    ('dressing_campfire', 0.5),
    ('dressing_candelabra', 0.35),
    ('dressing_forge', 0.3),
    ('dressing_hearth', 0.4),
    ('dressing_home_fireplace', 0.4),
    ('dressing_palace_flame_urn', 0.35),
    ('dressing_palace_tripod', 0.4),
    ('dressing_palace_sun_altar', 0.3),
    ('dressing_sewer_lantern', 0.2),
    ('dressing_dungeon_floor_candles', 0.35),
    ('dressing_dungeon_tool_table', 0.25),
    ('dressing_temple_black_candles', 0.35),
    ('dressing_temple_green_brazier', 0.45),
    ('dressing_temple_lectern', 0.3),
    ('dressing_temple_ritual_circle', 0.35),
    ('dressing_desert_map_table', 0.2),
    ('dressing_arcana_lectern', 0.3),
    ('dressing_arcana_library_table', 0.3),
    ('dressing_arcana_reading_nook', 0.3),
    ('dressing_arcana_star_chart_table', 0.3),
    ('dressing_sea_fishing_boat', 0.2),
    ('dressing_sea_ship_stern', 0.2),
    ('dressing_sea_lighthouse', 0.15),
    ('dressing_volcano_brazier_tripod', 0.4),
    ('dressing_volcano_fire_altar', 0.4),
    ('dressing_volcano_lava_forge', 0.3),
    ('dressing_volcano_magma_geyser', 0.5),
    ('dressing_volcano_hanging_cage', 0.3),
    ('dressing_depths_spider_shrine', 0.3),
    ('dressing_summoning_circle', 0.25)
  ) as l(id, f)
 where d.id = l.id and d.light is not null;

-- Glowing fungi, crystals, pools, lava and magic pulse.
update public.library_dressing as d set light = d.light || jsonb_build_object('pulse', l.p)
  from (values
    ('dressing_depths_teal_mushroom', 0.35),
    ('dressing_depths_violet_mushroom', 0.35),
    ('dressing_depths_mushroom_cluster', 0.35),
    ('dressing_depths_fungus_garden', 0.25),
    ('dressing_depths_fungus_ring', 0.3),
    ('dressing_depths_glowing_moss', 0.3),
    ('dressing_depths_glowing_pool', 0.3),
    ('dressing_depths_crystals', 0.3),
    ('dressing_depths_stalagmites', 0.2),
    ('dressing_depths_mine_cart', 0.2),
    ('dressing_glacier_crystals', 0.25),
    ('dressing_arcana_enchanting_table', 0.3),
    ('dressing_arcana_floating_tome', 0.35),
    ('dressing_arcana_floating_steps', 0.3),
    ('dressing_arcana_magic_mirror', 0.3),
    ('dressing_arcana_teleport_circle', 0.3),
    ('dressing_arcana_planetarium', 0.15),
    ('dressing_temple_scrying_pool', 0.3),
    ('dressing_temple_sigil_obelisk', 0.3),
    ('dressing_palace_star_altar', 0.25),
    ('dressing_volcano_lava_pool', 0.2),
    ('dressing_volcano_small_lava_pool', 0.2),
    ('dressing_volcano_lava_crack', 0.25),
    ('dressing_volcano_magma_cauldron', 0.25),
    ('dressing_volcano_salamander_nest', 0.3),
    ('dressing_volcano_summoning_circle', 0.3)
  ) as l(id, p)
 where d.id = l.id and d.light is not null;

-- Trees, bushes, reeds, palms, mushrooms and kelp sway.
update public.library_dressing as d set sway = s.sway
  from (values
    ('dressing_forest_great_oak', '{"amount": 1.5, "speed": 0.6}'::jsonb),
    ('dressing_forest_oak', '{"amount": 2, "speed": 0.7}'::jsonb),
    ('dressing_forest_pine', '{"amount": 2, "speed": 0.8}'::jsonb),
    ('dressing_forest_dead_tree', '{"amount": 0.8, "speed": 0.6}'::jsonb),
    ('dressing_forest_birch', '{"amount": 2.5, "speed": 0.9}'::jsonb),
    ('dressing_forest_sapling', '{"amount": 3, "speed": 1.1}'::jsonb),
    ('dressing_forest_berry_bush', '{"amount": 2, "speed": 1.0}'::jsonb),
    ('dressing_forest_thorn_bush', '{"amount": 1.5, "speed": 0.9}'::jsonb),
    ('dressing_forest_ferns', '{"amount": 3, "speed": 1.2}'::jsonb),
    ('dressing_forest_reeds', '{"amount": 4, "speed": 1.4}'::jsonb),
    ('dressing_forest_wildflowers', '{"amount": 3, "speed": 1.3}'::jsonb),
    ('dressing_depths_teal_mushroom', '{"amount": 1.2, "speed": 0.5}'::jsonb),
    ('dressing_depths_violet_mushroom', '{"amount": 1.2, "speed": 0.5}'::jsonb),
    ('dressing_depths_mushroom_cluster', '{"amount": 2, "speed": 0.7}'::jsonb),
    ('dressing_depths_fungus_garden', '{"amount": 1, "speed": 0.6}'::jsonb),
    ('dressing_desert_date_palm', '{"amount": 2, "speed": 0.7}'::jsonb),
    ('dressing_desert_young_palm', '{"amount": 3, "speed": 1.0}'::jsonb),
    ('dressing_desert_papyrus', '{"amount": 4, "speed": 1.3}'::jsonb),
    ('dressing_sea_kelp', '{"amount": 3, "speed": 0.6}'::jsonb),
    ('dressing_volcano_charred_tree', '{"amount": 0.6, "speed": 0.5}'::jsonb),
    ('dressing_home_potted_herbs', '{"amount": 1.5, "speed": 0.9}'::jsonb)
  ) as s(id, sway)
 where d.id = s.id;
