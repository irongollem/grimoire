import { describe, expect, it } from "vitest";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";
import { drawnRing, enclosingRing, ringPathD, usableRing } from "./regionShape";

const region = (over: Partial<LocationMapRegion>): LocationMapRegion =>
  ({ id: "r", region_role: "space", cells: [], vertices: null, ...over }) as LocationMapRegion;
const square = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

describe("drawnRing", () => {
  it("is the room's own outline, unless a stroke in flight has replaced its squares", () => {
    const room = region({ vertices: square(0, 0, 2, 2) });
    expect(drawnRing(room, undefined)).toEqual(square(0, 0, 2, 2));
    expect(drawnRing(room, new Map([["r", ["0,0"]]]))).toBeNull();
  });

  it("is nothing for a region of squares, or a ring too short to be a shape", () => {
    expect(drawnRing(region({}), undefined)).toBeNull();
    expect(usableRing([[0, 0], [1, 1]])).toBeNull();
  });
});

describe("enclosingRing", () => {
  const big = region({ id: "big", vertices: square(0, 0, 10, 10) });
  const small = region({ id: "small", vertices: square(1, 1, 4, 4) });

  it("picks the smallest room that holds every square of the zone", () => {
    expect(enclosingRing(["2,2", "3,3"], { id: "z" }, [big, small])).toEqual(small.vertices);
  });

  it("is null when one square pokes outside the room, so a zone straddling two rooms is not cut to either", () => {
    expect(enclosingRing(["2,2", "7,7"], { id: "z" }, [small])).toBeNull();
  });

  it("never clips a region to itself", () => {
    expect(enclosingRing(["2,2"], { id: "small" }, [small])).toBeNull();
  });

  it("ignores a zone's own ring: only a room clips", () => {
    expect(enclosingRing(["2,2"], { id: "z" }, [{ ...small, region_role: "zone" }])).toBeNull();
  });
});

it("writes a ring as one closed SVG path", () => {
  expect(ringPathD([[0, 0], [2, 0], [1, 2]])).toBe("M0 0 L2 0 L1 2 Z");
});
