import { describe, expect, it } from "vitest";
import type { DollAnatomy } from "@edge-shared/paperDoll/types.ts";
import { SLOT_ANCHOR_KEYS, slotAnchors } from "./slotAnchors";

const anatomy: DollAnatomy = {
  head: { x0: 216, y0: 100, x1: 296, y1: 200 },
  shoulders: { x0: 156, x1: 356, y: 220 },
  feetY: 920,
  centerX: 256,
};

describe("slotAnchors", () => {
  it("places the slots on the measured body, in percent of the cell", () => {
    const a = slotAnchors(anatomy);
    expect(a.head.x).toBeCloseTo(50);
    expect(a.head.y).toBeCloseTo(((100 + 0.35 * 100) / 1024) * 100);
    expect(a.neck.y).toBeCloseTo((200 / 1024) * 100);
    expect(a.shoulders.x).toBeCloseTo((156 / 512) * 100);
    expect(a.hands.x).toBeCloseTo((356 / 512) * 100);
    expect(a.feet.y).toBeCloseTo((890 / 1024) * 100);
    expect(a.feet.x).toBeCloseTo(50);
  });

  it("orders the slots down the body", () => {
    const a = slotAnchors(anatomy);
    expect(a.head.y).toBeLessThan(a.neck.y);
    expect(a.neck.y).toBeLessThan(a.body.y);
    expect(a.body.y).toBeLessThan(a.waist.y);
    expect(a.waist.y).toBeLessThan(a.clothes.y);
    expect(a.clothes.y).toBeLessThan(a.feet.y);
  });

  it("keeps each column's anchors on its own side of the figure", () => {
    const a = slotAnchors(anatomy);
    for (const key of ["shoulders", "clothes"] as const) expect(a[key].x).toBeLessThan(50);
    for (const key of ["hands", "ring"] as const) expect(a[key].x).toBeGreaterThan(50);
  });

  it("keeps every anchor inside the cell", () => {
    const edge = slotAnchors({ ...anatomy, shoulders: { x0: 0, x1: 512, y: 0 }, feetY: 1024 });
    for (const key of SLOT_ANCHOR_KEYS) {
      expect(edge[key].x).toBeGreaterThanOrEqual(4);
      expect(edge[key].x).toBeLessThanOrEqual(96);
      expect(edge[key].y).toBeGreaterThanOrEqual(4);
      expect(edge[key].y).toBeLessThanOrEqual(96);
    }
  });
});
