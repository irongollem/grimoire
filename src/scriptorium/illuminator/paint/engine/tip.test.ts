import { describe, expect, it } from "vitest";
import { makeDab } from "./tip";
import type { PaintAssets } from "./types";

const none: PaintAssets = { tip: () => undefined, grain: () => undefined };
const round = (h: number) => ({ kind: "round", hardness: h }) as const;

describe("makeDab", () => {
  // Fails if the hard tip has no solid core or leaks coverage outside its radius.
  it("a hard round tip is solid inside and empty outside", () => {
    const d = makeDab(round(1), none, 50, 50, 20, 0, 1, false, false);
    expect(d?.cover(50, 50)).toBe(1);
    expect(d?.cover(70, 50)).toBe(0);
    expect(d?.cover(20, 50)).toBe(0);
  });

  // Fails if hardness 0 is treated as hard: soft tips must fall off smoothly toward the edge.
  it("a soft tip falls off between centre and edge", () => {
    const d = makeDab(round(0), none, 50, 50, 40, 0, 1, false, false);
    const mid = d?.cover(60, 50) ?? 0;
    expect(mid).toBeGreaterThan(0.05);
    expect(mid).toBeLessThan(0.95);
    expect(d?.cover(50, 50)).toBeGreaterThan(0.95);
  });

  // Fails if roundness squashes the wrong axis or ignores the angle.
  it("roundness squashes across the angle, and the angle turns it", () => {
    const flat = makeDab(round(1), none, 50, 50, 40, 0, 0.25, false, false);
    expect(flat?.cover(65, 50)).toBe(1);
    expect(flat?.cover(50, 65)).toBe(0);
    const turned = makeDab(round(1), none, 50, 50, 40, 90, 0.25, false, false);
    expect(turned?.cover(50, 65)).toBe(1);
    expect(turned?.cover(65, 50)).toBe(0);
  });

  // Fails if the bounding box is smaller than the dab, clipping paint at the edges.
  it("bounds contain every pixel with coverage", () => {
    const d = makeDab(round(0.3), none, 50.4, 49.7, 31, 33, 0.5, false, false);
    if (!d) throw new Error("no dab");
    for (let y = d.minY - 5; y < d.maxY + 5; y++) for (let x = d.minX - 5; x < d.maxX + 5; x++) {
      if (x < d.minX || x >= d.maxX || y < d.minY || y >= d.maxY) expect(d.cover(x, y)).toBe(0);
    }
  });

  // Fails if an image tip is not mapped into tip space, or flip does nothing.
  it("image tips sample the asset and honour flip", () => {
    // 4x2 tip: left half solid.
    const img = { width: 4, height: 2, alpha: new Uint8Array([255, 255, 0, 0, 255, 255, 0, 0]) };
    const assets: PaintAssets = { tip: (id) => (id === "t" ? img : undefined), grain: () => undefined };
    const src = { kind: "image", id: "t" } as const;
    const d = makeDab(src, assets, 50, 50, 40, 0, 1, false, false);
    expect(d?.cover(42, 50)).toBeGreaterThan(0.9);
    expect(d?.cover(58, 50)).toBeLessThan(0.1);
    const f = makeDab(src, assets, 50, 50, 40, 0, 1, true, false);
    expect(f?.cover(42, 50)).toBeLessThan(0.1);
    expect(f?.cover(58, 50)).toBeGreaterThan(0.9);
  });

  // Fails if a missing asset throws or paints something instead of skipping the dab.
  it("an unknown image tip makes no dab", () => {
    expect(makeDab({ kind: "image", id: "nope" }, none, 0, 0, 10, 0, 1, false, false)).toBeNull();
  });
});
