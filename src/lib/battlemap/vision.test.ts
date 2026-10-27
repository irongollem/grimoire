import { describe, expect, it } from "vitest";
import { illuminationGrid } from "./illumination";
import { NO_OCCLUDERS, occluders } from "./occlusion";
import { canSee, playerVeilAlpha, seenCombatants, sightAt, visionGrid, type Viewer } from "./vision";

const viewer = (darkvisionFeet: number, x = 5.5, y = 5.5): Viewer => ({ x, y, darkvisionFeet, blindsightFeet: 0, truesightFeet: 0, devilsSightFeet: 0 });
const sensed = (senses: Partial<Viewer>, x = 5.5, y = 5.5): Viewer => ({ ...viewer(0, x, y), ...senses });
const darkScene = { ambient: 0, sources: [], occluders: NO_OCCLUDERS, zones: [] };

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

describe("blindsight and truesight", () => {
  it("blindsight perceives a dark point within range as clear, never grey", () => {
    expect(sightAt(0, [sensed({ blindsightFeet: 10 })], 6.5, 5.5)).toEqual({ seen: 1, grey: 0 });
    expect(sightAt(0, [sensed({ blindsightFeet: 10 })], 5.5 + 5, 5.5).seen).toBe(0);
  });

  it("blindsight does not reach round a wall", () => {
    const wall = occluders({ walls: ["6,5:W"], doors: [], solid: [] });
    const scene = { ambient: 0, sources: [], occluders: wall, zones: [] };
    expect(canSee(scene, [sensed({ blindsightFeet: 30 })], 7, 5)).toBe(false);
    expect(canSee(scene, [sensed({ blindsightFeet: 30 })], 4, 5)).toBe(true);
  });

  it("truesight shows darkness as clear within range", () => {
    expect(sightAt(0, [sensed({ truesightFeet: 30 })], 8.5, 5.5)).toEqual({ seen: 1, grey: 0 });
    expect(sightAt(0, [sensed({ truesightFeet: 30 })], 5.5 + 7, 5.5).seen).toBe(0);
  });

  it("the best sense wins per point", () => {
    // Darkvision 60 reaches 12 cells but only to half sight in grey; blindsight 10 is clear but short.
    const v = sensed({ darkvisionFeet: 60, blindsightFeet: 10 });
    expect(sightAt(0, [v], 6.5, 5.5)).toEqual({ seen: 1, grey: 0 });
    expect(sightAt(0, [v], 5.5 + 6, 5.5)).toEqual({ seen: 0.5, grey: 1 });
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
      occluders: NO_OCCLUDERS,
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
    const lit = { ambient: 0, sources: [{ x: 2.5, y: 2.5, bright: 10, dim: 10 }], occluders: NO_OCCLUDERS, zones: [] };
    expect(canSee(lit, [], 2, 2)).toBe(true);
    expect(canSee(lit, [], 20, 20)).toBe(false);
  });

  it("sees dim light through a lightly obscured step, and darkness only with darkvision in range", () => {
    expect(canSee({ ambient: 0.5, sources: [], occluders: NO_OCCLUDERS, zones: [] }, [], 3, 3)).toBe(true);
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

describe("sight against walls", () => {
  const wall = occluders({ walls: ["6,5:W"], doors: [], solid: [] });
  const lamp = { x: 8.5, y: 5.5, bright: 60, dim: 0 };
  const scene = { ambient: 0, sources: [lamp], occluders: wall, zones: [] };

  it("does not see a lit cell behind a wall, and does with the wall gone", () => {
    expect(canSee(scene, [viewer(0, 5.5, 5.5)], 8, 5)).toBe(false);
    expect(canSee(scene, [viewer(0, 5.5, 5.5)], 5, 5)).toBe(false);
    expect(canSee({ ...scene, occluders: NO_OCCLUDERS }, [viewer(0, 5.5, 5.5)], 8, 5)).toBe(true);
    expect(canSee(scene, [viewer(0, 7.5, 5.5)], 8, 5)).toBe(true);
  });

  it("does not let darkvision reach round a wall", () => {
    expect(canSee({ ambient: 0, sources: [], occluders: wall, zones: [] }, [viewer(60, 5.5, 5.5)], 7, 5)).toBe(false);
    expect(canSee({ ambient: 0, sources: [], occluders: wall, zones: [] }, [viewer(60, 5.5, 5.5)], 4, 5)).toBe(true);
  });

  it("counts only the viewers with a clear line", () => {
    expect(canSee(scene, [viewer(0, 5.5, 5.5), viewer(0, 7.5, 5.5)], 8, 5)).toBe(true);
  });

  it("applies no line test with no viewer", () => {
    expect(canSee(scene, [], 8, 5)).toBe(true);
  });

  it("hides a monster behind a wall from the player", () => {
    const list = [
      { instance_id: "p-1", position: { x: 5, y: 5 } },
      { instance_id: "m-behind", position: { x: 8, y: 5 } },
    ];
    expect(seenCombatants(list, scene, [viewer(0, 5.5, 5.5)], "p-1").map((c) => c.instance_id)).toEqual(["p-1"]);
  });

  it("times a 60x60 vision grid", () => {
    const walls: string[] = [];
    for (let i = 0; i < 60; i += 5) for (let j = 0; j < 60; j += 3) walls.push(`${i},${j}:W`, `${j},${i}:N`);
    const occ = occluders({ walls, doors: [], solid: [] });
    const illumination = new Float32Array(240 * 240).fill(1);
    const t0 = performance.now();
    visionGrid({ illumination, minX: 0, minY: 0, cols: 60, rows: 60, samplesPerCell: 4, viewers: [viewer(60, 30.5, 30.5)], occluders: occ });
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(1000);
  });
});

describe("sight and magical darkness", () => {
  // A 15 ft sphere (3 cells) centred on cell (10.5, 5.5); the viewer stands west of it, at (5.5, 5.5).
  const zones = [{ x: 10.5, y: 5.5, radius: 15 }];
  const daylit = { ambient: 1, sources: [], occluders: NO_OCCLUDERS, zones };

  it("cannot be seen into by ordinary sight or darkvision", () => {
    expect(canSee(daylit, [viewer(0)], 10, 5)).toBe(false);
    expect(canSee(daylit, [viewer(120)], 10, 5)).toBe(false);
  });

  it("hides what is behind it from everyone without the right sense", () => {
    expect(canSee(daylit, [viewer(0)], 15, 5)).toBe(false);
    expect(canSee(daylit, [viewer(120)], 15, 5)).toBe(false);
    expect(canSee(daylit, [viewer(0)], 5, 12)).toBe(true);
  });

  it("is seen into and through by truesight and Devil's Sight within their range", () => {
    for (const sense of [{ truesightFeet: 60 }, { devilsSightFeet: 120 }]) {
      expect(canSee(daylit, [sensed(sense)], 10, 5)).toBe(true);
      expect(canSee(daylit, [sensed(sense)], 15, 5)).toBe(true);
    }
    expect(canSee(daylit, [sensed({ devilsSightFeet: 10 })], 10, 5)).toBe(false);
    expect(sightAt(0, [sensed({ devilsSightFeet: 30 })], 8.5, 5.5)).toEqual({ seen: 1, grey: 0 });
  });

  it("is perceived by blindsight within range, but not round a wall", () => {
    expect(canSee(daylit, [sensed({ blindsightFeet: 30 })], 10, 5)).toBe(true);
    const wall = occluders({ walls: ["8,5:W"], doors: [], solid: [] });
    expect(canSee({ ...daylit, occluders: wall }, [sensed({ blindsightFeet: 30 })], 10, 5)).toBe(false);
  });

  it("rings a vision grid: grey is gone inside the sphere for a darkvision viewer", () => {
    const minX = 0;
    const illumination = illuminationGrid({ ambient: 0, sources: [], occluders: NO_OCCLUDERS, minX, minY: 0, cols: 16, rows: 12, samplesPerCell: 1, zones });
    const v = visionGrid({ illumination, minX, minY: 0, cols: 16, rows: 12, samplesPerCell: 1, viewers: [viewer(120)], occluders: NO_OCCLUDERS, zones });
    const at = (x: number, y: number) => y * 16 + x;
    expect(v.seen[at(6, 5)]).toBe(0.5); // dark but outside the sphere: darkvision's grey
    expect(v.seen[at(10, 5)]).toBe(0); // inside it: nothing
    const without = visionGrid({ illumination, minX, minY: 0, cols: 16, rows: 12, samplesPerCell: 1, viewers: [viewer(120)], occluders: NO_OCCLUDERS });
    expect(without.seen[at(10, 5)]).toBe(0.5);
  });

  it("seenCombatants hides a token in the sphere", () => {
    const kept = seenCombatants([{ instance_id: "m", position: { x: 10, y: 5 } }, { instance_id: "n", position: { x: 6, y: 5 } }], daylit, [viewer(0)], null);
    expect(kept.map((c) => c.instance_id)).toEqual(["n"]);
  });
});

describe("a viewer inside magical darkness", () => {
  const zoneA = { x: 5.5, y: 5.5, radius: 15 };
  const scene = (zones: { x: number; y: number; radius: number }[]) => ({ ambient: 1, sources: [], occluders: NO_OCCLUDERS, zones });

  it("sees out to lit places beyond, but not what is inside the sphere", () => {
    expect(canSee(scene([zoneA]), [viewer(0)], 12, 5)).toBe(true);
    expect(canSee(scene([zoneA]), [viewer(0)], 6, 5)).toBe(false);
  });

  it("cannot see the dark inside the sphere even with darkvision", () => {
    // Darkvision does not reach magical darkness; the viewer stands in it and still sees nothing of its own interior.
    expect(canSee(scene([zoneA]), [viewer(120)], 6, 5)).toBe(false);
    expect(canSee(scene([zoneA]), [viewer(120)], 12, 5)).toBe(true);
  });

  it("is still blocked by a different sphere on the way", () => {
    const zoneB = { x: 10.5, y: 5.5, radius: 10 };
    expect(canSee(scene([zoneA, zoneB]), [viewer(0)], 14, 5)).toBe(false);
    expect(canSee(scene([zoneA]), [viewer(0)], 14, 5)).toBe(true);
  });

  it("a light inside a sphere lights nothing beyond it", async () => {
    const { lightLevelAt } = await import("./illumination");
    expect(lightLevelAt(0, [{ x: 5.5, y: 5.5, bright: 60, dim: 0 }], NO_OCCLUDERS, 12, 5, [zoneA])).toBe(0);
  });
});
