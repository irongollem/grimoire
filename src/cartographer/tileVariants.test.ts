import { describe, it, expect } from "vitest";
import { hash32, pickVariant } from "./tileVariants";

describe("hash32", () => {
  it("is deterministic for known inputs", () => {
    expect(hash32("hello-world")).toBe(1116541326);
    expect(hash32("")).toBe(2166136261);
    expect(hash32("abc")).toBe(440920331);
  });

  it("returns the same value across repeated calls with the same input", () => {
    expect(hash32("map-abc-123|floor|4|9")).toBe(hash32("map-abc-123|floor|4|9"));
  });
});

// Fixed inputs shared by every case below: mapKey "map-abc-123", cell (4, 9),
// variant count 6. The expected numbers are pinned so that any change to a
// seed's shape — separator, part order, a renamed label — moves an existing
// saved map's tile art and this test fails. This is the regression guard the
// whole tileVariants/paintOps extraction exists for; see CLAUDE.md context
// and the CartographerEditorView.vue pick*Variant wrappers for the seeds
// these lock.
describe("pickVariant — seed strings locked (regression guard)", () => {
  const mapKey = "map-abc-123";
  const x = 4;
  const y = 9;
  const count = 6;

  it('pickFloorVariant seed: `${mapKey}|floor|${x}|${y}` (literal "floor")', () => {
    expect(pickVariant(mapKey, "floor", x, y, count)).toBe(0);
  });

  it('pickWallVariant seed (N side → wallSegmentH): `${mapKey}|wallSegmentH|${x}|${y}`', () => {
    expect(pickVariant(mapKey, "wallSegmentH", x, y, count)).toBe(1);
  });

  it('pickWallVariant seed (W side → wallSegmentV): `${mapKey}|wallSegmentV|${x}|${y}`', () => {
    expect(pickVariant(mapKey, "wallSegmentV", x, y, count)).toBe(5);
  });

  it('pickSolidVariant seed: `${mapKey}|solid|${x}|${y}` — literal "solid", NOT "solidBlock"', () => {
    expect(pickVariant(mapKey, "solid", x, y, count)).toBe(1);
  });

  it('pickDoorVariant seed: `${mapKey}|${category}|${x}|${y}` (category = "doorClosedH")', () => {
    expect(pickVariant(mapKey, "doorClosedH", x, y, count)).toBe(2);
  });

  it('pickObjectVariant seed: `${mapKey}|${cat}|${x}|${y}` (cat = "objectChest")', () => {
    expect(pickVariant(mapKey, "objectChest", x, y, count)).toBe(0);
  });
});

describe("pickVariant — divide-by-zero guard", () => {
  it("count 0 does not throw and returns 0", () => {
    expect(pickVariant("m", "floor", 1, 1, 0)).toBe(0);
  });

  it("count 1 always returns 0", () => {
    expect(pickVariant("m", "floor", 1, 1, 1)).toBe(0);
  });
});

describe("pickVariant — no cross-map correlation", () => {
  it("the same cell/category picks independently for different mapKeys", () => {
    const a = pickVariant("mapA", "floor", 4, 9, 6);
    const b = pickVariant("mapB", "floor", 4, 9, 6);
    expect(a).toBe(5);
    expect(b).toBe(4);
    expect(a).not.toBe(b);
  });
});
