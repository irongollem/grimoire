import { describe, expect, it } from "vitest";
import { timeOfTravelHours } from "./travelPace";
import {
  baseMph, campaignTerrains, campaignWays, legTravelHours, paceFactor, TERRAIN_PRESETS, terrainMultiplier, WAY_PRESETS,
  type TimedLeg, type TravelContext, type WayOfTravel,
} from "./travelSpeed";

const preset = (key: string): WayOfTravel => {
  const found = WAY_PRESETS.find((w) => w.key === key);
  if (!found) throw new Error(key);
  return found;
};
const ctx = (way: WayOfTravel, over: Partial<TravelContext> = {}): TravelContext => ({
  paceId: "normal", way, terrains: TERRAIN_PRESETS, companionSpeed: () => null, ...over,
});
const leg = (miles: number, terrain = "road", going: TimedLeg["going"] = "road"): TimedLeg => ({ miles, terrain, going });
/** Miles an hour a way makes on a terrain at a pace: what a DM would read off the table. */
const mphOn = (terrain: string, c: TravelContext): number => 10 / (legTravelHours(leg(10, terrain), c) ?? Number.NaN);

describe("the formula reproduces the books", () => {
  // PHB "Travel Pace": 18 / 24 / 30 miles a day. Bug caught: a pace factor off the per-day column.
  it("gives a 30 ft walker the PHB's miles a day at each pace", () => {
    for (const [pace, miles] of [["slow", 18], ["normal", 24], ["fast", 30]] as const) {
      expect(timeOfTravelHours(legTravelHours(leg(miles), ctx(preset("on_foot"), { paceId: pace })) ?? 0)).toMatchObject({ days: 1, hours: 0 });
    }
    expect(paceFactor("slow")).toBe(0.75);
  });

  // PHB "Difficult Terrain": half the distance a day.
  it("halves a day's distance over difficult going", () => {
    expect(legTravelHours(leg(24, "difficult"), ctx(preset("on_foot")))).toBeCloseTo(16);
  });

  // Rime of the Frostmaiden, Overland Travel: dogsled 1 mile an hour, snowshoes 1/2, on foot 1/4. Bug caught: the
  // book's order (walking < snowshoes < sled) lost, or snow read as plain difficult going.
  it("gives the Frostmaiden's speeds over snow", () => {
    expect(mphOn("snow", ctx(preset("dogsled")))).toBeCloseTo(1);
    expect(mphOn("snow", ctx(preset("snowshoes")))).toBeCloseTo(0.5);
    expect(mphOn("snow", ctx(preset("on_foot")))).toBeCloseTo(0.25);
  });

  // PHB "Mounts and Vehicles": a galley goes 4 mph. Bug caught: a ship slowed by the pace or the terrain, or
  // sailing the land legs of the way.
  it("sails a ship at its own speed on the water legs, round the clock when its crew does, and walks the land", () => {
    const galley = preset("galley");
    expect(legTravelHours(leg(32, "road", "sea"), ctx(galley, { paceId: "slow" }))).toBeCloseTo(8);
    expect(legTravelHours(leg(96, "road", "sea"), ctx({ ...galley, throughTheNight: true }))).toBeCloseTo(8);
    expect(legTravelHours(leg(24, "road", "road"), ctx(galley))).toBeCloseTo(8);
  });
});

describe("a mount or a puller brings its own speed", () => {
  const sledByBeak: WayOfTravel = { ...preset("dogsled"), key: "beak_sled", name: "Dogsled (axe beak)", speedFeet: null, companionId: "beak" };
  const beakSpeed = (id: string) => (id === "beak" ? 50 : null);

  // The maintainer's case: an axe beak (speed 50) pulling a sled over snow is 5 x 1/3 mph, and at home on snow 5.
  // Bug caught: the companion's speed ignored, or "at home" not cancelling the terrain.
  it("moves a sled at its puller's speed, slowed by snow unless the puller is at home there", () => {
    expect(baseMph(sledByBeak, beakSpeed)).toBe(5);
    expect(mphOn("snow", ctx(sledByBeak, { companionSpeed: beakSpeed }))).toBeCloseTo(5 / 3);
    expect(mphOn("snow", ctx({ ...sledByBeak, atHome: ["snow"] }, { companionSpeed: beakSpeed }))).toBeCloseTo(5);
  });

  // Bug caught: a way whose companion was dismissed travelling at some made-up speed.
  it("cannot be travelled once its companion is gone", () => {
    expect(legTravelHours(leg(10), ctx(sledByBeak))).toBeNull();
  });

  // Riders sink like walkers; a sled and a flyer do not. Bug caught: a horse crossing deep snow as fast as a sled.
  it("lets a mount sink into snow, but not a sled or a flyer", () => {
    const snow = TERRAIN_PRESETS.find((t) => t.key === "snow");
    expect(terrainMultiplier({ ...preset("on_foot"), kind: "ride" }, snow)).toBeCloseTo(1 / 12);
    expect(terrainMultiplier(preset("dogsled"), snow)).toBeCloseTo(1 / 3);
    expect(terrainMultiplier(preset("airship"), snow)).toBe(1);
  });
});

describe("a campaign's own numbers", () => {
  // Bug caught: an override added as a second terrain beside the preset rather than replacing it.
  it("lays a campaign's rows over the presets by key and adds its own after", () => {
    const terrains = campaignTerrains([{ key: "snow", name: "Deep snow", factor: 0.25, sink: 0.5 }, { key: "ash", name: "Ash waste", factor: 0.5, sink: 1 }]);
    expect(terrains.filter((t) => t.key === "snow")).toEqual([{ key: "snow", name: "Deep snow", factor: 0.25, sink: 0.5, source: null }]);
    expect(terrains.at(-1)?.key).toBe("ash");
    const ways = campaignWays([{ key: "galley", name: "The Sea Hag", kind: "water", speed_feet: null, mph: 5, companion_id: null, at_home: [], sink: {}, through_the_night: true }]);
    expect(ways.filter((w) => w.key === "galley").map((w) => [w.name, w.mph, w.throughTheNight])).toEqual([["The Sea Hag", 5, true]]);
    expect(ways).toHaveLength(WAY_PRESETS.length);
  });
});

describe("a creature's travel traits", () => {
  const traits = (over: Record<string, unknown> = {}) => ({ ridden: true, pulls: true, at_home: ["snow"], ...over });

  // Bug caught: a malformed bestiary row (a missing flag, a string list) read as a mount.
  it("reads the bestiary's traits only when they are whole", async () => {
    const { beastTravelOf } = await import("./travelSpeed");
    expect(beastTravelOf(traits())).toEqual({ ridden: true, pulls: true, at_home: ["snow"] });
    expect(beastTravelOf({ ridden: true, at_home: [] })).toBeNull();
    expect(beastTravelOf(null)).toBeNull();
  });

  // The maintainer's axe beak: picked for a sled it stays a sled (it pulls), at home on snow; a griffon picked for a
  // new way flies. Bug caught: the DM's sled turned into a ridden mount, or a griffon flying at its walking pace.
  it("suggests the way a creature can travel, keeping what the DM chose when the creature can do it", async () => {
    const { suggestWay } = await import("./travelSpeed");
    expect(suggestWay(traits(), false, "vehicle")).toEqual({ kind: "vehicle", atHome: ["snow"] });
    expect(suggestWay(traits({ pulls: false, at_home: [] }), true, "foot")).toEqual({ kind: "air", atHome: [] });
    expect(suggestWay(traits({ ridden: false }), false, "ride")).toEqual({ kind: "vehicle", atHome: ["snow"] });
  });

  // Bug caught: a flying mount's companion speed asked for its walking speed.
  it("asks a companion for its fly speed when the way flies", () => {
    const asked: string[] = [];
    baseMph({ ...preset("airship"), mph: null, companionId: "griffon" }, (_id, kind) => {
      asked.push(kind);
      return 80;
    });
    expect(asked).toEqual(["air"]);
  });
});

describe("a creature's line on the sheet", () => {
  // Bug caught: a griffon shown as merely "can be ridden", or a creature nobody rides given a line at all.
  it("says what the bestiary marks, a flyer as a flying mount, and nothing for an unmarked creature", async () => {
    const { creatureOnTheRoad } = await import("./travelSpeed");
    expect(creatureOnTheRoad({ travel: { ridden: true, pulls: true, at_home: ["snow"] }, stat_block: { speed: "50 ft." } })).toBe("Can be ridden, pulls a load, at home on snow");
    expect(creatureOnTheRoad({ travel: { ridden: true, pulls: false, at_home: [] }, stat_block: { speed: "30 ft., fly 80 ft." } })).toBe("A flying mount");
    expect(creatureOnTheRoad({ travel: null, stat_block: { speed: "30 ft." } })).toBe("");
  });
});
