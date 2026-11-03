/**
 * The showcase Drawing: one Cartographer map that uses everything the Map Table
 * can play (epic #1125), so the DM fixture has a site to look at that is not a
 * hand-painted corner of something else. Pure: no database, no browser. The
 * layers come out in the CURRENT shape (`src/types/dungeonMap.types.ts`: walls
 * as segments keyed by edge key or uuid, a brushed room, lights, dressing).
 *
 * The plan, in cell units (x right, y down). A wall line "N of row r" is the key
 * `"x,r:N"`, a left line "W of column c" is `"c,y:W"`:
 *
 *   Overgrown Courtyard  x3-12  y3-9    forest floor, trees, a campfire
 *   Entry Hall           x3-12  y10-15  chest, barrels, torches, an invisible stub
 *   Hidden Vault         x4-8   y16-19  behind a secret door
 *   Flooded Nave         x13-23 y8-17   a river that flows, a chamfered corner (angled walls)
 *   Sealed Crypt         x14-18 y18-22  behind a locked door
 *   Drowned Cistern      x19-23 y18-22  seen through a grate, all water
 *   Vestibule            x24-27 y11-13
 *   Round Chapel         disc, centre (32.5, 12.5), radius 4.5: a smooth wall run made by the round brush, a placed light
 */

import { applyBrushStroke, cellBoundary, putGroundRegion } from "@/cartographer/groundRegions";
import { latticeWall } from "@/cartographer/wallGraph";
import type { CanonicalSide } from "@/cartographer/edges";
import type { EdgeSegType, WallEdge } from "@/types/dungeonMap.types";
import {
  cellKey,
  emptyLayers,
  type CellKey,
  type DungeonMapLayers,
  type GroundRegion,
  type PackRef,
} from "@/types/dungeonMap.types";
import type { ObjectCategory } from "@/cartographer/packSchema";

/** The tile sets the fixture's library already publishes (`library_tile_packs`, status published). */
const STONE = { pack_id: "stone-dungeon", pack_version: 4 } as const;
const FOREST = { pack_id: "forest", pack_version: 5 } as const;
/** Its `terrainWater` carries the drifting foam overlays that make water move on the battle map. */
const WATER = { pack_id: "water", pack_version: 4 } as const;

export const SHOWCASE_NAME = "Showcase: the Drowned Shrine";
export const SHOWCASE_PACK_ID = STONE.pack_id;
export const SHOWCASE_DARKNESS = "dim";

interface TileSet {
  pack_id: string;
  pack_version: number;
}

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Room name by the cell an annotation names it from; publish proposes each as a child room. */
export const SHOWCASE_ROOMS = [
  { name: "Overgrown Courtyard", cell: "7,5" },
  { name: "Entry Hall", cell: "7,12" },
  { name: "Hidden Vault", cell: "6,17" },
  { name: "Flooded Nave", cell: "17,10" },
  { name: "Sealed Crypt", cell: "16,20" },
  { name: "Drowned Cistern", cell: "21,20" },
  { name: "Vestibule", cell: "25,12" },
  { name: "Round Chapel", cell: "32,12" },
] as const;

/** Ways out the plan must derive, by the room names on each side (edge key -> [from, to] in either order). */
export const SHOWCASE_DOORS = {
  arch: { courtyardToHall: "7,10:N", vestibuleToChapel: "28,12:W" },
  closed: { hallToNave: "13,12:W", naveToVestibule: "24,12:W" },
  locked: "16,18:N",
  secret: "6,16:N",
  grate: "21,18:N",
} as const;

/** The river through the nave: difficult terrain for the Plan's zone, and the cells that carry flowing water. */
export const SHOWCASE_RIVER: readonly CellKey[] = (() => {
  const cells: CellKey[] = [];
  for (let x = 14; x <= 22; x++)
    for (const y of [13, 14]) cells.push(cellKey(x, y));
  return cells;
})();

const FLOOR_VARIANTS = 4;
const hash = (x: number, y: number): number =>
  (x * 7 + y * 13 + x * y) % FLOOR_VARIANTS;

/** A uuid-shaped key for things the layers key by uuid. Fixed, so a re-run writes the same map. */
function uuid(kind: number, n: number): string {
  const pad = (v: number, len: number) => v.toString(16).padStart(len, "0");
  return `5a0c${pad(kind, 4)}-0000-4000-8000-${pad(n, 12)}`;
}

/** Ground the way the editor stores it: one material region per surface, its tile variants kept per square.
 *  Fixed ids keep a re-run writing the same map; `putGroundRegion` projects the region onto floor/terrain. */
function groundRegion(
  layers: DungeonMapLayers,
  id: string,
  name: string,
  cells: ReadonlySet<CellKey>,
  material: PackRef,
  category: GroundRegion["category"],
  variantOf: (x: number, y: number) => number,
): DungeonMapLayers {
  const variants: GroundRegion["variants"] = {};
  for (const k of cells) {
    const [x, y] = k.split(",").map(Number);
    variants[k] = variantOf(x, y);
  }
  const z = Math.max(-1, ...Object.values(layers.ground).map((r) => r.z)) + 1;
  return putGroundRegion(layers, id, {
    name,
    material,
    category,
    z,
    boundary: cellBoundary(cells, material),
    variants,
    walls: { mode: "none", material, ids: [], segments: {}, excluded: [] },
  });
}

function rectCells(r: Rect, skip: ReadonlySet<string> = new Set()): Set<CellKey> {
  const cells = new Set<CellKey>();
  for (let y = r.y0; y <= r.y1; y++)
    for (let x = r.x0; x <= r.x1; x++)
      if (!skip.has(`${x},${y}`)) cells.add(cellKey(x, y));
  return cells;
}

function setWall(
  layers: DungeonMapLayers,
  x: number,
  y: number,
  side: CanonicalSide,
  type: EdgeSegType,
  extra: { decal?: number; visible?: boolean } = {},
): void {
  const key = `${x},${y}:${side}`;
  layers.walls[key] = latticeWall(
    x,
    y,
    side,
    {
      ...STONE,
      type,
      variant: 0,
      ...(extra.decal !== undefined ? { decal: extra.decal } : {}),
    },
    extra.visible,
  );
}

/** Walls round a rectangle of rooms. Existing doors are left alone so order of calls does not matter. */
function perimeter(
  layers: DungeonMapLayers,
  r: Rect,
  skip: (key: string) => boolean = () => false,
): void {
  const put = (x: number, y: number, side: CanonicalSide) => {
    const key = `${x},${y}:${side}`;
    if (skip(key) || layers.walls[key]) return;
    setWall(layers, x, y, side, "wall");
  };
  for (let x = r.x0; x <= r.x1; x++) {
    put(x, r.y0, "N");
    put(x, r.y1 + 1, "N");
  }
  for (let y = r.y0; y <= r.y1; y++) {
    put(r.x0, y, "W");
    put(r.x1 + 1, y, "W");
  }
}

function object(
  layers: DungeonMapLayers,
  x: number,
  y: number,
  category: ObjectCategory | "rubble",
  variant: number,
  pack: TileSet = STONE,
): void {
  layers.object[cellKey(x, y)] = { ...pack, category, variant };
}

export function buildShowcaseLayers(): DungeonMapLayers {
  let layers = emptyLayers();

  // ── Floors ────────────────────────────────────────────────────────────────
  const courtyard: Rect = { x0: 3, y0: 3, x1: 12, y1: 9 };
  const hall: Rect = { x0: 3, y0: 10, x1: 12, y1: 15 };
  const vault: Rect = { x0: 4, y0: 16, x1: 8, y1: 19 };
  const nave: Rect = { x0: 13, y0: 8, x1: 23, y1: 17 };
  const crypt: Rect = { x0: 14, y0: 18, x1: 18, y1: 22 };
  const cistern: Rect = { x0: 19, y0: 18, x1: 23, y1: 22 };
  const vestibule: Rect = { x0: 24, y0: 11, x1: 27, y1: 13 };

  // The nave's north-east corner is cut off by an angled wall (the line y = x - 13). A square whose middle is not
  // inside the line has no floor of its own, as the editor would leave it; the floor is drawn clipped to the wall, so
  // the half of such a square under the wall still shows floor, borrowed from the room next to it.
  const naveCut = new Set(["21,8", "22,8", "23,8", "22,9", "23,9", "23,10"]);
  const rooms: [string, Rect, TileSet, ReadonlySet<string>?][] = [
    ["Overgrown Courtyard", courtyard, FOREST],
    ["Entry Hall", hall, STONE],
    ["Hidden Vault", vault, STONE],
    ["Flooded Nave", nave, STONE, naveCut],
    ["Sealed Crypt", crypt, STONE],
    ["Drowned Cistern", cistern, STONE],
    ["Vestibule", vestibule, STONE],
  ];
  rooms.forEach(([name, rect, pack, skip], i) => {
    layers = groundRegion(layers, uuid(5, i + 1), `${name} floor`, rectCells(rect, skip), { ...pack, variant: 0 }, "floor", hash);
  });

  // The round chapel: one round-brush disc on empty ground with Walls: Visible, which makes a region with its own
  // smooth wall run the Select tool can pick (a few nodes with smooth ends, not a ring of straight pieces). Ids are fixed so a re-run writes the same map.
  let chapelWalls = 0;
  layers = applyBrushStroke(
    layers,
    { discs: [{ x: 32.5, y: 12.5, r: 4.5 }] },
    {
      erase: false,
      walls: "visible",
      pack: { ...STONE, variant: 1 },
      wall: { ...STONE, variant: 0 },
      newKey: () => uuid(4, ++chapelWalls),
    },
  );

  // ── Walls ─────────────────────────────────────────────────────────────────
  for (const r of [courtyard, hall, vault, crypt, cistern, vestibule])
    perimeter(layers, r);
  // The nave minus its chamfered corner: no north wall past x20, no east wall above the vestibule.
  perimeter(layers, nave, (key) => {
    const [cell, side] = key.split(":");
    const [x, y] = cell.split(",").map(Number);
    if (side === "N" && y === 8) return x >= 21;
    if (side === "W" && x === 24) return y <= 10;
    return false;
  });

  // The angled run: three segments of one diagonal, uuid-keyed, from the north wall's end to the vestibule corner.
  const diagonal: [number, number][] = [
    [21, 8],
    [22, 9],
    [23, 10],
    [24, 11],
  ];
  for (let i = 0; i < diagonal.length - 1; i++) {
    const wall: WallEdge = {
      ...STONE,
      type: "wall",
      variant: 0,
      a: diagonal[i],
      b: diagonal[i + 1],
    };
    layers.walls[uuid(1, i + 1)] = wall;
  }

  // Doors. Closed doors and arches cut the flood fill like a wall, so each pair of rooms stays two spaces
  // and publishes a way between them; a grate cuts it too and is never a way.
  setWall(layers, 7, 10, "N", "doorOpen"); // courtyard <-> hall: an arch
  setWall(layers, 13, 12, "W", "doorClosed"); // hall <-> nave
  setWall(layers, 6, 16, "N", "doorClosed"); // hall <-> vault (the plan marks it secret)
  setWall(layers, 16, 18, "N", "doorClosed"); // nave <-> crypt (the plan marks it locked)
  setWall(layers, 24, 12, "W", "doorClosed"); // nave <-> vestibule
  setWall(layers, 28, 12, "W", "doorOpen"); // vestibule <-> chapel: an arch
  setWall(layers, 21, 18, "N", "grate"); // nave -> cistern, bars only

  // Torches: wall decal 0 is a flickering torch in the stone set.
  for (const [x, y] of [
    [4, 16],
    [10, 16],
    [15, 8],
    [18, 8],
    [25, 11],
    [16, 23],
  ] as const) {
    if (layers.walls[`${x},${y}:N`]?.type === "wall")
      setWall(layers, x, y, "N", "wall", { decal: 0 });
  }
  // An invisible stub off the hall's north wall: blocks sight and light, leaves no mark on the picture.
  setWall(layers, 8, 10, "W", "wall", { visible: false });
  setWall(layers, 8, 11, "W", "wall", { visible: false });

  // ── Water: the nave's river, the cistern, a pool ──────────────────────────
  const waterVariant = (x: number, y: number) => (x * 5 + y * 3) % 4;
  const pool = new Set<CellKey>();
  for (let y = 15; y <= 16; y++) for (let x = 18; x <= 20; x++) pool.add(cellKey(x, y));
  layers = groundRegion(layers, uuid(5, 20), "Nave river", new Set(SHOWCASE_RIVER), { ...WATER, variant: 0 }, "terrainWater", waterVariant);
  layers = groundRegion(layers, uuid(5, 21), "Nave pool", pool, { ...WATER, variant: 0 }, "terrainWater", waterVariant);
  layers = groundRegion(layers, uuid(5, 22), "Cistern water", rectCells(cistern), { ...WATER, variant: 0 }, "terrainWater", waterVariant);

  // ── Object stamps ─────────────────────────────────────────────────────────
  object(layers, 11, 11, "objectChest", 0);
  object(layers, 4, 11, "objectBarrel", 0);
  object(layers, 4, 12, "objectBarrel", 0);
  object(layers, 9, 14, "rubble", 1);
  object(layers, 5, 17, "objectChest", 0);
  object(layers, 8, 17, "objectBarrel", 0);
  object(layers, 4, 19, "rubble", 2);
  for (const [x, y] of [
    [14, 9],
    [20, 9],
  ] as const)
    object(layers, x, y, "objectBrazier", 0);
  object(layers, 17, 9, "objectStatue", 0);
  for (const [x, y] of [
    [16, 11],
    [20, 11],
    [16, 16],
    [22, 16],
  ] as const)
    object(layers, x, y, "objectPillar", 0);
  object(layers, 14, 17, "rubble", 0);
  object(layers, 16, 20, "objectStatue", 0);
  object(layers, 18, 21, "objectChest", 0);
  object(layers, 26, 13, "objectStatue", 0);
  // Trees that sway: the forest set's pillar variants are old trees with a declared sway.
  object(layers, 8, 4, "objectPillar", 0, FOREST);
  object(layers, 5, 8, "objectPillar", 1, FOREST);
  object(layers, 12, 8, "objectPillar", 2, FOREST);

  // ── Dressing: props from the library, some swaying, some giving light ─────
  let n = 0;
  const prop = (prop_id: string, x: number, y: number, rotation = 0) => {
    n++;
    layers.dressing[uuid(2, n)] = { prop_id, x, y, rotation, z: n };
  };
  prop("dressing_forest_great_oak", 4, 4);
  prop("dressing_forest_oak", 10, 4);
  prop("dressing_forest_pine", 10, 6, 20);
  prop("dressing_forest_birch", 6, 8);
  prop("dressing_forest_berry_bush", 12, 5);
  prop("dressing_forest_ferns", 9, 8);
  prop("dressing_forest_wildflowers", 8, 6);
  prop("dressing_forest_wildflowers", 11, 9);
  prop("dressing_campfire", 7, 6);
  prop("dressing_forest_reeds", 14, 12);
  prop("dressing_forest_reeds", 22, 12);
  prop("dressing_desert_papyrus", 14, 15);
  prop("dressing_sea_kelp", 18, 13);
  prop("dressing_candelabra", 7, 18);
  prop("dressing_temple_ritual_circle", 31, 11);
  prop("dressing_temple_green_brazier", 30, 15);
  prop("dressing_temple_green_brazier", 34, 15);
  prop("dressing_candelabra", 30, 10);
  prop("dressing_candelabra", 34, 10);

  // ── A light the DM placed by hand: a cold glow over the chapel ────────────
  layers.lights[uuid(3, 1)] = {
    x: 32.5,
    y: 12.5,
    light: { color: "#8fd0ff", bright: 15, dim: 30, pulse: 0.3 },
  };

  // ── Names: an annotation in a room is the name publish proposes for it ───
  for (const room of SHOWCASE_ROOMS)
    layers.annotation[room.cell as keyof typeof layers.annotation] = {
      text: room.name,
    };

  return layers;
}
