-- The Drawing keeps its walls as segments (#1125 decision 5, story S5).
--
-- A drawn wall used to live on a floor cell, as the cell's `wallN` (its top edge) or `wallW` (its left edge). Walls are
-- now one layer of segments, `layers.walls`, keyed by id: a wall on a grid line keeps its edge key ("x,y:N",
-- "x,y:W") as its id and gains its two end points, `a` and `b`, in drawing cells; an angled wall (drawn with the new
-- tool, or imported from a Universal VTT file) is keyed by a uuid. Everything the edge carried (type, pack, variant,
-- rotation, decal) stays on the segment. Placed lights get a layer of their own, `layers.lights`, empty for every
-- existing drawing.
--
-- A floor cell that held only walls is left with nothing and is dropped. The live battle map already reads segments
-- (20261031135545), and this move changes nothing a published site shows, so the revision trigger is held off for it:
-- otherwise every published site would read as behind its drawing and ask to be reviewed for no change at all.

alter table public.dungeon_maps disable trigger dungeon_maps_bump_rev;

update public.dungeon_maps map
set layers = (map.layers - 'floor' - 'walls' - 'lights')
  || jsonb_build_object(
    'floor', coalesce((
      select jsonb_object_agg(cell.key, cell.value - 'wallN' - 'wallW')
      from jsonb_each(map.layers -> 'floor') cell
      where (cell.value - 'wallN' - 'wallW') <> '{}'::jsonb), '{}'::jsonb),
    'walls', coalesce(map.layers -> 'walls', '{}'::jsonb) || coalesce((
      select jsonb_object_agg(edge.key, edge.value)
      from (
        select cell.key || ':N' as key,
               (cell.value -> 'wallN') || jsonb_build_object(
                 'a', jsonb_build_array(split_part(cell.key, ',', 1)::numeric, split_part(cell.key, ',', 2)::numeric),
                 'b', jsonb_build_array(split_part(cell.key, ',', 1)::numeric + 1, split_part(cell.key, ',', 2)::numeric)) as value
        from jsonb_each(map.layers -> 'floor') cell
        where jsonb_typeof(cell.value -> 'wallN') = 'object'
        union all
        select cell.key || ':W',
               (cell.value -> 'wallW') || jsonb_build_object(
                 'a', jsonb_build_array(split_part(cell.key, ',', 1)::numeric, split_part(cell.key, ',', 2)::numeric),
                 'b', jsonb_build_array(split_part(cell.key, ',', 1)::numeric, split_part(cell.key, ',', 2)::numeric + 1))
        from jsonb_each(map.layers -> 'floor') cell
        where jsonb_typeof(cell.value -> 'wallW') = 'object'
      ) edge), '{}'::jsonb),
    'lights', coalesce(map.layers -> 'lights', '{}'::jsonb))
where jsonb_typeof(map.layers -> 'floor') = 'object';

alter table public.dungeon_maps enable trigger dungeon_maps_bump_rev;

-- A new drawing starts with every layer, level with the client's `emptyLayers()` (as 20261017013336 set it, plus the
-- two layers this migration adds).
alter table public.dungeon_maps alter column layers set default
  '{"floor": {}, "solidBlock": {}, "terrain": {}, "object": {}, "annotation": {}, "dressing": {}, "area": {}, "walls": {}, "lights": {}}'::jsonb;
