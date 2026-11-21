/**
 * How fast a party travels (#1222, decision 9): one formula, with the books as its presets.
 *
 *   miles an hour = speed in feet ÷ 10 × pace × terrain
 *   travel hours  = miles ÷ miles an hour × 8 ÷ hours travelled a day
 *
 * - Speed ÷ 10 is miles an hour: the PHB's normal pace is 300 feet a minute for a 30 ft walker, 3 mph. A mount or
 *   a sled brings its own speed (or its puller's, a companion); a vehicle the books give only in miles an hour
 *   (the PHB ships, the 2024 airship) brings that.
 * - Pace: slow ×0.75, normal ×1, fast ×1.25. With an 8-hour day that is the PHB's 18 / 24 / 30 miles a day for a
 *   30 ft walker. (The PHB's per-hour column, 2 / 3 / 4, does not multiply out to its own per-day column; the
 *   per-day figures win, as they always have here.) A ship and a flyer keep their speed whatever the pace.
 * - Terrain: every traveller is slowed by the terrain's `factor`; those who walk or ride on it also sink by its
 *   `sink`. Snow is read from Rime of the Frostmaiden's Overland Travel table (dogsled 1 mph, on foot with
 *   snowshoes 1/2, without 1/4): snow is ×1/3 for everyone (the maintainer, 20 Nov 2026: "under normal conditions
 *   walkspeed is 1/3"), sinking ×1/4 on bare feet, and snowshoes ×1/2 instead; a sled does not sink. A way of
 *   travelling at home on a terrain ignores both (an axe beak bred for the cold).
 * - Hours a day: 8 for walkers and riders (more is a forced march, the PHB's Constitution saves), 24 for a crewed
 *   ship that sails through the night.
 *
 * Every number here is a preset: a campaign may override any terrain or way of travelling, or add its own
 * (`travel_terrains`, `travel_ways`). A campaign that overrides nothing reads the books.
 *
 * Imported by the edge functions too, so its imports are relative and carry the extension.
 */
import { flyingSpeed } from "../lib/movement.ts";
import { getTravelPace, TRAVEL_HOURS_PER_DAY, type TravelPaceId } from "./travelPace.ts";

// ── Terrains ──────────────────────────────────────────────────────────────────

export interface Terrain {
  key: string;
  name: string;
  /** What it does to everyone's speed. */
  factor: number;
  /** What it does, on top, to those who walk or ride on it (sinking into snow or sand). */
  sink: number;
  /** Where the numbers come from; null for a preset of ours or one the DM wrote. */
  source: string | null;
}

/** Slowest last. The keys are what a road stores (`location_roads.terrain`). */
export const TERRAIN_PRESETS: readonly Terrain[] = [
  { key: "road", name: "Road or hardened path", factor: 1, sink: 1, source: "PHB, Travel Pace" },
  { key: "open", name: "Open country", factor: 1, sink: 1, source: "PHB, Travel Pace" },
  { key: "difficult", name: "Difficult going (marsh, mountains, thick forest)", factor: 0.5, sink: 1, source: "PHB, Difficult Terrain" },
  // The books give sand no figure; difficult going's half is our starting point, for the DM to change.
  { key: "sand", name: "Desert sand", factor: 0.5, sink: 1, source: null },
  { key: "snow", name: "Snow", factor: 1 / 3, sink: 0.25, source: "Rime of the Frostmaiden, Overland Travel" },
];

export const DEFAULT_ROAD_TERRAIN = "road";

// ── Ways of travelling ───────────────────────────────────────────────────────

/**
 * - `foot`: walks (sinks; moves at the pace).
 * - `ride`: carried by a mount (sinks; moves at the pace).
 * - `vehicle`: rolls or slides on land, pulled (does not sink; moves at the pace).
 * - `water`: a boat or ship, on the river and sea legs only; the land legs are walked.
 * - `air`: flies, over everything: no terrain, and the straight line between two places where a map gives one.
 */
export type WayKind = "foot" | "ride" | "vehicle" | "water" | "air";

export interface WayOfTravel {
  key: string;
  name: string;
  kind: WayKind;
  /** Its speed in feet. Null for one that has a speed only in miles an hour (`mph`) or takes its puller's. */
  speedFeet: number | null;
  /** Its speed in miles an hour, where the book gives only that (ships, the airship). */
  mph: number | null;
  /** The companion that carries or pulls it: its speed is the companion's walking speed. */
  companionId: string | null;
  /** Terrains it is at home on: neither their factor nor their sinking slows it. */
  atHome: readonly string[];
  /** Sinking it suffers instead of a terrain's own (snowshoes: 1/2 on snow rather than 1/4). */
  sink: Readonly<Record<string, number>>;
  /** Travels round the clock (a crewed ship): 24 hours a day instead of 8. */
  throughTheNight: boolean;
  source: string | null;
}

const way = (w: Omit<WayOfTravel, "companionId" | "atHome" | "sink" | "throughTheNight" | "speedFeet" | "mph"> & Partial<WayOfTravel>): WayOfTravel => ({
  speedFeet: null, mph: null, companionId: null, atHome: [], sink: {}, throughTheNight: false, ...w,
});

export const ON_FOOT_KEY = "on_foot";

/**
 * The books' ways of travelling. The sled's 30 ft is the book's dogs at a normal 3 mph, which snow brings to the
 * Overland Travel table's 1 mph. A mount has no preset: it is a creature, so a DM makes one from a companion and
 * its speed. The PHB ships (Waterborne Vehicles) and the 2024 airship have speeds only in miles an hour.
 */
export const WAY_PRESETS: readonly WayOfTravel[] = [
  way({ key: ON_FOOT_KEY, name: "On foot", kind: "foot", speedFeet: 30, source: "PHB, Travel Pace" }),
  way({ key: "snowshoes", name: "Snowshoes", kind: "foot", speedFeet: 30, sink: { snow: 0.5 }, source: "Rime of the Frostmaiden, Overland Travel" }),
  way({ key: "dogsled", name: "Dogsled", kind: "vehicle", speedFeet: 30, source: "Rime of the Frostmaiden, Overland Travel" }),
  way({ key: "galley", name: "Galley", kind: "water", mph: 4, source: "PHB, Mounts and Vehicles" }),
  way({ key: "keelboat", name: "Keelboat", kind: "water", mph: 1, source: "PHB, Mounts and Vehicles" }),
  way({ key: "longship", name: "Longship", kind: "water", mph: 3, source: "PHB, Mounts and Vehicles" }),
  way({ key: "rowboat", name: "Rowboat", kind: "water", mph: 1.5, source: "PHB, Mounts and Vehicles" }),
  way({ key: "sailing_ship", name: "Sailing ship", kind: "water", mph: 2, source: "PHB, Mounts and Vehicles" }),
  way({ key: "warship", name: "Warship", kind: "water", mph: 2.5, source: "PHB, Mounts and Vehicles" }),
  way({ key: "airship", name: "Airship", kind: "air", mph: 8, source: "PHB (2024), Mounts and Vehicles" }),
];

// ── A campaign's own ───────────────────────────────────────────────────────────

/** A campaign's row for a terrain: an override of a preset (same key) or one of its own. */
export interface TerrainRow {
  key: string;
  name: string;
  factor: number;
  sink: number;
}

/** A campaign's row for a way of travelling: an override of a preset (same key) or one of its own. */
export interface WayRow {
  key: string;
  name: string;
  kind: WayKind;
  speed_feet: number | null;
  mph: number | null;
  companion_id: string | null;
  at_home: readonly string[];
  sink: Readonly<Record<string, number>>;
  through_the_night: boolean;
}

/** The presets with the campaign's rows laid over them by key, the campaign's own added after. */
export function campaignTerrains(rows: readonly TerrainRow[]): Terrain[] {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const presets = TERRAIN_PRESETS.map((t) => {
    const own = byKey.get(t.key);
    return own ? { key: t.key, name: own.name, factor: own.factor, sink: own.sink, source: null } : t;
  });
  const extra = rows.filter((r) => !TERRAIN_PRESETS.some((t) => t.key === r.key)).map((r) => ({ key: r.key, name: r.name, factor: r.factor, sink: r.sink, source: null }));
  return [...presets, ...extra];
}

export function campaignWays(rows: readonly WayRow[]): WayOfTravel[] {
  const toWay = (r: WayRow): WayOfTravel => ({
    key: r.key, name: r.name, kind: r.kind, speedFeet: r.speed_feet, mph: r.mph, companionId: r.companion_id,
    atHome: r.at_home, sink: r.sink, throughTheNight: r.through_the_night, source: null,
  });
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const presets = WAY_PRESETS.map((w) => {
    const own = byKey.get(w.key);
    return own ? toWay(own) : w;
  });
  return [...presets, ...rows.filter((r) => !WAY_PRESETS.some((w) => w.key === r.key)).map(toWay)];
}

// ── The formula ────────────────────────────────────────────────────────────────

/** Slow ×0.75, normal ×1, fast ×1.25: the PHB's miles a day, 18 / 24 / 30, over 24. */
export function paceFactor(paceId: TravelPaceId): number {
  return getTravelPace(paceId).milesPerDay / getTravelPace("normal").milesPerDay;
}

/**
 * A way's own speed in miles an hour, before pace and terrain: its miles an hour, else its speed (or its
 * companion's, read through `companionSpeed` for the way's kind: a flying mount's fly speed) in feet ÷ 10. Null
 * when it has neither, such as a mount whose companion is gone, or a "flying" one with no fly speed: that way
 * cannot be travelled.
 */
export function baseMph(w: WayOfTravel, companionSpeed: CompanionSpeed): number | null {
  if (w.mph !== null && w.mph > 0) return w.mph;
  const feet = w.companionId !== null ? companionSpeed(w.companionId, w.kind) : w.speedFeet;
  return feet !== null && feet > 0 ? feet / 10 : null;
}

/** What a terrain does to a way: 1 at home or in the air; its factor, and its sinking for those who walk or ride. */
export function terrainMultiplier(w: WayOfTravel, terrain: Terrain | undefined): number {
  if (terrain === undefined || w.kind === "air" || w.atHome.includes(terrain.key)) return 1;
  const sinks = w.kind === "foot" || w.kind === "ride";
  const sink = sinks ? (w.sink[terrain.key] ?? terrain.sink) : 1;
  return terrain.factor * sink;
}

/** The stretch of a journey, as far as its time goes. */
export interface TimedLeg {
  miles: number;
  /** A terrain key (`location_roads.terrain`). */
  terrain: string;
  going: "road" | "track" | "river" | "sea";
}

export interface TravelContext {
  paceId: TravelPaceId;
  way: WayOfTravel;
  terrains: readonly Terrain[];
  companionSpeed: CompanionSpeed;
}

/** A companion's speed in feet for a kind of travel: its fly speed for `air`, its walking speed otherwise. */
export type CompanionSpeed = (id: string, kind: WayKind) => number | null;

const onFoot = (): WayOfTravel => WAY_PRESETS[0];

/**
 * Travel hours (eight to a travel day) one leg takes, or null when the way cannot move (no speed). A boat takes
 * only the river and sea legs and walks the land between; a party on foot, riding or by sled covers a river or
 * sea leg at its pace as if by the bank, since nobody said they took a boat.
 */
export function legTravelHours(leg: TimedLeg, ctx: TravelContext): number | null {
  const onWater = leg.going === "river" || leg.going === "sea";
  const w = ctx.way.kind === "water" && !onWater ? onFoot() : ctx.way;
  const mph = baseMph(w, ctx.companionSpeed);
  if (mph === null) return null;
  const paced = w.kind === "water" || w.kind === "air" ? mph : mph * paceFactor(ctx.paceId);
  const terrain = ctx.terrains.find((t) => t.key === leg.terrain);
  const speed = paced * (w.kind === "water" ? 1 : terrainMultiplier(w, terrain));
  if (!(speed > 0)) return null;
  const hoursADay = w.throughTheNight ? 24 : TRAVEL_HOURS_PER_DAY;
  return (Math.max(0, leg.miles) / speed) * (TRAVEL_HOURS_PER_DAY / hoursADay);
}

// ── A creature's travel traits (`library_monsters.travel`) ───────────────────

/** What a creature is good for on the road, as the bestiary marks it; null for one nobody rides or yokes. */
export interface BeastTravel {
  ridden: boolean;
  pulls: boolean;
  at_home: readonly string[];
}

/** Reads a `travel` column defensively: anything not shaped like the traits is no traits. */
export function beastTravelOf(raw: unknown): BeastTravel | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.ridden !== "boolean" || typeof r.pulls !== "boolean" || !Array.isArray(r.at_home)) return null;
  return { ridden: r.ridden, pulls: r.pulls, at_home: r.at_home.filter((k): k is string => typeof k === "string") };
}

/**
 * The way of travelling a creature suggests when a DM picks it to carry or pull one: flying when it is ridden and
 * has a fly speed, ridden when it is ridden, pulled when it only pulls; and the terrains it is at home on. A kind
 * the DM already chose and the creature can do (pulling a sled with a horse that can also be ridden) is kept.
 */
export function suggestWay(traits: BeastTravel, flies: boolean, current: WayKind): { kind: WayKind; atHome: string[] } {
  const can = (kind: WayKind): boolean =>
    kind === "air" ? traits.ridden && flies : kind === "ride" ? traits.ridden : kind === "vehicle" ? traits.pulls : false;
  const kind: WayKind = can(current) ? current : traits.ridden && flies ? "air" : traits.ridden ? "ride" : traits.pulls ? "vehicle" : current;
  return { kind, atHome: [...traits.at_home] };
}

/**
 * What a creature is good for on the road, in words: "can be ridden, pulls a load, at home on snow"; "a flying
 * mount". Empty for none. `terrainName` gives the campaign's name for a terrain key (the presets' otherwise).
 */
export function beastTravelText(traits: BeastTravel, flies: boolean, terrainName: (key: string) => string = presetTerrainName): string {
  const parts = [traits.ridden ? (flies ? "a flying mount" : "can be ridden") : null, traits.pulls ? "pulls a load" : null];
  const home = traits.at_home.map((k) => terrainName(k).toLowerCase());
  if (home.length) parts.push(`at home on ${home.join(" and ")}`);
  return parts.filter((p): p is string => p !== null).join(", ");
}

function presetTerrainName(key: string): string {
  return TERRAIN_PRESETS.find((t) => t.key === key)?.name ?? key;
}

/** A bestiary creature's "On the road" line ("Can be ridden, pulls a load, at home on snow"), or "" for none. */
export function creatureOnTheRoad(creature: { travel?: unknown; stat_block: { speed?: string | null } }): string {
  const traits = beastTravelOf(creature.travel);
  if (!traits) return "";
  const text = beastTravelText(traits, flyingSpeed(creature.stat_block.speed) !== null);
  return text.charAt(0).toUpperCase() + text.slice(1);
}
