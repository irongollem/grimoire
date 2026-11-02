import { describe, it, expect } from "vitest";
import { isReactive, reactive } from "vue";
import { boostMask, currentMapLive, flameNoise, groupsIn, hasMotion, lightBoost, lightRadiusScale, lightsIn, overlayFrame, spritesIn, swayAngle } from "./liveLayer";
import { FLICKER_REACH, PULSE_REACH } from "@/cartographer/lights";
import type { MapLive, MapLiveLight, MapLiveSprite, MotionOverlay } from "@/types/mapLive.types";

const base: MotionOverlay = { url: "u", cells: 4, drift: [0.5, -0.25], alpha: 0.6 };

describe("overlayFrame", () => {
  it("sizes the tile from its cells and the cell size", () => {
    expect(overlayFrame(base, 50, 0, 0, 0).size).toBe(200);
  });

  it("anchors the offset to the map origin and drifts with time", () => {
    const f = overlayFrame(base, 50, 30, 10, 2);
    // x: 30 + 0.5*2*50 = 80; y: 10 + -0.25*2*50 = -15, wrapped into [0, 200)
    expect(f.offsetX).toBe(80);
    expect(f.offsetY).toBe(185);
  });

  it("wraps the offset into [0, size) for negative origins and long times", () => {
    const f = overlayFrame(base, 50, -430, 0, 1000);
    expect(f.offsetX).toBeGreaterThanOrEqual(0);
    expect(f.offsetX).toBeLessThan(200);
    expect(f.offsetY).toBeGreaterThanOrEqual(0);
    expect(f.offsetY).toBeLessThan(200);
  });

  it("holds the base alpha without breathing", () => {
    expect(overlayFrame(base, 50, 0, 0, 7).alpha).toBe(0.6);
  });

  it("breathes the alpha and clamps it to 0..1", () => {
    const breathing = { ...base, alpha: 0.8, breathe: { amount: 0.5, speed: Math.PI, phase: 0 } };
    expect(overlayFrame(breathing, 50, 0, 0, 0.5).alpha).toBe(1);
    expect(overlayFrame(breathing, 50, 0, 0, 1.5).alpha).toBeCloseTo(0.4);
    expect(overlayFrame({ ...breathing, breathe: { amount: 5, speed: Math.PI, phase: 0 } }, 50, 0, 0, 1.5).alpha).toBe(0);
  });
});

const live = (...kinds: ("water" | "outer")[]): MapLive => ({
  version: 3, darkness: "daylight",
  groups: kinds.map((kind) => ({ kind, cells: ["0,0"], overlays: [base] })),
  lights: [],
  sprites: [],
  walls: [],
  doors: [],
  solid: [],
});

const sprite: MapLiveSprite = { url: "t", x: 1, y: 1, w: 1, h: 1, rotation: 0, sway: { amount: 4, speed: 1.5, phase: 0.7 } };
const fire: MapLiveLight = { x: 0, y: 0, color: "#ff8030", bright: 20, dim: 20, flicker: 0.3, phase: 1 };
const glow: MapLiveLight = { x: 0, y: 0, color: "#30ff80", bright: 0, dim: 10, pulse: 0.5, phase: 2 };
const steady: MapLiveLight = { x: 0, y: 0, color: "#ffffff", bright: 5, dim: 5, phase: 0 };

describe("groupsIn", () => {
  it("gives the ground layer the water and the outer mass", () => {
    expect(groupsIn(live("water", "outer"), "ground").map((g) => g.kind)).toEqual(["water", "outer"]);
  });

  it("gives the top layer no water", () => {
    expect(groupsIn(live("water", "outer"), "top")).toEqual([]);
    expect(groupsIn(null, "ground")).toEqual([]);
  });
});

describe("spritesIn and lightsIn", () => {
  const snapshot: MapLive = { version: 3, darkness: "daylight", groups: [], lights: [fire, glow, steady], sprites: [sprite], walls: [], doors: [], solid: [] };

  it("puts every sprite in the top layer and none in the ground layer", () => {
    expect(spritesIn(snapshot, "top")).toEqual([sprite]);
    expect(spritesIn(snapshot, "ground")).toEqual([]);
    expect(spritesIn(null, "top")).toEqual([]);
  });

  it("puts every light in the ground layer, the steady-looking ones too", () => {
    expect(lightsIn(snapshot, "ground")).toEqual([fire, glow, steady]);
    expect(lightsIn(snapshot, "top")).toEqual([]);
    expect(lightsIn(null, "ground")).toEqual([]);
  });
});

describe("hasMotion", () => {
  it("needs at least one overlay, sprite or moving light", () => {
    expect(hasMotion(null, "ground")).toBe(false);
    expect(hasMotion({ version: 3, darkness: "daylight", groups: [{ kind: "water", cells: [], overlays: [] }], lights: [], sprites: [], walls: [], doors: [], solid: [] }, "ground")).toBe(false);
    expect(hasMotion(live("water"), "ground")).toBe(true);
  });

  it("runs the top layer for sprites only", () => {
    expect(hasMotion(live("water"), "top")).toBe(false);
    expect(hasMotion({ version: 3, darkness: "daylight", groups: [], lights: [], sprites: [sprite], walls: [], doors: [], solid: [] }, "top")).toBe(true);
    expect(hasMotion({ version: 3, darkness: "daylight", groups: [], lights: [], sprites: [sprite], walls: [], doors: [], solid: [] }, "ground")).toBe(false);
  });

  it("runs the ground layer for any light: a cool one pulses", () => {
    expect(hasMotion({ version: 3, darkness: "daylight", groups: [], lights: [fire], sprites: [], walls: [], doors: [], solid: [] }, "ground")).toBe(true);
    expect(hasMotion({ version: 3, darkness: "daylight", groups: [], lights: [glow], sprites: [], walls: [], doors: [], solid: [] }, "ground")).toBe(true);
    expect(hasMotion({ version: 3, darkness: "daylight", groups: [], lights: [steady], sprites: [], walls: [], doors: [], solid: [] }, "ground")).toBe(true);
  });
});

describe("swayAngle", () => {
  it("never leans further than the amount", () => {
    for (let t = 0; t < 200; t += 0.37) {
      expect(Math.abs(swayAngle(sprite.sway, t))).toBeLessThanOrEqual(sprite.sway.amount + 1e-9);
    }
  });

  it("moves, and differs between phases", () => {
    const angles = new Set([0, 1, 2, 3].map((t) => swayAngle(sprite.sway, t).toFixed(4)));
    expect(angles.size).toBeGreaterThan(1);
    expect(swayAngle({ ...sprite.sway, phase: 0 }, 1)).not.toBeCloseTo(swayAngle({ ...sprite.sway, phase: 3 }, 1));
  });
});

describe("lightBoost", () => {
  it("stays within 0..1 for a flame and does not repeat on a short beat", () => {
    const values: number[] = [];
    for (let t = 0; t < 30; t += 0.05) {
      const v = lightBoost(fire, t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      values.push(v);
    }
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.4);
  });

  it("breathes slowly for a pulse: neighbouring frames barely differ", () => {
    for (let t = 0; t < 20; t += 0.016) {
      const v = lightBoost(glow, t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      expect(Math.abs(lightBoost(glow, t + 0.016) - v)).toBeLessThan(0.02);
    }
  });
});

describe("boostMask", () => {
  // A 5 ft bright + 5 ft dim fire (two cells of reach) in cell (1,0), a wall on the left edge of cell (2,0).
  const fire: MapLiveLight = { x: 1.5, y: 0.5, color: "#ff8800", bright: 5, dim: 5, flicker: 0.3, phase: 0 };
  const walled: MapLive = { version: 3, darkness: "dark", groups: [], lights: [fire], sprites: [], walls: [{ id: "2,0:W", a: [2, 0], b: [2, 1] }], doors: [], solid: [] };
  const sampleAt = (m: ReturnType<typeof boostMask>, x: number, y: number) => {
    const spc = m.mask.width / (m.x1 - m.x0);
    return m.mask.alpha[Math.floor((y - m.y0) * spc) * m.mask.width + Math.floor((x - m.x0) * spc)];
  };

  it("stops at the walls the baked glow stops at", () => {
    const m = boostMask(walled, fire);
    expect(sampleAt(m, 1.2, 0.5)).toBe(255);
    expect(sampleAt(m, 2.4, 0.5)).toBe(0);
    expect(sampleAt(boostMask({ ...walled, walls: [] }, fire), 2.4, 0.5)).toBe(255);
  });

  it("covers the light's whole reach below it as well as to the side", () => {
    // Two cells of reach from (1.5, 0.5): (1.5, 2.2) is 1.7 cells below, inside the reach.
    expect(sampleAt(boostMask(walled, fire), 1.5, 2.2)).toBe(255);
  });

  it("follows a door the DM opened", () => {
    const door: MapLive = { ...walled, walls: [], doors: [{ id: "2,0:W", a: [2, 0], b: [2, 1], open: false, leaf: null }] };
    expect(sampleAt(boostMask(door, fire), 2.4, 0.5)).toBe(0);
    expect(sampleAt(boostMask(door, fire, [{ id: "2,0:W", open: true }]), 2.4, 0.5)).toBe(255);
  });

  it("is computed once per light per snapshot", () => {
    expect(boostMask(walled, fire)).toBe(boostMask(walled, fire));
  });
});

describe("currentMapLive", () => {
  const live: MapLive = { version: 3, darkness: "daylight", groups: [], lights: [], sprites: [], walls: [], doors: [], solid: [] };

  it("passes the current version and null through", () => {
    expect(currentMapLive(live)).toBe(live);
    expect(currentMapLive(null)).toBeNull();
  });

  it("hands out the plain snapshot from a reactive row, so the sight grids do not track millions of reads", () => {
    // The battle map reads the snapshot from a query's reactive row; through the proxy one illumination grid took
    // 720 ms instead of 15.
    const row = reactive({ map_live: { ...live, walls: [{ a: [0, 0], b: [1, 0] }] } as MapLive });
    const out = currentMapLive(row.map_live);
    expect(isReactive(out)).toBe(false);
    expect(isReactive(out?.walls[0])).toBe(false);
  });

  it("ignores a version-1 snapshot, whose bakes still hold every door leaf", () => {
    // The DB may hold a 1 the types no longer allow.
    const old = JSON.parse(JSON.stringify({ ...live, version: 1 })) as MapLive;
    expect(currentMapLive(old)).toBeNull();
  });
});

// The maintainer, 2 Nov 2026: "pulsing light from fire sources that give the illusion the flames move".
describe("a fire's light moves without being told to", () => {
  const brazier: MapLiveLight = { x: 3, y: 3, color: "#ffb347", bright: 20, dim: 20, phase: 0.4 }; // no flicker declared
  const torch: MapLiveLight = { ...brazier, x: 9, y: 1, phase: 2.7 };
  const times = Array.from({ length: 600 }, (_, i) => i * 0.05);


  it("changes its brightness over time, never settling into a regular blink", () => {
    const values = times.map((t) => lightBoost(brazier, t));
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.3);
    // A blink would repeat: no lag between 0.5 and 10 seconds lines the signal up with itself.
    for (const lag of [0.5, 1, 2, 3.7, 5, 10]) {
      const shifted = times.map((t) => lightBoost(brazier, t + lag));
      const same = values.filter((v, i) => Math.abs(v - shifted[i]) < 0.01).length;
      expect(same / values.length).toBeLessThan(0.1);
    }
  });

  // A first cut drifted 5% and the maintainer saw nothing move: a flame's reach has to swing by a visible amount.
  it("swells and shrinks a fire's reach by at least 10% over a few seconds, within its limit", () => {
    const scales = times.map((t) => lightRadiusScale(brazier, t));
    expect(Math.max(...scales)).toBeLessThanOrEqual(1 + FLICKER_REACH + 1e-9);
    expect(Math.min(...scales)).toBeGreaterThanOrEqual(1 - FLICKER_REACH - 1e-9);
    const first = scales.slice(0, 120);
    expect(Math.max(...first) - Math.min(...first)).toBeGreaterThanOrEqual(0.1);
  });

  it("breathes a cool light's reach by at least 8% over a few seconds, evenly", () => {
    const cool: MapLiveLight = { ...brazier, color: "#30ff80" };
    const scales = times.map((t) => lightRadiusScale(cool, t));
    expect(Math.max(...scales)).toBeLessThanOrEqual(1 + PULSE_REACH + 1e-9);
    const first = scales.slice(0, 120);
    expect(Math.max(...first) - Math.min(...first)).toBeGreaterThanOrEqual(0.08);
    // Slow and smooth: no frame jumps.
    for (let i = 1; i < scales.length; i++) expect(Math.abs(scales[i] - scales[i - 1])).toBeLessThan(0.05);
  });

  it("keeps two cool lights out of phase", () => {
    const a: MapLiveLight = { ...brazier, color: "#30ff80", phase: 0.2 };
    const b: MapLiveLight = { ...a, phase: 2.9 };
    expect(times.filter((t) => Math.abs(lightRadiusScale(a, t) - lightRadiusScale(b, t)) > 0.03).length / times.length).toBeGreaterThan(0.5);
  });

  it("keeps two fires out of phase, in brightness and in reach", () => {
    const apart = (f: (l: MapLiveLight, t: number) => number) => times.filter((t) => Math.abs(f(brazier, t) - f(torch, t)) > 0.05).length / times.length;
    expect(apart(lightBoost)).toBeGreaterThan(0.5);
    expect(apart(lightRadiusScale) > 0 && times.some((t) => Math.abs(lightRadiusScale(brazier, t) - lightRadiusScale(torch, t)) > 0.01)).toBe(true);
  });

  it("keeps the noise within -1..1 so the brightness stays within 0..1", () => {
    for (const t of times) expect(Math.abs(flameNoise(brazier.phase, t))).toBeLessThanOrEqual(1);
  });
});
