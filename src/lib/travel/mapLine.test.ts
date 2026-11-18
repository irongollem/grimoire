import { describe, expect, it } from "vitest";
import type { MapPin, MapScale } from "@/types/location.types";
import { journeyByMap, sharedMapOf } from "./mapLine";

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
    const journey = journeyByMap({ shared, pins: [pin("brightwater", 0.2, 0.5), pin("saltmarsh", 0.6, 0.5)], scale, size, paceId: "normal" });
    expect(journey?.summary.distance).toBeCloseTo(40, 6);
    expect(journey?.summary).toMatchObject({ unit: "mi", from: { id: "brightwater" }, to: { id: "saltmarsh" } });
  });

  // Bug caught: a distance invented for a map nobody gave a scale, or before its picture's size is known.
  it("measures nothing without a scale or the picture's size", () => {
    const pins = [pin("brightwater", 0.2, 0.5), pin("saltmarsh", 0.6, 0.5)];
    expect(journeyByMap({ shared, pins, scale: null, size, paceId: "normal" })).toBeNull();
    expect(journeyByMap({ shared, pins, scale, size: null, paceId: "normal" })).toBeNull();
  });

  // Bug caught: a missing pin read as the map's corner, giving a confident wrong distance.
  it("measures nothing when an end has no pin on the map", () => {
    expect(journeyByMap({ shared, pins: [pin("brightwater", 0.2, 0.5)], scale, size, paceId: "normal" })).toBeNull();
  });
});
