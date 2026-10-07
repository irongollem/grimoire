import { describe, expect, it } from "vitest";
import {
  buildMapScale,
  distanceBetween,
  distancePerPixel,
  formatDistance,
  parseMapScale,
  routeLength,
} from "@/lib/locations/mapScale";
import type { MapScale } from "@/types/location.types";

const SIZE = { width: 2000, height: 1000 };
// 0.1 .. 0.6 of the width on one row: 1000 natural pixels for 100 mi.
const SCALE: MapScale = { unit: "mi", distance: 100, a: { x: 0.1, y: 0.5 }, b: { x: 0.6, y: 0.5 } };

describe("parseMapScale", () => {
  it("accepts a well-formed scale", () => {
    expect(parseMapScale(SCALE)).toEqual(SCALE);
  });

  it.each([
    ["null", null],
    ["a string", "12 mi"],
    ["a bad unit", { ...SCALE, unit: "leagues" }],
    ["zero distance", { ...SCALE, distance: 0 }],
    ["negative distance", { ...SCALE, distance: -3 }],
    ["string distance", { ...SCALE, distance: "100" }],
    ["NaN distance", { ...SCALE, distance: Number.NaN }],
    ["a point out of range", { ...SCALE, a: { x: 1.2, y: 0.5 } }],
    ["a missing point", { unit: "mi", distance: 5, a: { x: 0, y: 0 } }],
    ["identical points", { ...SCALE, b: SCALE.a }],
  ])("reads %s as no scale", (_label, raw) => {
    expect(parseMapScale(raw)).toBeNull();
  });
});

describe("buildMapScale", () => {
  it("builds from valid input", () => {
    const result = buildMapScale({ a: SCALE.a, b: SCALE.b, distance: 100, unit: "mi" });
    expect(result).toEqual({ scale: SCALE, error: null });
  });

  it("refuses coincident points and bad distances", () => {
    expect(buildMapScale({ a: SCALE.a, b: SCALE.a, distance: 5, unit: "mi" }).error).toMatch(/different/);
    expect(buildMapScale({ a: SCALE.a, b: SCALE.b, distance: 0, unit: "mi" }).error).toMatch(/greater than zero/);
    expect(buildMapScale({ a: SCALE.a, b: SCALE.b, distance: null, unit: "km" }).error).toMatch(/greater than zero/);
  });
});

describe("distances", () => {
  it("derives distance per natural pixel from the reference", () => {
    expect(distancePerPixel(SCALE, SIZE)).toBeCloseTo(0.1, 9);
  });

  it("is null until the image has been measured", () => {
    expect(distancePerPixel(SCALE, { width: 0, height: 0 })).toBeNull();
    expect(distanceBetween({ x: 0, y: 0 }, { x: 1, y: 1 }, SCALE, { width: 0, height: 0 })).toBeNull();
  });

  it("measures the reference back to its own distance", () => {
    expect(distanceBetween(SCALE.a, SCALE.b, SCALE, SIZE)).toBeCloseTo(100, 9);
  });

  it("weighs width and height in natural pixels, not fractions", () => {
    // Same fractional step, but the map is twice as wide as tall: horizontal
    // 0.5 is 1000 px (100 mi), vertical 0.5 is 500 px (50 mi).
    expect(distanceBetween({ x: 0, y: 0 }, { x: 0.5, y: 0 }, SCALE, SIZE)).toBeCloseTo(100, 9);
    expect(distanceBetween({ x: 0, y: 0 }, { x: 0, y: 0.5 }, SCALE, SIZE)).toBeCloseTo(50, 9);
  });

  it("is independent of the image's resolution", () => {
    const double = { width: 4000, height: 2000 };
    expect(distanceBetween({ x: 0, y: 0 }, { x: 0.5, y: 0 }, SCALE, double)).toBeCloseTo(100, 9);
  });

  it("sums a polyline and gives zero for fewer than two points", () => {
    const route = [{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 0.5, y: 0.5 }];
    expect(routeLength(route, SCALE, SIZE)).toBeCloseTo(150, 9);
    expect(routeLength([{ x: 0.2, y: 0.2 }], SCALE, SIZE)).toBe(0);
    expect(routeLength([], SCALE, SIZE)).toBe(0);
  });
});

describe("formatDistance", () => {
  it("keeps a decimal for short hops and drops it for long ones", () => {
    expect(formatDistance(3.456, "mi")).toBe("3.5 mi");
    expect(formatDistance(84.4, "mi")).toBe("84 mi");
    expect(formatDistance(1234.6, "km")).toBe("1,235 km");
    expect(formatDistance(0, "mi")).toBe("0 mi");
  });
});
