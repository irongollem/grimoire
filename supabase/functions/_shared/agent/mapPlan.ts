// The AI DM makes a map (epic #1021 row 17): when the scene has no map, the Narrator writes a plan (rooms, doors,
// what stands where) and this module turns it into a Cartographer drawing, so the walls are exact. The picture is
// painted from these segments later and is never the source of the walls. Pure and DOM-free: the story that writes
// it to the database and paints it lives elsewhere.
import { cellSignature, canonicalCells } from "../../../../src/cartographer/cellSignature.ts";
import { latticeKey, latticeSegment } from "../../../../src/lib/battlemap/walls.ts";
import { cellKey, emptyLayers, type CellKey, type DarknessLevel, type DungeonMapLayers, type PackRef, type WallEdge } from "../../../../src/types/dungeonMap.types.ts";
import { MAP_LIVE_VERSION, type MapLive } from "../../../../src/types/mapLive.types.ts";
import type { AgentTool } from "./types.ts";

export type MapSide = "north" | "south" | "east" | "west";
const SIDES: readonly MapSide[] = ["north", "south", "east", "west"];
const LIGHTS: readonly DarknessLevel[] = ["daylight", "dim", "dark"];

export interface PlanRoom {
  key: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  about: string | null;
}

export interface PlanDoor {
  from: string;
  /** A room key, or "outside". */
  to: string;
  /** Which side of `from` an outside door is on; null for a door between rooms. */
  side: MapSide | null;
}

export interface MapPlan {
  name: string;
  cols: number;
  rows: number;
  light: DarknessLevel;
  rooms: PlanRoom[];
  doors: PlanDoor[];
}

export const MAP_MIN_SIZE = 6;
export const MAP_MAX_SIZE = 40;
export const MAX_ROOMS = 12;
export const MAX_DOORS = 20;
export const OUTSIDE = "outside";

export const MAKE_MAP_TOOL: AgentTool = {
  name: "make_map",
  description:
    "Lay out a map for the place the party is in when it has none. Cells are 5 ft squares. Rooms are rectangles on the grid: " +
    "they may touch (a shared side is one wall) but may not overlap, and a corridor is a room 1 cell wide. A door joins two " +
    "rooms that share a side, or a room to \"outside\" on one of its sides (say which). What stands where goes in each room's " +
    "`about`, in plain words. The walls are drawn exactly from this plan.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["name", "cols", "rows", "light", "rooms", "doors"],
    properties: {
      name: { type: "string", maxLength: 80 },
      cols: { type: "integer", minimum: MAP_MIN_SIZE, maximum: MAP_MAX_SIZE },
      rows: { type: "integer", minimum: MAP_MIN_SIZE, maximum: MAP_MAX_SIZE },
      light: { type: "string", enum: [...LIGHTS] },
      rooms: {
        type: "array",
        minItems: 1,
        maxItems: MAX_ROOMS,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["key", "name", "x", "y", "w", "h"],
          properties: {
            key: { type: "string", minLength: 1, maxLength: 20 },
            name: { type: "string", maxLength: 60 },
            x: { type: "integer", minimum: 0 },
            y: { type: "integer", minimum: 0 },
            w: { type: "integer", minimum: 1 },
            h: { type: "integer", minimum: 1 },
            about: { type: "string", maxLength: 300 },
          },
        },
      },
      doors: {
        type: "array",
        maxItems: MAX_DOORS,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["from", "to"],
          properties: {
            from: { type: "string" },
            to: { type: "string" },
            side: { type: "string", enum: [...SIDES] },
          },
        },
      },
    },
  },
};

type Parsed = { ok: true; plan: MapPlan } | { ok: false; error: string };

const fail = (error: string): Parsed => ({ ok: false, error });
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

/** The cells two rooms' rectangles share a side along, as the edge keys on that side; empty when they do not touch. */
function sharedEdges(a: PlanRoom, b: PlanRoom): string[] {
  const keys: string[] = [];
  const overlap = (lo1: number, hi1: number, lo2: number, hi2: number): number[] => {
    const out: number[] = [];
    for (let i = Math.max(lo1, lo2); i < Math.min(hi1, hi2); i++) out.push(i);
    return out;
  };
  // a's right side against b's left side, and the reverse: a vertical line, one W edge per shared row.
  if (a.x + a.w === b.x) for (const y of overlap(a.y, a.y + a.h, b.y, b.y + b.h)) keys.push(latticeKey(b.x, y, "W"));
  if (b.x + b.w === a.x) for (const y of overlap(a.y, a.y + a.h, b.y, b.y + b.h)) keys.push(latticeKey(a.x, y, "W"));
  // a's bottom against b's top, and the reverse: a horizontal line, one N edge per shared column.
  if (a.y + a.h === b.y) for (const x of overlap(a.x, a.x + a.w, b.x, b.x + b.w)) keys.push(latticeKey(x, b.y, "N"));
  if (b.y + b.h === a.y) for (const x of overlap(a.x, a.x + a.w, b.x, b.x + b.w)) keys.push(latticeKey(x, a.y, "N"));
  return keys;
}

/** The edge keys along one side of a room, in order west to east or north to south. */
function sideEdges(r: PlanRoom, side: MapSide): string[] {
  const keys: string[] = [];
  if (side === "north" || side === "south") {
    const y = side === "north" ? r.y : r.y + r.h;
    for (let i = 0; i < r.w; i++) keys.push(latticeKey(r.x + i, y, "N"));
  } else {
    const x = side === "west" ? r.x : r.x + r.w;
    for (let j = 0; j < r.h; j++) keys.push(latticeKey(x, r.y + j, "W"));
  }
  return keys;
}

/** The middle edge of a run (the later of two when the run is even). */
const middle = (keys: string[]): string => keys[Math.floor(keys.length / 2)];

export function parseMapPlan(input: unknown): Parsed {
  if (!isRecord(input)) return fail("The plan must be an object.");
  const { name, cols, rows, light } = input;
  if (typeof name !== "string" || name.trim() === "" || name.length > 80) return fail("name must be 1 to 80 characters.");
  if (!isInt(cols) || cols < MAP_MIN_SIZE || cols > MAP_MAX_SIZE) return fail(`cols must be a whole number from ${MAP_MIN_SIZE} to ${MAP_MAX_SIZE}.`);
  if (!isInt(rows) || rows < MAP_MIN_SIZE || rows > MAP_MAX_SIZE) return fail(`rows must be a whole number from ${MAP_MIN_SIZE} to ${MAP_MAX_SIZE}.`);
  const lightLevel = LIGHTS.find((l) => l === light);
  if (lightLevel === undefined) return fail("light must be daylight, dim or dark.");
  const roomsIn = input.rooms;
  if (!Array.isArray(roomsIn) || roomsIn.length < 1 || roomsIn.length > MAX_ROOMS) return fail(`rooms must hold 1 to ${MAX_ROOMS} rooms.`);
  const doorsIn = input.doors;
  if (!Array.isArray(doorsIn) || doorsIn.length > MAX_DOORS) return fail(`doors must hold at most ${MAX_DOORS} doors.`);

  const rooms: PlanRoom[] = [];
  for (const [i, r] of roomsIn.entries()) {
    if (!isRecord(r)) return fail(`Room ${i + 1} must be an object.`);
    const { key, name: roomName, x, y, w, h, about } = r;
    if (typeof key !== "string" || key.trim() === "" || key.length > 20) return fail(`Room ${i + 1} needs a key of 1 to 20 characters.`);
    if (key === OUTSIDE) return fail(`"${OUTSIDE}" is not a room: it is how a door leads out of the map. Pick another key.`);
    if (rooms.some((o) => o.key === key)) return fail(`Two rooms share the key "${key}". Keys must be unique.`);
    if (typeof roomName !== "string" || roomName.trim() === "" || roomName.length > 60) return fail(`Room "${key}" needs a name of 1 to 60 characters.`);
    // The rooms become places under the map's place, matched by name without case (`make_place_map`): two of one name
    // would be one room holding two regions, which the database refuses (#1271 review).
    if (rooms.some((o) => o.name.trim().toLowerCase() === roomName.trim().toLowerCase())) return fail(`Two rooms are named "${roomName}". Give each room its own name.`);
    if (!isInt(x) || !isInt(y) || !isInt(w) || !isInt(h)) return fail(`Room "${key}": x, y, w and h must be whole numbers.`);
    if (w < 1 || h < 1) return fail(`Room "${key}" must be at least 1 cell wide and 1 high.`);
    if (about !== undefined && (typeof about !== "string" || about.length > 300)) return fail(`Room "${key}": about must be text of at most 300 characters.`);
    if (x < 0 || y < 0 || x + w > cols || y + h > rows) {
      return fail(`Room "${key}" (x ${x}, y ${y}, ${w} by ${h}) does not fit the ${cols} by ${rows} map.`);
    }
    rooms.push({ key, name: roomName, x, y, w, h, about: about === undefined || about === "" ? null : about });
  }
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i];
      const b = rooms[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
        return fail(`Rooms "${a.key}" and "${b.key}" overlap. Rooms may touch along a side but not share cells.`);
      }
    }
  }

  const byKey = new Map(rooms.map((r) => [r.key, r]));
  const doors: PlanDoor[] = [];
  const used = new Set<string>();
  for (const [i, d] of doorsIn.entries()) {
    if (!isRecord(d)) return fail(`Door ${i + 1} must be an object.`);
    const { from, to, side } = d;
    if (typeof from !== "string" || !byKey.has(from)) return fail(`Door ${i + 1} starts at "${String(from)}", which is not a room key.`);
    if (typeof to !== "string" || (to !== OUTSIDE && !byKey.has(to))) return fail(`Door ${i + 1} leads to "${String(to)}", which is not a room key or "${OUTSIDE}".`);
    const fromRoom = byKey.get(from);
    if (!fromRoom) return fail(`Door ${i + 1} starts at "${from}", which is not a room key.`);
    let edge: string;
    let planSide: MapSide | null = null;
    if (to === OUTSIDE) {
      if (typeof side !== "string" || !(SIDES as readonly string[]).includes(side)) return fail(`Door ${i + 1} (from "${from}" to outside) needs a side: north, south, east or west.`);
      planSide = side as MapSide;
      edge = middle(sideEdges(fromRoom, planSide));
    } else {
      if (side !== undefined) return fail(`Door ${i + 1} joins two rooms, so it takes no side. Only a door to "${OUTSIDE}" names one.`);
      const toRoom = byKey.get(to);
      if (!toRoom) return fail(`Door ${i + 1} leads to "${to}", which is not a room key.`);
      if (from === to) return fail(`Door ${i + 1} joins room "${from}" to itself.`);
      const shared = sharedEdges(fromRoom, toRoom);
      if (shared.length === 0) return fail(`Door ${i + 1} joins "${from}" and "${to}", but those rooms share no side. Move them to touch or door them to other rooms.`);
      edge = middle(shared);
    }
    if (used.has(edge)) return fail(`Door ${i + 1} (${from} to ${to}) sits on the same edge as another door. Give it a different room pair or side.`);
    used.add(edge);
    doors.push({ from, to, side: planSide });
  }
  return { ok: true, plan: { name, cols, rows, light: lightLevel, rooms, doors } };
}

/** A built wall names no tile set (see `uvttImport.ts`): it is never drawn, the styler's picture shows it. */
const NO_TILE_SET: PackRef = { pack_id: "", pack_version: 0, variant: 0 };

export interface BuiltRoom {
  key: string;
  name: string;
  about: string | null;
  /** Sorted by row, then column. */
  cells: CellKey[];
  signature: string;
}

export interface BuiltDoor {
  from: string;
  /** The room key, or null for the outside. */
  to: string | null;
  edgeKey: string;
}

export interface MapSegments {
  cols: number;
  rows: number;
  rooms: { x: number; y: number; w: number; h: number }[];
  walls: { a: [number, number]; b: [number, number] }[];
  doors: { a: [number, number]; b: [number, number] }[];
}

export interface BuiltMap {
  layers: DungeonMapLayers;
  darkness: DarknessLevel;
  mapLive: MapLive;
  rooms: BuiltRoom[];
  doors: BuiltDoor[];
  segments: MapSegments;
}

/** Build everything a map needs from a plan that `parseMapPlan` accepted. */
export function buildMap(plan: MapPlan): BuiltMap {
  const layers = emptyLayers();
  const byKey = new Map(plan.rooms.map((r) => [r.key, r]));

  // Every room's perimeter on the lattice; a side two rooms share has one key, so it is one wall.
  const edgeKeys = new Set<string>();
  for (const r of plan.rooms) for (const s of SIDES) for (const k of sideEdges(r, s)) edgeKeys.add(k);

  const doorEdges = new Map<string, BuiltDoor>();
  const doors: BuiltDoor[] = [];
  for (const d of plan.doors) {
    const from = byKey.get(d.from);
    if (!from) throw new Error(`Door from unknown room ${d.from}; run parseMapPlan first.`);
    let edgeKey: string;
    if (d.to === OUTSIDE) {
      if (d.side === null) throw new Error("An outside door has a side; run parseMapPlan first.");
      edgeKey = middle(sideEdges(from, d.side));
    } else {
      const to = byKey.get(d.to);
      if (!to) throw new Error(`Door to unknown room ${d.to}; run parseMapPlan first.`);
      edgeKey = middle(sharedEdges(from, to));
    }
    const built: BuiltDoor = { from: d.from, to: d.to === OUTSIDE ? null : d.to, edgeKey };
    doorEdges.set(edgeKey, built);
    doors.push(built);
  }

  const mapLive: MapLive = { version: MAP_LIVE_VERSION, darkness: plan.light, groups: [], lights: [], sprites: [], walls: [], doors: [], solid: [] };
  const segments: MapSegments = { cols: plan.cols, rows: plan.rows, rooms: plan.rooms.map(({ x, y, w, h }) => ({ x, y, w, h })), walls: [], doors: [] };
  for (const id of edgeKeys) {
    const seg = latticeSegment(id);
    const a: [number, number] = [seg.a[0], seg.a[1]];
    const b: [number, number] = [seg.b[0], seg.b[1]];
    const isDoor = doorEdges.has(id);
    const edge: WallEdge = { ...NO_TILE_SET, type: isDoor ? "doorClosed" : "wall", a, b, visible: false };
    layers.walls[id] = edge;
    if (isDoor) {
      mapLive.doors.push({ id, a, b, open: false, leaf: null });
      segments.doors.push({ a, b });
    } else {
      mapLive.walls.push({ id, a, b });
      segments.walls.push({ a, b });
    }
  }

  const rooms: BuiltRoom[] = plan.rooms.map((r) => {
    const cells: CellKey[] = [];
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) cells.push(cellKey(x, y));
    return { key: r.key, name: r.name, about: r.about, cells: canonicalCells(cells), signature: cellSignature(cells) };
  });

  return {
    layers,
    darkness: plan.light,
    mapLive,
    rooms,
    doors,
    segments,
  };
}
