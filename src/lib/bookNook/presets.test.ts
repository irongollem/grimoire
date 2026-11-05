import { describe, expect, it } from "vitest";
import { DEPTH, MOTION_NAMES, PACES, STRENGTHS, anchorFor, clampDepth, describeMotion, motionFor, touchPreset } from "./presets.ts";

const layer = { width: 560 };

describe("describeMotion", () => {
  // A preset the studio cannot read back would show a part's own motion as Exact the moment it was set.
  it.each([11, 12, 24])("reads back every preset it makes, in a %s s loop", (loop) => {
    for (const name of MOTION_NAMES) {
      for (const strength of STRENGTHS) {
        for (const pace of PACES) {
          expect(describeMotion(motionFor(name, strength, pace, layer, loop), layer, loop)).toEqual({ name, strength, pace });
        }
      }
    }
  });

  it("reads inn-dawn's tuned flame and curtain as presets", () => {
    expect(describeMotion({ kind: "flicker", amount: 0.09, speed: 2.4 }, { width: 64 }, 11)).toEqual({ name: "Flame", strength: "gentle", pace: "steady" });
    expect(describeMotion({ kind: "billow", amount: 16, period: 11, waves: 0.8 }, { width: 560 }, 11)).toEqual({ name: "Cloth", strength: "gentle", pace: "slow" });
  });

  it("calls anything hand-tuned custom: an in-between amount, a shifted start, other waves", () => {
    expect(describeMotion({ kind: "flicker", amount: 0.115, speed: 2.4 }, layer, 12)).toEqual({ custom: true });
    expect(describeMotion({ kind: "sway", angle: 2.5, period: 4, phase: 0.3 }, layer, 12)).toEqual({ custom: true });
    expect(describeMotion({ kind: "billow", amount: 16.8, period: 12, waves: 2 }, layer, 12)).toEqual({ custom: true });
  });
});

describe("motionFor", () => {
  it("scales Cloth and Wandering with the part's width, so the same Strength looks the same on a big part and a small one", () => {
    const small = motionFor("Cloth", "gentle", "slow", { width: 100 }, 12);
    const big = motionFor("Cloth", "gentle", "slow", { width: 400 }, 12);
    if (small.kind !== "billow" || big.kind !== "billow") throw new Error("not cloth");
    expect(big.amount).toBeCloseTo(small.amount * 4, 9);
  });
});

describe("clampDepth", () => {
  it("keeps a part from sliding behind the plate's far wall or through the viewer's face", () => {
    expect(clampDepth(0)).toBe(DEPTH.min);
    expect(clampDepth(9)).toBe(DEPTH.max);
    expect(clampDepth(1)).toBe(1);
  });
});

describe("anchorFor", () => {
  it("pins a standing part at its feet and a hanging one at its hook", () => {
    expect(anchorFor("stands")).toEqual({ x: 0.5, y: 1 });
    expect(anchorFor("hangs")).toEqual({ x: 0.5, y: 0 });
    expect(anchorFor("floats")).toEqual({ x: 0.5, y: 0.5 });
  });
});

describe("touchPreset", () => {
  it("makes smoke grey and slower than steam", () => {
    const steam = touchPreset("steam", { x: 1, y: 1 }, 1000);
    const smoke = touchPreset("smoke", { x: 1, y: 1 }, 1000);
    if (steam.kind !== "steam" || smoke.kind !== "steam") throw new Error("not steam");
    expect(smoke.color).toEqual([120, 110, 100]);
    expect(smoke.life).toBeGreaterThan(steam.life);
  });

  it("keeps a wisp's life under the loop, which steam needs to close", () => {
    const steam = touchPreset("smoke", { x: 1, y: 1 }, 1000, 6);
    if (steam.kind !== "steam") throw new Error("not steam");
    expect(steam.life).toBeLessThan(6);
  });

  it("scales with the room, and refuses a point where an area is meant", () => {
    const a = touchPreset("rain", { x: 0, y: 0, w: 100, h: 100 }, 1000);
    const b = touchPreset("rain", { x: 0, y: 0, w: 100, h: 100 }, 2000);
    if (a.kind !== "particles" || b.kind !== "particles") throw new Error("not particles");
    expect(b.size[0]).toBe(a.size[0] * 2);
    expect(() => touchPreset("rain", { x: 0, y: 0 }, 1000)).toThrow(/area/);
    expect(() => touchPreset("glow", { x: 0, y: 0, w: 1, h: 1 }, 1000)).toThrow(/point/);
  });
});
