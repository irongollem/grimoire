import { describe, expect, it } from "vitest";
import { canSee, playerVeilAlpha, seenCombatants, sightAt, visionGrid, type Viewer } from "./vision";

const viewer = (darkvisionFeet: number, x = 5.5, y = 5.5): Viewer => ({ x, y, darkvisionFeet });
const darkScene = { ambient: 0, sources: [] };

describe("sightAt", () => {
  it("without darkvision, sees the light level as it is", () => {
    expect(sightAt(1, [viewer(0)], 5.5, 5.5)).toEqual({ seen: 1, grey: 0 });
    expect(sightAt(0.5, [viewer(0)], 5.5, 5.5)).toEqual({ seen: 0.5, grey: 0 });
    expect(sightAt(0, [viewer(0)], 5.5, 5.5)).toEqual({ seen: 0, grey: 0 });
  });

  it("with darkvision, dim counts as bright and darkness as dim, in grey", () => {
    expect(sightAt(0.5, [viewer(60)], 6, 5.5)).toEqual({ seen: 1, grey: 0 });
    expect(sightAt(0, [viewer(60)], 6, 5.5)).toEqual({ seen: 0.5, grey: 1 });
  });

  it("fades the grey with the level so a light ring's edge does not snap", () => {
    const s = sightAt(0.25, [viewer(60)], 6, 5.5);
    expect(s.seen).toBeCloseTo(0.75, 9);
    expect(s.grey).toBeCloseTo(0.5, 9);
  });

  it("stops at the darkvision range and softens the edge", () => {
    // 60 feet is 12 cells.
    expect(sightAt(0, [viewer(60)], 5.5 + 11.5, 5.5).seen).toBe(0.5);
    expect(sightAt(0, [viewer(60)], 5.5 + 12.5, 5.5).seen).toBe(0);
    const edge = sightAt(0, [viewer(60)], 5.5 + 12, 5.5).seen;
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(0.5);
  });

  it("lets the best viewer win", () => {
    expect(sightAt(0, [viewer(0), viewer(60), viewer(120)], 6, 5.5).seen).toBe(0.5);
  });
});

describe("visionGrid", () => {
  it("evaluates every sample at its own position", () => {
    // Two cells wide, one tall, two samples per cell (four by two samples): darkness everywhere, viewer at cell 0 with 5 ft (1 cell).
    const v = visionGrid({
      illumination: new Float32Array(8),
      minX: 0,
      minY: 0,
      cols: 2,
      rows: 1,
      samplesPerCell: 2,
      viewers: [viewer(5, 0.5, 0.5)],
    });
    expect(Array.from(v.seen.slice(0, 4))).toEqual([0.5, 0.5, 0.5, 0]);
    expect(v.grey[0]).toBe(1);
    expect(v.grey[3]).toBe(0);
  });
});

describe("playerVeilAlpha", () => {
  it("is clear when seen, 0.45 when lightly obscured and opaque when blind", () => {
    expect(playerVeilAlpha(1)).toBe(0);
    expect(playerVeilAlpha(0.5)).toBeCloseTo(0.45, 9);
    expect(playerVeilAlpha(0)).toBe(1);
  });

  it("is linear between the anchors", () => {
    expect(playerVeilAlpha(0.75)).toBeCloseTo(0.225, 9);
    expect(playerVeilAlpha(0.25)).toBeCloseTo(0.725, 9);
  });
});

describe("canSee", () => {
  it("sees a lit cell and not a dark one", () => {
    const lit = { ambient: 0, sources: [{ x: 2.5, y: 2.5, bright: 10, dim: 10 }] };
    expect(canSee(lit, [], 2, 2)).toBe(true);
    expect(canSee(lit, [], 20, 20)).toBe(false);
  });

  it("sees dim light through a lightly obscured step, and darkness only with darkvision in range", () => {
    expect(canSee({ ambient: 0.5, sources: [] }, [], 3, 3)).toBe(true);
    expect(canSee(darkScene, [], 3, 3)).toBe(false);
    expect(canSee(darkScene, [viewer(60, 3.5, 3.5)], 5, 3)).toBe(true);
    expect(canSee(darkScene, [viewer(60, 3.5, 3.5)], 30, 3)).toBe(false);
  });
});

describe("seenCombatants", () => {
  const list = [
    { instance_id: "p-1", position: { x: 30, y: 30 } },
    { instance_id: "m-near", position: { x: 6, y: 5 } },
    { instance_id: "m-far", position: { x: 40, y: 5 } },
    { instance_id: "m-unplaced", position: null },
    { instance_id: "m-big", position: { x: -7, y: 5 }, footprint: 2 },
  ];

  it("keeps the player's own token, the unplaced and what the viewers see, and drops the rest", () => {
    const kept = seenCombatants(list, darkScene, [viewer(60)], "p-1").map((c) => c.instance_id);
    expect(kept).toEqual(["p-1", "m-near", "m-unplaced", "m-big"]);
  });

  it("hides everything but the own token from a blind viewer", () => {
    const kept = seenCombatants(list, darkScene, [viewer(0)], "p-1").map((c) => c.instance_id);
    expect(kept).toEqual(["p-1", "m-unplaced"]);
  });
});
