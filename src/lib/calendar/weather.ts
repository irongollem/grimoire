import { CLIMATES, type CalendarAdapter, type Climate, type SeasonKind } from "@/types/calendar.types";
import { daysBetween, ordinalWithinYear } from "./dayMath";
import { seasonOn } from "./seasons";

/**
 * Weather for one in-world day (#1086). Flavour, not simulation: the same
 * campaign, place-climate, pins and date always give the same sky (no
 * Math.random, no Date), so the DM and every player read the same forecast and
 * it never changes on a refresh. It drifts rather than flickers: three independent
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
const POLAR_MAX_INDEX = 2;
/** How far the warmth channel swings the base temperature, in steps. */
const WARMTH_SWING = 3;

export type WeatherClimate = Exclude<Climate, "underground">;

function windFrom(n: number): Wind {
  if (n < 0.4) return "calm";
  if (n < 0.75) return "breeze";
  if (n < 0.92) return "strong";
  return "gale";
}

const isStrongWind = (w: Wind) => w === "strong" || w === "gale";
const heavyThreshold = (climate: WeatherClimate, kind: SeasonKind) =>
  climate === "tropical" && kind === "summer" ? 0.35 : 0.7;

// ---- Channels: the raw numbers a day's weather is read from ---------------

/**
 * The four raw values a day's weather is read from. Natural ones are in [0, 1);
 * a DM's pin may push warmth and wetness outside that, which is how a blizzard
 * can be set in a tropical valley and then thaw back to the pattern.
 */
export interface WeatherChannels {
  warmth: number;
  wetness: number;
  wind: number;
  fog: number;
}

/** The natural channels for one seed on one absolute day. */
export function channelsOn(seed: string, absoluteDay: number): WeatherChannels {
  return {
    warmth: noise(hashString(`${seed}|temperature`), absoluteDay, KNOT_SPACING.temperature),
    wetness: noise(hashString(`${seed}|wetness`), absoluteDay, KNOT_SPACING.wetness),
    wind: noise(hashString(`${seed}|wind`), absoluteDay, KNOT_SPACING.wind),
    fog: noise(hashString(`${seed}|fog`), absoluteDay, KNOT_SPACING.fog),
  };
}

/** Fog needs a still, damp-ish day in a climate with mist to give. */
export function fogPossible(climate: Climate, w: Omit<Weather, "fog">): boolean {
  const t = TEMPERATURES.indexOf(w.temperature);
  return (
    (climate === "temperate" || climate === "cold") &&
    w.wind === "calm" &&
    (w.precipitation === "none" || w.precipitation === "drizzle") &&
    (t === COLD_INDEX || t === 2 || t === 3)
  );
}

/** Weather from channels, for a climate and the season kind of the day. */
export function weatherFromChannels(climate: WeatherClimate, kind: SeasonKind, ch: WeatherChannels): Weather {
  let tempIndex = Math.round(BASE_TEMPERATURE[climate][kind] + (ch.warmth - 0.5) * WARMTH_SWING);
  tempIndex = Math.max(0, Math.min(MAX_TEMPERATURE_INDEX, tempIndex));
  // Polar air never gets warmer than cool, whatever the noise says.
  if (climate === "polar") tempIndex = Math.min(tempIndex, POLAR_MAX_INDEX);

  const wind = windFrom(ch.wind);
  const threshold = 1 - WET_SHARE[climate][kind];
  const excess = ch.wetness > threshold ? (ch.wetness - threshold) / (1 - threshold) : 0;

  let precipitation: Precipitation = "none";
  if (excess > 0) {
    const level = excess < 0.3 ? 0 : excess < heavyThreshold(climate, kind) ? 1 : 2;
    if (tempIndex <= COLD_INDEX) {
      precipitation = level === 2 && isStrongWind(wind) ? "blizzard" : "snow";
    } else {
      precipitation = (["drizzle", "rain", "downpour"] as const)[level];
    }
  } else if (climate === "arid" && isStrongWind(wind) && tempIndex >= WARM_INDEX && ch.wetness > 0.35) {
    // Hot dry wind lifts the sand.
    precipitation = "dust";
  }

  const partial = { temperature: TEMPERATURES[tempIndex], precipitation, wind };
  const fog = fogPossible(climate, partial) && ch.fog > 0.8;
  return { ...partial, fog };
}

// ---- What a DM can ask for -------------------------------------------------

/** The temperatures a climate can show: polar air never gets warmer than cool. */
export function allowedTemperatures(climate: Climate): readonly Temperature[] {
  return climate === "polar" ? TEMPERATURES.slice(0, POLAR_MAX_INDEX + 1) : TEMPERATURES;
}

/**
 * The precipitation that can fall at a temperature: snow only at freezing or
 * cold, rain only above that, and dust only in an arid climate when it is
 * warm. (Blizzard and dust also need a strong wind; `coerceWeather` supplies it.)
 */
export function allowedPrecipitation(climate: Climate, temperature: Temperature): readonly Precipitation[] {
  const t = TEMPERATURES.indexOf(temperature);
  if (t <= COLD_INDEX) return ["none", "snow", "blizzard"];
  const wet: Precipitation[] = ["none", "drizzle", "rain", "downpour"];
  return climate === "arid" && t >= WARM_INDEX ? [...wet, "dust"] : wet;
}

/**
 * The nearest weather the climate can actually produce: temperature capped,
 * precipitation reset to dry when it does not fit the temperature, a blizzard
 * or dust storm given the strong wind it needs, fog dropped where it cannot
 * form. A weather that is already reachable comes back unchanged.
 */
export function coerceWeather(climate: Climate, w: Weather): Weather {
  const temps = allowedTemperatures(climate);
  const temperature = temps.includes(w.temperature) ? w.temperature : temps[temps.length - 1];
  const precipitation = allowedPrecipitation(climate, temperature).includes(w.precipitation) ? w.precipitation : "none";
  let wind = w.wind;
  if ((precipitation === "blizzard" || precipitation === "dust") && !isStrongWind(wind)) wind = "strong";
  const base = { temperature, precipitation, wind };
  return { ...base, fog: w.fog && fogPossible(climate, base) };
}

/**
 * The inverse of `weatherFromChannels`: channels that read back as exactly
 * this weather (after `coerceWeather`), each at the middle of its band so a
 * small drift does not tip it into the next one. Warmth is not limited to
 * [0, 1], so any temperature the climate allows can be asked for.
 */
export function channelsFor(climate: WeatherClimate, kind: SeasonKind, weather: Weather): WeatherChannels {
  const w = coerceWeather(climate, weather);
  const warmth = (TEMPERATURES.indexOf(w.temperature) - BASE_TEMPERATURE[climate][kind]) / WARMTH_SWING + 0.5;
  const wind = { calm: 0.2, breeze: 0.575, strong: 0.835, gale: 0.96 }[w.wind];

  const threshold = 1 - WET_SHARE[climate][kind];
  const heavy = heavyThreshold(climate, kind);
  const wetAt = (excess: number) => threshold + excess * (1 - threshold);
  const wetness = {
    none: Math.min(threshold * 0.5, 0.3),
    dust: 0.5,
    drizzle: wetAt(0.15),
    rain: wetAt((0.3 + heavy) / 2),
    snow: wetAt((0.3 + heavy) / 2),
    downpour: wetAt((heavy + 1) / 2),
    blizzard: wetAt((heavy + 1) / 2),
  }[w.precipitation];

  return { warmth, wetness, wind, fog: w.fog ? 0.9 : 0.1 };
}

// ---- DM pins ---------------------------------------------------------------

/**
 * A DM's override of the sky on one dated day (#1086). `source` is the climate
 * source id (`climateAt`'s `sourceId`; null for the campaign), so a pin only
 * bends the sky of the place it was made for.
 *
 * - `set`: that day is exactly `weather`; the days after ease back to the
 *   pattern, so what follows reads as a consequence of what the DM set.
 * - `reroll`: from that day the sky is drawn from a fresh seed (`salt`, the
 *   only randomness, chosen when the DM clicks and stored here), eased in over
 *   the first day so the change is not a jump.
 */
export type WeatherPin = { source: string | null; year: number; month: number; day: number } & (
  | { kind: "set"; weather: Weather }
  | { kind: "reroll"; salt: string }
);

/** Share of the way back to the pattern after `days` days since a `set` pin. */
const SET_EASE = [0, 0.35, 0.65, 0.9] as const;
export const PIN_EASE_DAYS = SET_EASE.length;
const easeBack = (days: number) => (days >= SET_EASE.length ? 1 : SET_EASE[days]);
/** How much of a reroll's new sky shows on the pin day itself. */
const REROLL_FIRST_DAY = 0.5;

function lerpChannels(a: WeatherChannels, b: WeatherChannels, t: number): WeatherChannels {
  return {
    warmth: a.warmth + (b.warmth - a.warmth) * t,
    wetness: a.wetness + (b.wetness - a.wetness) * t,
    wind: a.wind + (b.wind - a.wind) * t,
    fog: a.fog + (b.fog - a.fog) * t,
  };
}

function absoluteDayOf(
  adapter: CalendarAdapter,
  year: number,
  month: number | null,
  day: number | null,
  festivalDay: string | null,
): number | undefined {
  const ordinal = ordinalWithinYear(adapter, year, month, day, festivalDay);
  return ordinal === undefined ? undefined : daysBetween(adapter, 1, 1, year, ordinal);
}

interface PlacedPin {
  pin: WeatherPin;
  abs: number;
  kind: SeasonKind;
}

/** Pins the calendar can place, oldest first (stable, so a later write wins a tie). */
function placePins(adapter: CalendarAdapter, pins: readonly WeatherPin[]): PlacedPin[] {
  const placed: PlacedPin[] = [];
  for (const pin of pins) {
    const abs = absoluteDayOf(adapter, pin.year, pin.month, pin.day, null);
    if (abs === undefined) continue;
    placed.push({ pin, abs, kind: seasonOn(adapter, pin.year, pin.month, pin.day, null)?.season.kind ?? "spring" });
  }
  return placed.sort((a, b) => a.abs - b.abs);
}

/** The last of the first `count` pins that is on or before the day, or -1. */
function governingPin(pins: readonly PlacedPin[], count: number, abs: number): number {
  for (let i = count - 1; i >= 0; i--) if (pins[i].abs <= abs) return i;
  return -1;
}

/**
 * Channels for a day under the first `count` pins. A pin shapes the day by
 * easing from (or to) what the day would have been under the pins before it,
 * so a later pin replaces an earlier one's influence from its own day on.
 */
function channelsUnder(climate: WeatherClimate, seed: string, pins: readonly PlacedPin[], count: number, abs: number): WeatherChannels {
  const i = governingPin(pins, count, abs);
  if (i < 0) return channelsOn(seed, abs);
  const { pin, abs: pinAbs, kind } = pins[i];
  const before = channelsUnder(climate, seed, pins, i, abs);
  const days = abs - pinAbs;
  if (pin.kind === "set") {
    return lerpChannels(channelsFor(climate, kind, pin.weather), before, easeBack(days));
  }
  const fresh = channelsOn(`${seed}:${pin.salt}`, abs);
  return days === 0 ? lerpChannels(before, fresh, REROLL_FIRST_DAY) : fresh;
}

/**
 * The weather on a day, or null when there is none to report: an underground
 * climate, or a date the calendar cannot place. `seed` names whose weather it
 * is (campaign id plus climate source), so two places under one climate share
 * a sky and two campaigns do not. `pins` are the DM's overrides for this seed's
 * source only (the caller filters); the most recent pin on or before the date
 * governs, and none leaves the natural sky untouched.
 */
export function weatherOn(
  adapter: CalendarAdapter,
  climate: Climate,
  seed: string,
  year: number,
  month: number | null,
  day: number | null,
  festivalDay: string | null,
  pins: readonly WeatherPin[] = [],
): Weather | null {
  if (climate === "underground") return null;
  const abs = absoluteDayOf(adapter, year, month, day, festivalDay);
  if (abs === undefined) return null;
  const kind: SeasonKind = seasonOn(adapter, year, month, day, festivalDay)?.season.kind ?? "spring";

  const placed = placePins(adapter, pins);
  const top = governingPin(placed, placed.length, abs);
  const governing = top < 0 ? null : placed[top];
  if (governing && governing.pin.kind === "set" && governing.abs === abs) {
    return coerceWeather(climate, governing.pin.weather);
  }
  return weatherFromChannels(climate, kind, channelsUnder(climate, seed, placed, placed.length, abs));
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
/** Whether a stored value is a climate this module can draw weather for. */
export function isClimate(value: unknown): value is Climate {
  return typeof value === "string" && (CLIMATES as readonly string[]).includes(value);
}

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
    if (isClimate(place.climate)) return { climate: place.climate, sourceId: place.id };
    id = place.parent_id;
  }
  // A campaign row restored from the persisted query cache can predate the
  // climate column; the tables have no row for undefined, so fall back to the
  // column's own default rather than throw while rendering the Hearth.
  return { climate: isClimate(campaignClimate) ? campaignClimate : "temperate", sourceId: null };
}
