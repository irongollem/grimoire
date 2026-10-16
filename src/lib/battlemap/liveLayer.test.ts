import { describe, it, expect } from "vitest";
import { groupsIn, hasMotion, lightBoost, lightsIn, overlayFrame, spritesIn, swayAngle } from "./liveLayer";
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
  version: 1, darkness: "daylight",
  groups: kinds.map((kind) => ({ kind, cells: ["0,0"], overlays: [base] })),
  lights: [],
  sprites: [],
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
  const snapshot: MapLive = { version: 1, darkness: "daylight", groups: [], lights: [fire, glow, steady], sprites: [sprite] };

  it("puts every sprite in the top layer and none in the ground layer", () => {
    expect(spritesIn(snapshot, "top")).toEqual([sprite]);
    expect(spritesIn(snapshot, "ground")).toEqual([]);
    expect(spritesIn(null, "top")).toEqual([]);
  });

  it("puts the moving lights, and only those, in the ground layer", () => {
    expect(lightsIn(snapshot, "ground")).toEqual([fire, glow]);
    expect(lightsIn(snapshot, "top")).toEqual([]);
    expect(lightsIn(null, "ground")).toEqual([]);
  });
});

describe("hasMotion", () => {
  it("needs at least one overlay, sprite or moving light", () => {
    expect(hasMotion(null, "ground")).toBe(false);
    expect(hasMotion({ version: 1, darkness: "daylight", groups: [{ kind: "water", cells: [], overlays: [] }], lights: [], sprites: [] }, "ground")).toBe(false);
    expect(hasMotion(live("water"), "ground")).toBe(true);
  });

  it("runs the top layer for sprites only", () => {
    expect(hasMotion(live("water"), "top")).toBe(false);
    expect(hasMotion({ version: 1, darkness: "daylight", groups: [], lights: [], sprites: [sprite] }, "top")).toBe(true);
    expect(hasMotion({ version: 1, darkness: "daylight", groups: [], lights: [], sprites: [sprite] }, "ground")).toBe(false);
  });

  it("runs the ground layer for a flickering or pulsing light, not a steady one", () => {
    expect(hasMotion({ version: 1, darkness: "daylight", groups: [], lights: [fire], sprites: [] }, "ground")).toBe(true);
    expect(hasMotion({ version: 1, darkness: "daylight", groups: [], lights: [glow], sprites: [] }, "ground")).toBe(true);
    expect(hasMotion({ version: 1, darkness: "daylight", groups: [], lights: [steady], sprites: [] }, "ground")).toBe(false);
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
  it("is 0 for a steady light", () => {
    expect(lightBoost(steady, 3.3)).toBe(0);
  });

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
