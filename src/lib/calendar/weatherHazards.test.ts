import { describe, expect, it } from "vitest";
import { gregorianAdapter } from "@/settings/gregorian.calendar";
import type { Terrain } from "@/types/calendar.types";
import { addDays, type CalendarDate } from "./dayMath";
import type { Weather, WeatherPin } from "./weather";
import { hazardsOn, terrainAt, terrainFrom, type Hazard, type TerrainPlace } from "./weatherHazards";

const adapter = gregorianAdapter;
const SEED = "c1:campaign";
const day: CalendarDate = { year: 12, month: 1, day: 20 };
const dated = (n: number) => addDays(adapter, day, n);

const w = (temperature: Weather["temperature"], precipitation: Weather["precipitation"], wind: Weather["wind"] = "calm"): Weather => ({
  temperature,
  precipitation,
  wind,
  fog: false,
});
/** A pin per listed day, ending on `day`: the sky the DM wants, regardless of the pattern. */
const run = (...skies: Weather[]): WeatherPin[] =>
  skies.map((weather, i) => ({ source: null, ...dated(i - skies.length + 1), kind: "set", weather }));

const hazards = (terrain: Terrain | null, pins: WeatherPin[], climate: "cold" | "temperate" | "arid" = "cold"): Hazard[] =>
  hazardsOn(adapter, climate, terrain, SEED, pins, day);
const find = (list: Hazard[], kind: Hazard["kind"]) => list.find((h) => h.kind === kind);

describe("avalanche", () => {
  const snow = w("freezing", "snow");
  const blizzard = w("freezing", "blizzard", "gale");

  it("is high when heavy snow is followed by a thaw, and says why", () => {
    const found = find(hazards("mountains", run(blizzard, snow, blizzard, w("cool", "none"))), "avalanche");
    expect(found?.level).toBe("high");
    expect(found?.reason).toBe("three days of heavy snow, now thawing");
  });

  it("is high when heavy snow meets a gale", () => {
    expect(find(hazards("mountains", run(snow, snow, snow, w("cold", "none", "gale"))), "avalanche")?.level).toBe("high");
  });

  it("is moderate for snow alone, and absent without it", () => {
    expect(find(hazards("mountains", run(w("mild", "none"), snow, snow, w("cold", "none"))), "avalanche")?.level).toBe("moderate");
    expect(find(hazards("mountains", run(w("mild", "none"), w("mild", "rain"), w("mild", "none"))), "avalanche")).toBeUndefined();
  });

  it("raises the risk when a DM-pinned blizzard is followed by a thaw, against the same days without it", () => {
    const without = run(w("cool", "none"), w("cool", "none"), w("cool", "none"), w("cool", "none"));
    const pinned = run(blizzard, snow, blizzard, w("cool", "none"));
    expect(find(hazards("mountains", without), "avalanche")).toBeUndefined();
    expect(find(hazards("mountains", pinned), "avalanche")?.level).toBe("high");
  });

  it("goes easy on hills and ignores flat land", () => {
    const loaded = run(blizzard, snow, blizzard, w("cool", "none"));
    expect(find(hazards("hills", loaded), "avalanche")?.level).toBe("moderate");
    expect(find(hazards("plains", loaded), "avalanche")).toBeUndefined();
    expect(find(hazards("desert", loaded), "avalanche")).toBeUndefined();
  });
});

describe("flood", () => {
  it("is moderate after two wet days and high after three downpours", () => {
    expect(find(hazards("wetland", run(w("mild", "none"), w("mild", "rain"), w("mild", "none"), w("mild", "rain")), "temperate"), "flood")?.level).toBe("moderate");
    const found = find(hazards("coast", run(w("mild", "none"), w("mild", "downpour"), w("mild", "downpour"), w("mild", "downpour")), "temperate"), "flood");
    expect(found?.level).toBe("high");
    expect(found?.reason).toBe("three days of downpour");
  });

  it("is high for a downpour on melting snow", () => {
    const found = find(hazards("plains", run(w("freezing", "snow"), w("cold", "snow"), w("cool", "none"), w("mild", "downpour")), "temperate"), "flood");
    expect(found).toMatchObject({ level: "high", reason: "downpour on top of melting snow" });
  });

  it("spares mountains, forest and desert, and a dry week", () => {
    const wet = run(w("mild", "rain"), w("mild", "downpour"), w("mild", "rain"), w("mild", "rain"));
    for (const terrain of ["mountains", "forest", "desert"] as const) expect(find(hazards(terrain, wet, "temperate"), "flood")).toBeUndefined();
    expect(find(hazards("wetland", run(w("mild", "drizzle"), w("mild", "none"), w("mild", "none")), "temperate"), "flood")).toBeUndefined();
  });
});

describe("wildfire", () => {
  const dry = (...tail: Weather[]) => run(w("warm", "none"), w("warm", "none"), w("hot", "none"), w("hot", "none"), ...tail);

  it("is high when it is hot, windy and has not rained in five days", () => {
    const found = find(hazards("forest", dry(w("scorching", "none", "strong")).slice(-5), "temperate"), "wildfire");
    expect(found?.level).toBe("high");
    expect(found?.reason).toContain("five days without rain");
  });

  it("is moderate in dry heat without wind, and absent after rain or when mild", () => {
    expect(find(hazards("plains", dry(w("hot", "none")).slice(-5), "temperate"), "wildfire")?.level).toBe("moderate");
    const rained = run(w("hot", "none"), w("hot", "rain"), w("hot", "none"), w("hot", "none"), w("hot", "none", "gale"));
    expect(find(hazards("forest", rained, "temperate"), "wildfire")).toBeUndefined();
    expect(find(hazards("forest", dry(w("mild", "none", "gale")).slice(-5), "temperate"), "wildfire")).toBeUndefined();
  });

  it("needs fuel: no fire in the desert or on a coast", () => {
    const hot = dry(w("scorching", "none", "gale")).slice(-5);
    expect(find(hazards("desert", hot, "arid"), "wildfire")).toBeUndefined();
    expect(find(hazards("coast", hot, "temperate"), "wildfire")).toBeUndefined();
  });
});

describe("hazardsOn", () => {
  it("is empty with no terrain, underground, or nothing to warn of; high comes first", () => {
    const loaded = run(w("freezing", "blizzard", "gale"), w("freezing", "snow"), w("freezing", "blizzard", "gale"), w("cool", "none"));
    expect(hazards(null, loaded)).toEqual([]);
    expect(hazardsOn(adapter, "underground", "mountains", SEED, loaded, day)).toEqual([]);
    const hills = hazards("hills", [...loaded, ...run(w("mild", "downpour")).map((p) => ({ ...p }))]);
    const levels = hills.map((h) => h.level);
    expect(levels).toEqual([...levels].sort((a, b) => Number(b === "high") - Number(a === "high")));
  });

  it("is deterministic", () => {
    expect(hazards("mountains", [])).toEqual(hazards("mountains", []));
  });
});

describe("terrainAt", () => {
  const place = (id: string, parent_id: string | null, terrain: Terrain | null): [string, TerrainPlace] => [id, { id, parent_id, terrain }];
  const places = new Map([place("world", null, null), place("range", "world", "mountains"), place("pass", "range", null), place("a", "b", null), place("b", "a", null)]);

  it("takes the nearest ancestor naming one, else none", () => {
    expect(terrainAt(places, "pass")).toBe("mountains");
    expect(terrainFrom(places, "pass")).toEqual({ terrain: "mountains", sourceId: "range" });
    expect(terrainAt(places, "world")).toBeNull();
    expect(terrainAt(places, null)).toBeNull();
    expect(terrainAt(places, "a")).toBeNull();
  });
});
