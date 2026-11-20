import { describe, expect, it } from "vitest";
import type { Road } from "../../../../src/lib/travel/roads.ts";
import { campaignTerrains, campaignWays } from "../../../../src/rules/travelSpeed.ts";
import { parseTravel, travelAnswer, type TravelMap } from "./travel.ts";

const id = (n: number): string => `00000000-0000-4000-8000-00000000000${n}`;
const [NEVERWINTER, PHANDALIN, LEILON, INN, ISLAND] = [1, 2, 3, 4, 5].map(id);
const road = (n: number, a: string, b: string, distance: number, unit: Road["unit"] = "mi"): Road => ({ id: `r${n}`, from_location_id: a, to_location_id: b, distance, unit, name: "", going: "road", terrain: "road", roll_table_id: null });
const map: TravelMap = {
  places: [
    { id: NEVERWINTER, name: "Neverwinter", parentId: null },
    { id: LEILON, name: "Leilon", parentId: null },
    { id: PHANDALIN, name: "Phandalin", parentId: null },
    { id: INN, name: "The Stonehill Inn", parentId: PHANDALIN },
    { id: ISLAND, name: "The Isle", parentId: null },
  ],
  roads: [road(1, NEVERWINTER, LEILON, 24), road(2, LEILON, PHANDALIN, 36)],
  tables: [],
  roadTables: [],
  food: null,
  terrains: campaignTerrains([]),
  ways: campaignWays([]),
  companionSpeed: () => null,
};

describe("travelAnswer", () => {
  // PHB 2014 "Travel Pace": 24 miles a day at a normal pace. 60 miles is two days and a half: 2 days, 4 hours.
  // Bug caught: a distance or a number of days of the narrator's own, where the campaign's roads say otherwise.
  it("tells the distance along the roads, the time at the pace, the places passed and the nights out", () => {
    const { content, isError } = travelAnswer(NEVERWINTER, PHANDALIN, "normal", map);
    expect(isError).toBe(false);
    expect(content).toContain("By road from Neverwinter to Phandalin: 60 mi, 2 days, 4 hours");
    expect(content).toContain("3 days on the calendar");
    expect(content).toContain("The road passes Leilon.");
    expect(content).toContain("2 nights on the road.");
    expect(content).toContain(`call pass_days with 3 and go_to with ${PHANDALIN}`);
  });

  // PHB "Travel Pace": difficult terrain halves a day's distance. 24 mi of easy road plus 36 mi of difficult going
  // is 1 day + 3 days of travel at 24 mi a day. Bug caught: the narrator told a mountain pass is as quick as a road.
  it("counts difficult going at half the distance a day, and says how much of the way it is", () => {
    const hard = { ...map, roads: [road(1, NEVERWINTER, LEILON, 24), { ...road(2, LEILON, PHANDALIN, 36), terrain: "difficult" }] };
    const { content } = travelAnswer(NEVERWINTER, PHANDALIN, "normal", hard);
    expect(content).toContain("60 mi, 4 days of travel");
    expect(content).toContain("36 mi of difficult going, which slows travel.");
    expect(travelAnswer(NEVERWINTER, PHANDALIN, "normal", map).content).not.toContain("difficult going");
  });

  // Rime of the Frostmaiden, Overland Travel: a dogsled over snow goes 1 mph. 24 mi of snow is 24 hours, 3 travel days.
  // Bug caught: the narrator told a sled crosses snow as fast as a road, or the way never reaching the time.
  it("times snow by the way chosen: the dogsled preset at 1 mph, and on foot slower", () => {
    const snowy = { ...map, roads: [{ ...road(1, NEVERWINTER, LEILON, 24), terrain: "snow" }] };
    const sled = travelAnswer(NEVERWINTER, LEILON, "normal", snowy, "dogsled").content;
    expect(sled).toContain("24 mi, 3 days of travel");
    expect(sled).toContain("24 mi of snow, which slows travel.");
    expect(sled).toContain("They travel by dogsled.");
    expect(travelAnswer(NEVERWINTER, LEILON, "normal", snowy).content).toContain("24 mi, 12 days of travel");
  });

  // A campaign's axe beak pulls the sled at home on snow: 50 ft is 5 mph. 40 mi of snow is 8 hours, one travel day.
  // Bug caught: a companion-pulled way timed at the terrain's slowing, or its speed not read from the companion.
  it("times a way a companion pulls by the companion's speed, unslowed on the ground it is at home on", () => {
    const beak = { ...map, ways: campaignWays([{ key: "beak_sled", name: "Dogsled (axe beak)", kind: "vehicle", speed_feet: null, mph: null, companion_id: "c1", at_home: ["snow"], sink: {}, through_the_night: false }]), companionSpeed: (c: string) => (c === "c1" ? 50 : null) };
    const snowy = { ...beak, roads: [{ ...road(1, NEVERWINTER, LEILON, 40), terrain: "snow" }] };
    const { content } = travelAnswer(NEVERWINTER, LEILON, "normal", snowy, "beak_sled");
    expect(content).toContain("40 mi, 1 day of travel");
    expect(content).toContain("Dogsled (axe beak) (way: beak_sled)");
  });

  // Bug caught: a made-up way key silently walked, or one the party cannot move by offered to the narrator.
  it("refuses an unknown way naming the known ones, and offers only ways that can move", () => {
    const refused = travelAnswer(NEVERWINTER, LEILON, "normal", map, "hovercraft");
    expect(refused.isError).toBe(true);
    expect(refused.content).toContain("dogsled");
    const orphan = { ...map, ways: campaignWays([{ key: "mount", name: "Mount", kind: "ride", speed_feet: null, mph: null, companion_id: "gone", at_home: [], sink: {}, through_the_night: false }]) };
    expect(travelAnswer(NEVERWINTER, LEILON, "normal", orphan).content).not.toContain("way: mount");
    expect(travelAnswer(NEVERWINTER, LEILON, "normal", map).content).toContain("(way: dogsled)");
  });

  // Bug caught: the DM's own encounter table for a town on the road never offered, so every chance meeting is invented.
  it("lists the campaign's tables for the places the road touches, and none when it keeps none", () => {
    const withTable = { ...map, tables: [{ id: "t1", name: "Mere of Dead Men", dice: "1d12", entries: [], placeId: LEILON }] };
    expect(travelAnswer(NEVERWINTER, PHANDALIN, "normal", withTable).content).toContain("\"Mere of Dead Men\" (1d12, table_id t1) for Leilon");
    expect(travelAnswer(NEVERWINTER, PHANDALIN, "normal", map).content).not.toContain("Tables the campaign keeps");
  });

  // Bug caught: the table a road names as its own never offered on that road; or offered on a journey that does
  // not take it.
  it("lists a road's own table for a journey along that road, before the places' tables, and on no other road", () => {
    const own = { ...map, roadTables: [{ roadId: "r2", table: { id: "t2", name: "The Triboar Trail", dice: "1d8", entries: [] } }], tables: [{ id: "t1", name: "Mere of Dead Men", dice: "1d12", entries: [], placeId: LEILON }] };
    const whole = travelAnswer(NEVERWINTER, PHANDALIN, "normal", own).content;
    expect(whole).toContain("\"The Triboar Trail\" (1d8, table_id t2) for the road from Leilon to Phandalin; \"Mere of Dead Men\"");
    expect(travelAnswer(NEVERWINTER, LEILON, "normal", own).content).not.toContain("Triboar");
  });

  // PHB 2014 "Food and Water"; PHB 2024 "Malnutrition". Three days on the calendar is three rations each.
  // Bug caught: food counted at a table that never switched the rule on; or one edition's hunger told at the other's table.
  it("says the food a journey takes only where the campaign counts food, with that edition's price for going without", () => {
    expect(travelAnswer(NEVERWINTER, PHANDALIN, "normal", map).content).not.toContain("counts food");
    const old = travelAnswer(NEVERWINTER, PHANDALIN, "normal", { ...map, food: "2014" }).content;
    expect(old).toContain("the journey takes 3 rations for each traveller");
    expect(old).toContain("3 + their Constitution modifier");
    const now = travelAnswer(NEVERWINTER, PHANDALIN, "normal", { ...map, food: "2024" }).content;
    expect(now).toContain("end of the fifth day");
    expect(now).not.toContain("Constitution modifier");
  });

  // Bug caught: a party in a room of a town told it has no road, because only the town is on one.
  it("starts from the town the party's room is in, and says the place asked for when it arrives", () => {
    const { content } = travelAnswer(INN, NEVERWINTER, "normal", map);
    expect(content).toContain("By road from Phandalin to Neverwinter: 60 mi");
  });

  // PHB 2014 "Travel Pace": 30 miles a day at a fast pace, so 24 miles is under a day.
  it("has no night on the road for a journey of under a day", () => {
    expect(travelAnswer(NEVERWINTER, LEILON, "fast", map).content).toContain("no night on the road");
  });

  // Bug caught: no road read as no distance at all, or worse as zero, so the narrator invents one or arrives at once.
  it("says the roads do not say, and forbids a made-up number, when no chain of roads joins the two", () => {
    const { content, isError } = travelAnswer(NEVERWINTER, ISLAND, "normal", map);
    expect(isError).toBe(false);
    expect(content).toContain("do not say how far");
    expect(content).not.toMatch(/\d+ mi/);
  });

  // Bug caught: a walk across town told as a journey of no miles and no days.
  it("tells no journey to a place inside the town the party is in", () => {
    expect(travelAnswer(PHANDALIN, INN, "normal", map).content).toContain("there is no journey to tell");
  });

  // Bug caught: an id from another campaign, or a made-up one, answered as if it were a place.
  it("refuses a place that is not of this campaign, and a party that is nowhere", () => {
    expect(travelAnswer(NEVERWINTER, id(9), "normal", map).isError).toBe(true);
    expect(travelAnswer(null, PHANDALIN, "normal", map).isError).toBe(true);
  });
});

describe("parseTravel", () => {
  it("takes a place and travels at a normal pace unless told otherwise", () => {
    expect(parseTravel({ to_place_id: PHANDALIN })).toEqual({ ok: true, value: { toPlaceId: PHANDALIN, paceId: "normal", wayKey: null } });
    expect(parseTravel({ to_place_id: PHANDALIN, pace: "slow" })).toEqual({ ok: true, value: { toPlaceId: PHANDALIN, paceId: "slow", wayKey: null } });
  });

  // Bug caught: a name or a pace of the model's own invention passed on to the rules.
  it("refuses what is not an id or not a pace", () => {
    expect(parseTravel({ to_place_id: "Phandalin" }).ok).toBe(false);
    expect(parseTravel({ to_place_id: PHANDALIN, pace: "galloping" }).ok).toBe(false);
    expect(parseTravel({ to_place_id: PHANDALIN, way: "dogsled" })).toEqual({ ok: true, value: { toPlaceId: PHANDALIN, paceId: "normal", wayKey: "dogsled" } });
    expect(parseTravel({ to_place_id: PHANDALIN, way: 3 }).ok).toBe(false);
  });
});
