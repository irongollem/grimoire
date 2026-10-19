import { describe, expect, it } from "vitest";
import type { MapLiveDoor } from "@/types/mapLive.types";
import { doorEdgeAt, effectiveDoors, sameDoorStates, toggleDoor } from "./doors";

const drawn: MapLiveDoor[] = [
  { edge: "3,2:N", open: false, leaf: null },
  { edge: "5,4:W", open: true, leaf: { url: "leaf.png", hingeX: 0, hingeY: 0.5, openDegrees: 90 } },
];

describe("effectiveDoors", () => {
  it("keeps the drawn state with no overrides", () => {
    expect(effectiveDoors(drawn, [])).toEqual(drawn);
  });

  it("applies an override by edge and ignores unknown edges", () => {
    const out = effectiveDoors(drawn, [
      { edge: "3,2:N", open: true },
      { edge: "9,9:W", open: true },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].open).toBe(true);
    expect(out[1].open).toBe(true);
    expect(out[0].leaf).toBeNull();
  });
});

describe("doorEdgeAt", () => {
  it("finds the nearest edge midpoint within reach", () => {
    expect(doorEdgeAt(drawn, 3.5, 2.1)).toBe("3,2:N");
    expect(doorEdgeAt(drawn, 5.1, 4.5)).toBe("5,4:W");
  });

  it("is null when nothing is within reach", () => {
    expect(doorEdgeAt(drawn, 3.5, 3.4)).toBeNull();
    expect(doorEdgeAt([], 3.5, 2)).toBeNull();
  });
});

describe("toggleDoor", () => {
  it("adds an override that flips the drawn state", () => {
    expect(toggleDoor(drawn, [], "3,2:N")).toEqual([{ edge: "3,2:N", open: true }]);
  });

  it("drops the override when the door goes back to its drawn state", () => {
    const once = toggleDoor(drawn, [], "3,2:N");
    expect(toggleDoor(drawn, once, "3,2:N")).toEqual([]);
  });

  it("returns a new array and leaves other overrides alone", () => {
    const start = [{ edge: "5,4:W", open: false }];
    const next = toggleDoor(drawn, start, "3,2:N");
    expect(next).not.toBe(start);
    expect(next).toEqual([
      { edge: "5,4:W", open: false },
      { edge: "3,2:N", open: true },
    ]);
  });

  it("ignores an edge that is not a door", () => {
    expect(toggleDoor(drawn, [], "0,0:N")).toEqual([]);
  });
});

describe("sameDoorStates", () => {
  it("compares by content and order", () => {
    expect(sameDoorStates([{ edge: "a", open: true }], [{ edge: "a", open: true }])).toBe(true);
    expect(sameDoorStates([{ edge: "a", open: true }], [{ edge: "a", open: false }])).toBe(false);
    expect(sameDoorStates([], [{ edge: "a", open: true }])).toBe(false);
  });
});
