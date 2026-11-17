-- What a map's picture shows no ground on, kept with the map's memory (#1021, 17 Nov 2026).
--
-- A map that is only a picture with a grid has no walls drawn, so the rules took every square of it for open
-- ground. Seen live: at the AI table the creatures the server moves walked out onto the dark slate a house is drawn
-- on. The browser can read the picture (`src/lib/battlemap/pictureFloor.ts`) and now keeps what it found here, once
-- per map, so the server's own moves respect it too. Cells are "x,y" joined by ";", the same encoding as `seen`.
--
-- It is a guess from a picture and is used only where nothing is drawn: a map with walls, doors or rock of its
-- own never reads it (`fightMapOf`). Null means nobody has read the picture yet.
--
-- No new policy or grant: the column rides on `map_memory`'s own (members read, the DM writes), and the row is
-- upserted by the table's owner, who is the campaign's DM.

alter table public.map_memory
  add column void_cells text;

comment on column public.map_memory.void_cells is
  'Squares the map''s picture shows no ground on ("x,y" joined by ";"), read from the picture by a browser and used as impassable only on a map with no walls, doors or rock drawn. Null until read.';
