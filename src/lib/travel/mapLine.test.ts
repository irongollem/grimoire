import { describe, expect, it } from "vitest";
import type { MapPin, MapScale } from "@/types/location.types";
import { TERRAIN_PRESETS, WAY_PRESETS, type TravelContext } from "@/rules/travelSpeed";
import { journeyByMap, sharedMapOf } from "./mapLine";

const travel = (wayKey = "on_foot"): TravelContext => ({ paceId: "normal", way: WAY_PRESETS.find((w) => w.key === wayKey)!, terrains: TERRAIN_PRESETS, companionSpeed: () => null });
const openLand = { terrain: "open", winding: 1 };

// A region holding two towns; an inn stands inside the first town.
const PARENTS: Record<string, string | null> = { region: null, brightwater: "region", saltmarsh: "region", inn: "brightwater", elsewhere: null };
const parentOf = (id: string): string | null => PARENTS[id] ?? null;

const pin = (id: string, x: number, y: number): MapPin => ({ child_location_id: id, child_name: `Name of ${id}`, child_type: "city", child_image_url: null, x, y, visible_to_players: true });
// The scale's reference crosses the whole width and stands for 100 miles; the picture is 1000 by 500 pixels.
const scale: MapScale = { unit: "mi", distance: 100, a: { x: 0, y: 0.5 }, b: { x: 1, y: 0.5 } };
const size = { width: 1000, height: 500 };

describe("sharedMapOf", () => {
  it("is the nearest place both lie inside, with each end's own branch below it", () => {
    expect(sharedMapOf("inn", "saltmarsh", parentOf)).toEqual({ mapId: "region", fromBranch: ["inn", "brightwater"], toBranch: ["saltmarsh"] });
  });

  // Bug caught: a room measured against the town it stands in, as if the party had a journey to make to where it is.
  it("is nothing when one place lies inside the other", () => {
    expect(sharedMapOf("inn", "brightwater", parentOf)).toBeNull();
    expect(sharedMapOf("brightwater", "inn", parentOf)).toBeNull();
  });

  it("is nothing for places that share no place", () => {
    expect(sharedMapOf("inn", "elsewhere", parentOf)).toBeNull();
  });
});

describe("journeyByMap", () => {
  const shared = { mapId: "region", fromBranch: ["inn", "brightwater"], toBranch: ["saltmarsh"] };

  // Working: the pins are 0.4 of the width apart, 400 of 1000 pixels, and 1000 pixels are 100 miles: 40 miles.
  // Bug caught: the party in an inn measured from nowhere because the inn itself has no pin on the region's map.
  it("measures between the pins that stand for the two ends, the town's for a room inside it", () => {
    const journey = journeyByMap({ shared, pins: [pin("brightwater", 0.2, 0.5), pin("saltmarsh", 0.6, 0.5)], scale, size, travel: travel(), openLand });
    expect(journey?.summary.distance).toBeCloseTo(40, 6);
    expect(journey?.summary).toMatchObject({ unit: "mi", from: { id: "brightwater" }, to: { id: "saltmarsh" } });
  });

  // Bug caught: a distance invented for a map nobody gave a scale, or before its picture's size is known.
  it("measures nothing without a scale or the picture's size", () => {
    const pins = [pin("brightwater", 0.2, 0.5), pin("saltmarsh", 0.6, 0.5)];
    expect(journeyByMap({ shared, pins, scale: null, size, travel: travel(), openLand })).toBeNull();
    expect(journeyByMap({ shared, pins, scale, size: null, travel: travel(), openLand })).toBeNull();
  });

  // Bug caught: a missing pin read as the map's corner, giving a confident wrong distance.
  it("measures nothing when an end has no pin on the map", () => {
    expect(journeyByMap({ shared, pins: [pin("brightwater", 0.2, 0.5)], scale, size, travel: travel(), openLand })).toBeNull();
  });

  // The pins are 40 miles apart. With "Off the Road" the line winds by 1.5: 60 miles, over difficult open land at half
  // speed: 120 mile-equivalents, 5 travel days at 24 a day.
  // Bug caught: the winding applied to the distance but the ground left plain (or the reverse).
  it("lengthens the line by the winding and crosses the campaign's open land", () => {
    const pins = [pin("brightwater", 0.2, 0.5), pin("saltmarsh", 0.6, 0.5)];
    const off = journeyByMap({ shared, pins, scale, size, travel: travel(), openLand: { terrain: "difficult", winding: 1.5 } })!;
    expect(off.summary.distance).toBeCloseTo(60, 6);
    expect(off.summary.time).toMatchObject({ days: 5, hours: 0 });
    expect(off).toMatchObject({ offRoad: true, grounds: [{ terrain: "difficult", distance: expect.closeTo(60, 6) }] });
    const plain = journeyByMap({ shared, pins, scale, size, travel: travel(), openLand })!;
    expect(plain).toMatchObject({ offRoad: false, grounds: [] });
    expect(plain.summary.time.calendarDays).toBe(2);
  });

  // Decision 10: flying ignores the ground. The airship's 8 mph over 40 miles is 5 hours, however the land lies and
  // whatever the winding says. Bug caught: a flyer's line lengthened and slowed like a walker's over difficult land.
  it("takes a flyer along the straight line with no winding and no ground", () => {
    const pins = [pin("brightwater", 0.2, 0.5), pin("saltmarsh", 0.6, 0.5)];
    const flown = journeyByMap({ shared, pins, scale, size, travel: travel("airship"), openLand: { terrain: "difficult", winding: 1.5 } })!;
    expect(flown.summary.distance).toBeCloseTo(40, 6);
    expect(flown.summary.time).toMatchObject({ days: 0, hours: 5 });
    expect(flown).toMatchObject({ offRoad: false, grounds: [] });
  });
});
