import type { CalendarAdapter, Climate, SeasonKind } from "@/types/calendar.types";
import { daysBetween, ordinalWithinYear } from "./dayMath";
import { seasonOn } from "./seasons";

/**
 * Weather for one in-world day (#1086). Flavour, not simulation: the same
 * campaign, place-climate and date always give the same sky (no Math.random,
 * no Date), so the DM and every player read the same forecast and it never
 * changes on a refresh. It drifts rather than flickers: three independent
 * channels (warmth, wetness, wind) are value noise over the absolute day
 * number, interpolated between knots a few days apart, so a storm builds, sits
 * for a day or three and clears.
 */

export const TEMPERATURES = ["freezing", "cold", "cool", "mild", "warm", "hot", "scorching"] as const;
export type Temperature = (typeof TEMPERATURES)[number];

export type Precipitation = "none" | "drizzle" | "rain" | "downpour" | "snow" | "blizzard" | "dust";
export type Wind = "calm" | "breeze" | "strong" | "gale";

export interface Weather {
  temperature: Temperature;
  precipitation: Precipitation;
  wind: Wind;
  fog: boolean;
}

export const TEMPERATURE_LABELS: Record<Temperature, string> = {
  freezing: "Freezing",
  cold: "Cold",
  cool: "Cool",
  mild: "Mild",
  warm: "Warm",
  hot: "Hot",
  scorching: "Scorching",
};

export const PRECIPITATION_LABELS: Record<Precipitation, string> = {
  none: "Dry",
  drizzle: "Drizzle",
  rain: "Rain",
  downpour: "Downpour",
  snow: "Snow",
  blizzard: "Blizzard",
  dust: "Dust storm",
};

export const WIND_LABELS: Record<Wind, string> = {
  calm: "Calm",
  breeze: "Light breeze",
  strong: "Strong wind",
  gale: "Gale",
};

export const CLIMATE_LABELS: Record<Climate, string> = {
  polar: "Polar",
  cold: "Cold",
  temperate: "Temperate",
  warm: "Warm",
  tropical: "Tropical",
  arid: "Arid",
  underground: "Underground (no weather)",
};

/** "Cold, snow, strong wind": sentence case, calm and dry left unsaid. */
export function describeWeather(w: Weather): string {
  const parts = [TEMPERATURE_LABELS[w.temperature]];
  if (w.precipitation !== "none") parts.push(PRECIPITATION_LABELS[w.precipitation].toLowerCase());
  if (w.fog) parts.push("fog");
  parts.push(w.wind === "calm" ? "calm" : WIND_LABELS[w.wind].toLowerCase());
  return parts.join(", ");
}

// ---- Deterministic value noise ------------------------------------------

/** FNV-1a over the string, as an unsigned 32-bit integer. */
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A [0, 1) value for one integer knot of one seeded channel (murmur3 finaliser). */
function knotValue(channelHash: number, knot: number): number {
  let h = (channelHash ^ Math.imul(knot | 0, 0x9e3779b1)) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 0x100000000;
}

/** Value noise in [0, 1): knots every `spacing` days, smoothstep between them. */
function noise(channelHash: number, day: number, spacing: number): number {
  const at = day / spacing;
  const knot = Math.floor(at);
  const t = at - knot;
  const eased = t * t * (3 - 2 * t);
  const a = knotValue(channelHash, knot);
  const b = knotValue(channelHash, knot + 1);
  return a + (b - a) * eased;
}

// ---- Climate x season tables --------------------------------------------

/** Typical warmth, as an index into `TEMPERATURES` (fractions allowed), by
 *  season kind: spring, summer, autumn, winter. Noise then moves it by up to
 *  about a step and a half either way. */
const BASE_TEMPERATURE: Record<Exclude<Climate, "underground">, Record<SeasonKind, number>> = {
  polar: { spring: 0.5, summer: 1.8, autumn: 0.5, winter: 0 },
  cold: { spring: 1.6, summer: 3, autumn: 1.6, winter: 0.3 },
  temperate: { spring: 3, summer: 4, autumn: 2.6, winter: 1.3 },
  warm: { spring: 4, summer: 5, autumn: 4, winter: 3 },
  tropical: { spring: 4.5, summer: 5, autumn: 4.5, winter: 4 },
  arid: { spring: 4, summer: 5.6, autumn: 4, winter: 2.4 },
};

/** How much of the year it is wet enough to precipitate (0 to 1), same order.
 *  Value noise bunches toward the middle, so the realised share of wet days
 *  runs a little under these. Tropical summer is the monsoon; arid is nearly dry. */
const WET_SHARE: Record<Exclude<Climate, "underground">, Record<SeasonKind, number>> = {
  polar: { spring: 0.3, summer: 0.3, autumn: 0.35, winter: 0.3 },
  cold: { spring: 0.35, summer: 0.35, autumn: 0.4, winter: 0.35 },
  temperate: { spring: 0.4, summer: 0.3, autumn: 0.45, winter: 0.4 },
  warm: { spring: 0.35, summer: 0.15, autumn: 0.35, winter: 0.4 },
  tropical: { spring: 0.5, summer: 0.75, autumn: 0.5, winter: 0.3 },
  arid: { spring: 0.04, summer: 0.02, autumn: 0.04, winter: 0.06 },
};

const KNOT_SPACING = { temperature: 4, wetness: 3, wind: 3, fog: 2 } as const;
const MAX_TEMPERATURE_INDEX = TEMPERATURES.length - 1;
const COLD_INDEX = 1;
const WARM_INDEX = 4;

function windFrom(n: number): Wind {
  if (n < 0.4) return "calm";
  if (n < 0.75) return "breeze";
  if (n < 0.92) return "strong";
  return "gale";
}

/**
 * The weather on a day, or null when there is none to report: an underground
 * climate, or a date the calendar cannot place. `seed` names whose weather it
 * is (campaign id plus climate source), so two places under one climate share
 * a sky and two campaigns do not.
 */
export function weatherOn(
  adapter: CalendarAdapter,
  climate: Climate,
  seed: string,
  year: number,
  month: number | null,
  day: number | null,
  festivalDay: string | null,
): Weather | null {
  if (climate === "underground") return null;
  const ordinal = ordinalWithinYear(adapter, year, month, day, festivalDay);
  if (ordinal === undefined) return null;
  const absoluteDay = daysBetween(adapter, 1, 1, year, ordinal);
  const kind: SeasonKind = seasonOn(adapter, year, month, day, festivalDay)?.season.kind ?? "spring";

  const tempChannel = hashString(`${seed}|temperature`);
  const wetChannel = hashString(`${seed}|wetness`);
  const windChannel = hashString(`${seed}|wind`);
  const fogChannel = hashString(`${seed}|fog`);

  const swing = (noise(tempChannel, absoluteDay, KNOT_SPACING.temperature) - 0.5) * 3;
  let tempIndex = Math.round(BASE_TEMPERATURE[climate][kind] + swing);
  tempIndex = Math.max(0, Math.min(MAX_TEMPERATURE_INDEX, tempIndex));
  // Polar air never gets warmer than cool, whatever the noise says.
  if (climate === "polar") tempIndex = Math.min(tempIndex, 2);

  const wind = windFrom(noise(windChannel, absoluteDay, KNOT_SPACING.wind));
  const wetness = noise(wetChannel, absoluteDay, KNOT_SPACING.wetness);
  const threshold = 1 - WET_SHARE[climate][kind];
  const excess = wetness > threshold ? (wetness - threshold) / (1 - threshold) : 0;

  let precipitation: Precipitation = "none";
  if (excess > 0) {
    const heavy = climate === "tropical" && kind === "summer" ? 0.35 : 0.7;
    const level = excess < 0.3 ? 0 : excess < heavy ? 1 : 2;
    if (tempIndex <= COLD_INDEX) {
      precipitation = level === 2 && (wind === "strong" || wind === "gale") ? "blizzard" : "snow";
    } else {
      precipitation = (["drizzle", "rain", "downpour"] as const)[level];
    }
  } else if (climate === "arid" && (wind === "strong" || wind === "gale") && tempIndex >= WARM_INDEX && wetness > 0.35) {
    // Hot dry wind lifts the sand.
    precipitation = "dust";
  }

  // Fog: a still, damp-ish day in a climate with mist to give.
  const foggy =
    (climate === "temperate" || climate === "cold") &&
    wind === "calm" &&
    (precipitation === "none" || precipitation === "drizzle") &&
    (tempIndex === 2 || tempIndex === 3 || tempIndex === COLD_INDEX) &&
    noise(fogChannel, absoluteDay, KNOT_SPACING.fog) > 0.8;

  return { temperature: TEMPERATURES[tempIndex], precipitation, wind, fog: foggy };
}

// ---- Where the climate comes from ---------------------------------------

export interface ClimatePlace {
  id: string;
  parent_id: string | null;
  climate: Climate | null;
}

/**
 * The climate at a place: its own, else the nearest ancestor that names one,
 * else the campaign's. `sourceId` is the place that named it (null for the
 * campaign), which is what weather is seeded on so a city and its districts
 * share a sky. A cycle in the parent chain ends the walk at the campaign.
 */
export function climateAt(
  places: ReadonlyMap<string, ClimatePlace>,
  locationId: string | null,
  campaignClimate: Climate,
): { climate: Climate; sourceId: string | null } {
  const seen = new Set<string>();
  let id = locationId;
  while (id !== null && !seen.has(id)) {
    seen.add(id);
    const place = places.get(id);
    if (!place) break;
    if (place.climate) return { climate: place.climate, sourceId: place.id };
    id = place.parent_id;
  }
  return { climate: campaignClimate, sourceId: null };
}
