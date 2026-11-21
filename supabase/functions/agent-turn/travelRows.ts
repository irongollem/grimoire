// The travel map the narrator moves the party over, shaped from the rows `loadTravelMap` reads.
import { flyingSpeed } from "../../../src/lib/movement.ts";
import type { Road } from "../../../src/lib/travel/roads.ts";
import { campaignTerrains, campaignWays, type TerrainRow, type WayRow } from "../../../src/rules/travelSpeed.ts";
import { entriesOf } from "../_shared/agent/roadTables.ts";
import type { TravelMap } from "../_shared/agent/travel.ts";

type Row = Record<string, unknown>;
type TableRow = { id: string; name: string; dice: string; entries: unknown };

/** The edition whose food rules a game system plays by; null for any other system. */
export function foodEdition(gameSystem: string | null): "2014" | "2024" | null {
  return gameSystem === "dnd5e-2014" ? "2014" : gameSystem === "dnd5e-2024" ? "2024" : null;
}

// An embedded to-one row comes back as an object or, through some joins, a one-element array.
function embedded(raw: unknown): TableRow | null {
  const table = (Array.isArray(raw) ? raw[0] : raw) as TableRow | null | undefined;
  return table ?? null;
}

export function travelMapFrom(input: {
  places: readonly Row[];
  roads: readonly Row[];
  placed: readonly Row[];
  /** The campaign's "Rations on the Road" rule row; null when it has none. */
  rations: { enabled?: unknown } | null;
  gameSystem: string | null;
  /** The campaign's own terrains and ways of travelling (`travel_terrains`, `travel_ways`), laid over the presets. */
  terrains: readonly TerrainRow[];
  ways: readonly WayRow[];
  /** The campaign's companions: id, walking speed in feet, and their stat block's speed line ("30 ft., fly 80 ft."). */
  companions: readonly { id: string; speed: number | null; speed_line?: string | null }[];
}): TravelMap {
  // A flying mount travels at its fly speed, read from the stat block's speed line.
  const speeds = new Map(input.companions.map((c) => [c.id, { walk: c.speed, fly: flyingSpeed(c.speed_line) }]));
  return {
    places: input.places.map((p) => ({ id: p.id as string, name: p.name as string, parentId: p.parent_id as string | null })),
    // `distance` is numeric; anything that does not read as a number is not a road to travel by.
    roads: input.roads.map(({ roll_table: _table, ...r }) => ({ ...r, distance: Number(r.distance), terrain: r.terrain as string }) as Road).filter((r) => Number.isFinite(r.distance)),
    terrains: campaignTerrains(input.terrains),
    ways: campaignWays(input.ways),
    companionSpeed: (id, kind) => {
      const s = speeds.get(id);
      return s === undefined ? null : kind === "air" ? s.fly : s.walk;
    },
    roadTables: input.roads.flatMap((row) => {
      const table = embedded(row.roll_table);
      return table ? [{ roadId: row.id as string, table: { id: table.id, name: table.name, dice: table.dice, entries: entriesOf(table.entries) } }] : [];
    }),
    food: input.rations !== null && input.rations.enabled === true ? foodEdition(input.gameSystem) : null,
    tables: input.placed.flatMap((row) => {
      const table = embedded(row.roll_table);
      return table ? [{ id: table.id, name: table.name, dice: table.dice, entries: entriesOf(table.entries), placeId: row.location_id as string }] : [];
    }),
  };
}
