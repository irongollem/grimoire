/**
 * The Pulled Sugar Inn: Floss's inn at the west end of the Masters' Lane in the Sugarwell demo campaign, ground
 * floor only. Pure: no database, no browser. Uses only published library tile sets and library dressing, so the
 * same drawing can go into the demo template (which carries no author's own packs).
 *
 * The plan, in cell units (x right, y down). A wall line "N of row r" is the key `"x,r:N"`, a left line
 * "W of column c" is `"c,y:W"`:
 *
 *   Back Yard     x1-3    y3-8     grass, a well, behind the kitchen
 *   Kitchen       x4-12   y3-8     flagstones, behind the bar
 *   Storeroom     x13-14  y3-8     crates, sacks and barrels, off the kitchen
 *   Snug          x15-18  y5-8     a small private back room
 *   Common Room   x4-18   y9-17    bar, hearth, tables, the stairs up
 *   Floss's Parlour x19-24 y10-16  off the common room
 *   Porch         x7-16   y18-20   facing the lane, open on three sides
 */

import {
  cellKey,
  emptyLayers,
  type CellKey,
  type DungeonMapLayers,
} from "@/types/dungeonMap.types";
import {
  groundRegion,
  perimeter,
  rectCells,
  setWall,
  uuidFactory,
  type Rect,
  type TileSet,
} from "./map-layers-kit.ts";

const WOOD: TileSet = { pack_id: "wood-interior", pack_version: 4 };
const STONE: TileSet = { pack_id: "stone-dungeon", pack_version: 4 };
const FOREST: TileSet = { pack_id: "forest", pack_version: 5 };

export const INN_NAME = "The Pulled Sugar Inn";
export const INN_PACK_ID = WOOD.pack_id;
export const INN_DARKNESS = "dim";

const uuid = uuidFactory("1fed");

export const COMMON: Rect = { x0: 4, y0: 9, x1: 18, y1: 17 };
export const KITCHEN: Rect = { x0: 4, y0: 3, x1: 12, y1: 8 };
export const STOREROOM: Rect = { x0: 13, y0: 3, x1: 14, y1: 8 };
export const SNUG: Rect = { x0: 15, y0: 5, x1: 18, y1: 8 };
export const PARLOUR: Rect = { x0: 19, y0: 10, x1: 24, y1: 16 };
export const PORCH: Rect = { x0: 7, y0: 18, x1: 16, y1: 20 };
export const YARD: Rect = { x0: 1, y0: 3, x1: 3, y1: 8 };

/** Room name by the cell an annotation names it from; publish proposes each as a child room. */
export const INN_ROOMS = [
  { name: "The Porch", cell: "11,19" },
  { name: "The Common Room", cell: "11,14" },
  { name: "The Kitchen", cell: "8,5" },
  { name: "Floss's Parlour", cell: "21,13" },
  { name: "The Snug", cell: "18,7" },
  { name: "The Storeroom", cell: "13,6" },
  { name: "The Back Yard", cell: "2,6" },
] as const;

/** Every way through the inn, as the wall edge it sits on and the two rooms it joins. */
export const INN_DOORS = [
  { edge: "11,18:N", between: ["The Porch", "The Common Room"] },
  { edge: "19,13:W", between: ["The Common Room", "Floss's Parlour"] },
  { edge: "6,9:N", between: ["The Common Room", "The Kitchen"] },
  { edge: "16,9:N", between: ["The Common Room", "The Snug"] },
  { edge: "4,5:W", between: ["The Kitchen", "The Back Yard"] },
  { edge: "13,5:W", between: ["The Kitchen", "The Storeroom"] },
] as const;

/** Footprints (w x h cells, unturned) of the library dressing this map uses; the setup checks them against the library. */
export const INN_PROP_FOOTPRINTS = {
  dressing_bar_counter: [3, 1],
  dressing_keg_rack: [2, 1],
  dressing_hearth: [2, 1],
  dressing_kitchen_worktable: [2, 1],
  dressing_cauldron: [1, 1],
  dressing_home_dining_set: [2, 2],
  dressing_bench: [2, 1],
  dressing_chair: [1, 1],
  dressing_rug: [2, 3],
  dressing_home_coat_rack: [1, 1],
  dressing_home_potted_herbs: [1, 1],
  dressing_barrels: [1, 1],
  dressing_sacks: [1, 1],
  dressing_desert_storage_jars: [1, 1],
  dressing_crates: [1, 1],
  dressing_candelabra: [1, 1],
  dressing_sewer_lantern: [1, 1],
  dressing_arcana_reading_nook: [1, 1],
  dressing_home_rocking_chair: [1, 1],
  dressing_bookshelf: [2, 1],
  dressing_home_drawers: [2, 1],
  dressing_cupboard: [1, 1],
  dressing_palace_feast_table: [3, 1],
  dressing_desk: [2, 1],
  dressing_well: [1, 1],
  dressing_forest_ferns: [1, 1],
  dressing_forest_berry_bush: [1, 1],
  dressing_forest_wildflowers: [1, 1],
  dressing_hay_bales: [1, 1],
} as const satisfies Record<string, readonly [number, number]>;
export type InnPropId = keyof typeof INN_PROP_FOOTPRINTS;

const hash4 = (x: number, y: number): number => (x * 7 + y * 13 + x * y) % 4;

export function buildInnLayers(): DungeonMapLayers {
  let layers = emptyLayers();

  // ── Floors ────────────────────────────────────────────────────────────────
  const floors: [string, Rect, TileSet][] = [
    ["Porch", PORCH, WOOD],
    ["Common Room", COMMON, WOOD],
    ["Kitchen", KITCHEN, STONE],
    ["Storeroom", STOREROOM, WOOD],
    ["Snug", SNUG, WOOD],
    ["Parlour", PARLOUR, WOOD],
    ["Back Yard", YARD, FOREST],
  ];
  floors.forEach(([name, rect, pack], i) => {
    layers = groundRegion(layers, uuid(5, i + 1), `${name} floor`, rectCells(rect), { ...pack, variant: 0 }, "floor", hash4);
  });

  // ── Doors first, so the perimeters leave them alone ───────────────────────
  for (const door of INN_DOORS) {
    const [cell, side] = door.edge.split(":");
    const [x, y] = cell.split(",").map(Number);
    setWall(layers, WOOD, x, y, side === "N" ? "N" : "W", "doorClosed");
  }

  // ── Walls: the building's rooms; the porch and the yard are open air ──────
  for (const room of [COMMON, KITCHEN, STOREROOM, SNUG, PARLOUR]) perimeter(layers, WOOD, room);

  // Wall decals in the wood set: 0 shuttered window, 1 candle sconce (gives light), 2 shelf of jars, 3 pots and pans,
  // 4 antlers, 5 shield and swords, 6 cloak pegs, 7 tapestry. Decals sit on north-facing wall pieces.
  const decal = (x: number, y: number, which: number) => {
    if (layers.walls[`${x},${y}:N`]?.type === "wall") setWall(layers, WOOD, x, y, "N", "wall", { decal: which });
  };
  for (const x of [6, 8, 14, 16]) decal(x, 18, 0); // windows either side of the front door
  for (const x of [5, 7, 12]) decal(x, 3, 0); // kitchen windows on the north wall
  decal(14, 3, 0);
  decal(17, 5, 0); // snug window
  decal(8, 3, 3); // pots and pans over the worktable
  decal(10, 3, 2); // shelf of jars
  decal(21, 10, 7); // the parlour tapestry
  decal(23, 10, 1); // a sconce in the parlour
  decal(5, 18, 1);
  decal(17, 18, 1); // sconces in the common room's corners
  decal(14, 9, 4); // antlers over the snug door's side
  decal(12, 9, 5);

  // ── The stairs, drawn as objects (tables are dressing: the wood set's own table draws as a tiny square) ─
  layers.object[cellKey(4, 8)] = { ...WOOD, category: "stairsDown", variant: 0, side: "W" };
  layers.object[cellKey(18, 16)] = { ...WOOD, category: "stairsUp", variant: 0, side: "E" };

  // ── Dressing ──────────────────────────────────────────────────────────────
  let n = 0;
  const prop = (prop_id: InnPropId, x: number, y: number, rotation = 0) => {
    n++;
    layers.dressing[uuid(2, n)] = { prop_id, x, y, rotation, z: n };
  };

  // Common room: an L-shaped bar in the north-west, kegs behind it on the wall, stools on the customer side.
  prop("dressing_keg_rack", 4, 9);
  prop("dressing_barrels", 4, 10);
  prop("dressing_bar_counter", 4, 11);
  prop("dressing_bar_counter", 7, 10, 90);
  for (const [x, y] of [[4, 12], [5, 12], [6, 12], [8, 11], [8, 12]] as const) prop("dressing_chair", x, y);
  // The hearth shares a chimney with the kitchen's: a rug, an armchair and a rocking chair before it.
  prop("dressing_rug", 9, 10);
  prop("dressing_hearth", 9, 9);
  prop("dressing_arcana_reading_nook", 8, 10, 270);
  prop("dressing_home_rocking_chair", 11, 10, 90);
  // A long table down the middle with benches, then round tables.
  prop("dressing_palace_feast_table", 12, 11);
  prop("dressing_bench", 12, 10);
  prop("dressing_bench", 12, 12);
  prop("dressing_chair", 11, 11, 90);
  prop("dressing_chair", 15, 11, 270);
  prop("dressing_home_dining_set", 17, 10);
  prop("dressing_home_dining_set", 15, 14);
  prop("dressing_home_dining_set", 13, 15);
  prop("dressing_home_dining_set", 8, 15);
  prop("dressing_home_dining_set", 5, 14);
  prop("dressing_candelabra", 18, 9);
  prop("dressing_candelabra", 4, 13);
  prop("dressing_home_coat_rack", 12, 17);
  prop("dressing_home_potted_herbs", 9, 17);
  prop("dressing_barrels", 4, 16);
  prop("dressing_barrels", 4, 17);

  // Kitchen
  prop("dressing_kitchen_worktable", 6, 3);
  prop("dressing_kitchen_worktable", 7, 6);
  prop("dressing_hearth", 9, 8, 180);
  prop("dressing_cauldron", 11, 7);
  prop("dressing_barrels", 12, 3);
  prop("dressing_desert_storage_jars", 11, 3);
  prop("dressing_desert_storage_jars", 10, 3);
  prop("dressing_crates", 5, 7);
  prop("dressing_cupboard", 9, 3);

  // The storeroom
  prop("dressing_crates", 13, 3);
  prop("dressing_barrels", 14, 3);
  prop("dressing_sacks", 13, 4);
  prop("dressing_sacks", 14, 4);
  prop("dressing_barrels", 14, 6);
  prop("dressing_sacks", 14, 7);
  prop("dressing_crates", 13, 8);

  // The snug: one proper table, a shelf, a candle
  prop("dressing_home_dining_set", 16, 6);
  prop("dressing_bookshelf", 17, 5);
  prop("dressing_candelabra", 15, 8);
  prop("dressing_home_potted_herbs", 18, 8);

  // Floss's parlour: the music box stands on the desk by the armchair
  prop("dressing_desk", 20, 10);
  prop("dressing_arcana_reading_nook", 20, 11);
  prop("dressing_bookshelf", 22, 10);
  prop("dressing_rug", 21, 12);
  prop("dressing_home_rocking_chair", 23, 12, 270);
  prop("dressing_home_drawers", 24, 14, 90);
  prop("dressing_home_dining_set", 22, 15);
  prop("dressing_candelabra", 19, 11);
  prop("dressing_candelabra", 24, 11);

  // Porch: plants either side of the door, benches along the front edge, lanterns at the ends
  prop("dressing_home_potted_herbs", 10, 18);
  prop("dressing_home_potted_herbs", 12, 18);
  prop("dressing_sewer_lantern", 8, 18);
  prop("dressing_sewer_lantern", 15, 18);
  for (const x of [7, 9, 13, 15]) prop("dressing_bench", x, 20);
  prop("dressing_barrels", 7, 18);

  // Back yard
  prop("dressing_well", 2, 5);
  prop("dressing_forest_ferns", 1, 3);
  prop("dressing_forest_berry_bush", 3, 3);
  prop("dressing_forest_wildflowers", 1, 7);
  prop("dressing_hay_bales", 3, 7);

  // ── Lights: the room glows warm; the hearths and candles light themselves ─
  const light = (x: number, y: number, bright: number, dim: number, flicker: number, color = "#ffb45a") => {
    layers.lights[uuid(3, Object.keys(layers.lights).length + 1)] = { x, y, light: { color, bright, dim, flicker } };
  };
  light(10, 11, 10, 20, 0.3); // before the common room hearth
  light(6, 10, 5, 15, 0.2); // behind the bar
  light(13, 12, 5, 15, 0.2); // over the long table
  light(15, 15, 5, 10, 0.2); // the south tables
  light(10, 5, 10, 15, 0.3, "#ff9a3c"); // the kitchen fire
  light(17, 7, 5, 15, 0.2); // the snug
  light(21, 13, 5, 15, 0.15, "#ffc27a"); // the parlour

  // ── Names ────────────────────────────────────────────────────────────────
  for (const room of INN_ROOMS) layers.annotation[room.cell as CellKey] = { text: room.name };

  return layers;
}
