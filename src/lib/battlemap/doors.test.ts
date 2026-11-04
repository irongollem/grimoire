import { describe, expect, it } from "vitest";
import type { MapLiveDoor } from "@/types/mapLive.types";
import { doorAt, effectiveDoors, sameDoorStates } from "./doors";

const drawn: MapLiveDoor[] = [
  { id: "3,2:N", a: [3, 2], b: [4, 2], open: false, leaf: null },
  { id: "5,4:W", a: [5, 4], b: [5, 5], open: true, leaf: { url: "leaf.png", hingeX: 0, hingeY: 0.5, openDegrees: 90 } },
];

describe("effectiveDoors", () => {
  it("keeps the drawn state with no overrides", () => {
    expect(effectiveDoors(drawn, [])).toEqual(drawn);
  });

  it("applies an override by id and ignores unknown ids", () => {
    const out = effectiveDoors(drawn, [
      { id: "3,2:N", open: true },
      { id: "9,9:W", open: true },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].open).toBe(true);
    expect(out[1].open).toBe(true);
    expect(out[0].leaf).toBeNull();
  });
});

describe("doorAt", () => {
  it("finds the door whose segment is nearest the point within reach", () => {
    expect(doorAt(drawn, 3.5, 2.1)).toBe("3,2:N");
    expect(doorAt(drawn, 5.1, 4.5)).toBe("5,4:W");
  });

  it("is null when nothing is within reach", () => {
    expect(doorAt(drawn, 3.5, 3.4)).toBeNull();
    expect(doorAt([], 3.5, 2)).toBeNull();
  });
});

describe("doorAt on angled doors", () => {
  // #1125 decision 5: reach is the distance to the segment, so a click along a long or slanted door lands on it.
  const slanted: MapLiveDoor[] = [{ id: "s1", a: [2, 2], b: [6, 6], open: false, leaf: null }];

  it("hits anywhere along the segment, not just near its middle", () => {
    expect(doorAt(slanted, 5.8, 5.8)).toBe("s1");
    expect(doorAt(slanted, 2.1, 2.1)).toBe("s1");
  });

  it("misses past either end of the segment", () => {
    expect(doorAt(slanted, 7, 7)).toBeNull();
    expect(doorAt(slanted, 4, 2.5)).toBeNull();
  });

  it("picks the nearer of two doors", () => {
    const two: MapLiveDoor[] = [
      { id: "far", a: [0, 0], b: [4, 0], open: false, leaf: null },
      { id: "near", a: [0, 1], b: [4, 1], open: false, leaf: null },
    ];
    expect(doorAt(two, 2, 0.7)).toBe("near");
  });
});

describe("sameDoorStates", () => {
  it("compares by content and order", () => {
    expect(sameDoorStates([{ id: "a", open: true }], [{ id: "a", open: true }])).toBe(true);
    expect(sameDoorStates([{ id: "a", open: true }], [{ id: "a", open: false }])).toBe(false);
    expect(sameDoorStates([], [{ id: "a", open: true }])).toBe(false);
  });
});
