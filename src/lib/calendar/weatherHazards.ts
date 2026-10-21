import type { CalendarAdapter, Climate, Terrain } from "@/types/calendar.types";
import { addDays, type CalendarDate } from "./dayMath";
import { TEMPERATURES, weatherOn, type Weather, type WeatherPin } from "./weather";

/**
 * Dangers the weather itself justifies (#1086), read off the last few days of
 * sky and the lie of the land, never off a dice roll. A real avalanche is not
 * random: it follows loading (days of heavy snow) and a trigger (a thaw, or
 * wind). So the same dates always warn, the DM's pinned weather feeds in like
 * any other day, and a player who reads the warning learns something true.
 */

export type HazardKind = "avalanche" | "flood" | "wildfire";
export type HazardLevel = "moderate" | "high";

export interface Hazard {
  kind: HazardKind;
  level: HazardLevel;
  /** Plain words for the table: "three days of heavy snow, now thawing". */
  reason: string;
}

export const HAZARD_LABELS: Record<HazardKind, string> = {
  avalanche: "Avalanche",
  flood: "Flood",
  wildfire: "Wildfire",
};

export const TERRAIN_LABELS: Record<Terrain, string> = {
  mountains: "Mountains",
  hills: "Hills",
  forest: "Forest",
  plains: "Plains",
  coast: "Coast",
  wetland: "Wetland",
  desert: "Desert",
};

/** How many distinct days the rules read, today included. */
const WINDOW_DAYS = 5;
/** Flood looks at a shorter, wetter stretch than the window. */
const FLOOD_DAYS = 4;
const COLD_INDEX = 1;

const idx = (w: Weather) => TEMPERATURES.indexOf(w.temperature);
const isSnow = (w: Weather) => w.precipitation === "snow" || w.precipitation === "blizzard";
const isRain = (w: Weather) => w.precipitation === "rain" || w.precipitation === "downpour";
const isStrongWind = (w: Weather) => w.wind === "strong" || w.wind === "gale";
/** Dust is moisture-free, so a dust storm is still a dry day. */
const isDry = (w: Weather) => w.precipitation === "none" || w.precipitation === "dust";

const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five"];
const count = (n: number) => NUMBER_WORDS[n] ?? String(n);
const days = (n: number) => `${count(n)} ${n === 1 ? "day" : "days"}`;

/** The terrain at a place: its own, else the nearest ancestor naming one, else none. */
export interface TerrainPlace {
  id: string;
  parent_id: string | null;
  terrain: Terrain | null;
}

export function terrainFrom(
  places: ReadonlyMap<string, TerrainPlace>,
  locationId: string | null,
): { terrain: Terrain; sourceId: string } | null {
  const seen = new Set<string>();
  let id = locationId;
  while (id !== null && !seen.has(id)) {
    seen.add(id);
    const place = places.get(id);
    if (!place) break;
    if (place.terrain) return { terrain: place.terrain, sourceId: place.id };
    id = place.parent_id;
  }
  return null;
}

export const terrainAt = (places: ReadonlyMap<string, TerrainPlace>, locationId: string | null): Terrain | null =>
  terrainFrom(places, locationId)?.terrain ?? null;

// ---- The rules: each reads the window, oldest day first, today last --------

type Rule = (window: readonly Weather[]) => { level: HazardLevel; reason: string } | null;

/**
 * Avalanche: snow loads a slope, then a thaw (or wind) releases it. Snow that
 * has only fallen is a moderate warning; snow followed by warming past cold,
 * or by a strong wind that scours and drifts it, is high.
 */
const avalanche: Rule = (window) => {
  const today = window[window.length - 1];
  const snowDays = window.filter(isSnow).length;
  const blizzards = window.filter((w) => w.precipitation === "blizzard").length;
  const loaded = snowDays >= 3 || (snowDays >= 2 && blizzards >= 1);
  if (!loaded) return snowDays >= 2 ? { level: "moderate", reason: `${days(snowDays)} of heavy snow` } : null;

  const earlier = window.slice(0, -1);
  const thawing = idx(today) > COLD_INDEX && earlier.some((w) => idx(w) <= COLD_INDEX);
  const windy = isStrongWind(today);
  const loading = `${days(snowDays)} of heavy snow`;
  if (thawing) return { level: "high", reason: `${loading}, now thawing` };
  if (windy) return { level: "high", reason: `${loading}, with ${today.wind === "gale" ? "a gale" : "strong wind"} on top` };
  return { level: "moderate", reason: `${loading}${isSnow(today) ? " and still falling" : ""}` };
};

/**
 * Flood: ground that cannot take any more. Two wet days in four is a
 * warning; three downpours, or a downpour landing on melting snow, is high.
 */
const flood: Rule = (window) => {
  const recent = window.slice(-FLOOD_DAYS);
  const wet = recent.filter(isRain).length;
  const downpours = recent.filter((w) => w.precipitation === "downpour").length;
  const today = recent[recent.length - 1];
  const meltingSnow = idx(today) > COLD_INDEX && window.slice(0, -1).some(isSnow);
  const downpourNow = recent.slice(-2).some((w) => w.precipitation === "downpour");

  if (downpourNow && meltingSnow) return { level: "high", reason: "downpour on top of melting snow" };
  if (downpours >= 3) return { level: "high", reason: `${days(downpours)} of downpour` };
  if (wet >= 2) return { level: "moderate", reason: `${days(wet)} of heavy rain` };
  return null;
};

/**
 * Wildfire: fuel that has dried out, then heat. A hot dry spell is a
 * warning; add a strong wind to carry it and it is high.
 */
const wildfire: Rule = (window) => {
  if (window.length < WINDOW_DAYS || !window.every(isDry)) return null;
  const today = window[window.length - 1];
  if (idx(today) < TEMPERATURES.indexOf("hot")) return null;
  const spell = `${days(window.length)} without rain`;
  return isStrongWind(today)
    ? { level: "high", reason: `${spell}, hot and ${today.wind === "gale" ? "gale-driven" : "windy"}` }
    : { level: "moderate", reason: `${spell}, in the heat` };
};

/**
 * Which hazards a terrain can have, and how far each is allowed to go there.
 * Mountains hold snow and slide; hills slide too but gently (capped at
 * moderate). Flood is low ground collecting water: wetland, coast, plains and
 * hills (their valleys), but not mountains (water runs off) or forest (it
 * soaks the rain up), and not desert, where rain is too rare for a flood to be
 * more than a pinned scene. Fire needs fuel: forest, plains, hills.
 */
const RULES: ReadonlyArray<{ kind: HazardKind; terrains: Partial<Record<Terrain, HazardLevel>>; rule: Rule }> = [
  { kind: "avalanche", terrains: { mountains: "high", hills: "moderate" }, rule: avalanche },
  { kind: "flood", terrains: { wetland: "high", coast: "high", plains: "high", hills: "high" }, rule: flood },
  { kind: "wildfire", terrains: { forest: "high", plains: "high", hills: "high" }, rule: wildfire },
];

/** The last `WINDOW_DAYS` distinct dated days ending at `date`, oldest first. */
function weatherWindow(
  adapter: CalendarAdapter,
  climate: Climate,
  seed: string,
  pins: readonly WeatherPin[],
  date: CalendarDate,
): Weather[] {
  const out: Weather[] = [];
  const seen = new Set<string>();
  // A day that rolls forward off a festival repeats its neighbour; skip it.
  for (let back = 0; out.length < WINDOW_DAYS && back < WINDOW_DAYS + 8; back++) {
    const d = addDays(adapter, date, -back);
    const key = `${d.year}-${d.month}-${d.day}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const w = weatherOn(adapter, climate, seed, d.year, d.month, d.day, null, pins);
    if (!w) return [];
    out.unshift(w);
  }
  return out;
}

/**
 * The hazards on a dated day at a place, highest first. Empty with no terrain,
 * underground, or a date the calendar cannot place. `pins` are the DM's
 * overrides for this seed's source.
 */
export function hazardsOn(
  adapter: CalendarAdapter,
  climate: Climate,
  terrain: Terrain | null,
  seed: string,
  pins: readonly WeatherPin[],
  date: CalendarDate,
): Hazard[] {
  if (!terrain || climate === "underground") return [];
  const applicable = RULES.filter((r) => r.terrains[terrain]);
  if (!applicable.length) return [];
  const window = weatherWindow(adapter, climate, seed, pins, date);
  if (!window.length) return [];

  const out: Hazard[] = [];
  for (const { kind, terrains, rule } of applicable) {
    const found = rule(window);
    if (!found) continue;
    const level = terrains[terrain] === "moderate" ? "moderate" : found.level;
    out.push({ kind, level, reason: found.reason });
  }
  return out.sort((a, b) => Number(b.level === "high") - Number(a.level === "high"));
}
