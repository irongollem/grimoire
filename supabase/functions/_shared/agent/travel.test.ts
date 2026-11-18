import { describe, expect, it } from "vitest";
import type { Road } from "../../../../src/lib/travel/roads.ts";
import { parseTravel, travelAnswer, type TravelMap } from "./travel.ts";

const id = (n: number): string => `00000000-0000-4000-8000-00000000000${n}`;
const [NEVERWINTER, PHANDALIN, LEILON, INN, ISLAND] = [1, 2, 3, 4, 5].map(id);
const road = (n: number, a: string, b: string, distance: number, unit: Road["unit"] = "mi"): Road => ({ id: `r${n}`, from_location_id: a, to_location_id: b, distance, unit, name: "", going: "road" });
const map: TravelMap = {
  places: [
    { id: NEVERWINTER, name: "Neverwinter", parentId: null },
    { id: LEILON, name: "Leilon", parentId: null },
    { id: PHANDALIN, name: "Phandalin", parentId: null },
    { id: INN, name: "The Stonehill Inn", parentId: PHANDALIN },
    { id: ISLAND, name: "The Isle", parentId: null },
  ],
  roads: [road(1, NEVERWINTER, LEILON, 24), road(2, LEILON, PHANDALIN, 36)],
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
    expect(parseTravel({ to_place_id: PHANDALIN })).toEqual({ ok: true, value: { toPlaceId: PHANDALIN, paceId: "normal" } });
    expect(parseTravel({ to_place_id: PHANDALIN, pace: "slow" })).toEqual({ ok: true, value: { toPlaceId: PHANDALIN, paceId: "slow" } });
  });

  // Bug caught: a name or a pace of the model's own invention passed on to the rules.
  it("refuses what is not an id or not a pace", () => {
    expect(parseTravel({ to_place_id: "Phandalin" }).ok).toBe(false);
    expect(parseTravel({ to_place_id: PHANDALIN, pace: "galloping" }).ok).toBe(false);
  });
});
