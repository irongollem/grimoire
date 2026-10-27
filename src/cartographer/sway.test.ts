import { describe, it, expect } from "vitest";
import { dressingSway, objectSway, phaseAt } from "./sway";
import type { DressingProp } from "./dressing";
import type { ObjectCell } from "@/types/dungeonMap.types";
import { makeRuntime } from "./testCanvas";

const SWAY = { amount: 4, speed: 1.5 };
const obj = (category: ObjectCell["category"], variant = 0): ObjectCell => ({ pack_id: "p", pack_version: 1, variant, category });
const slots = { objectPillar: [{ variant: 0, url: "https://cdn/tree.webp" }, { variant: 1, url: "https://cdn/stump.webp" }] };

describe("objectSway", () => {
  it("returns the sway and the art url of a standing object the pack sways", () => {
    const rt = makeRuntime("p", { sway: { objectPillar: [SWAY, null] }, assets: slots });
    expect(objectSway(obj("objectPillar", 0), rt)).toEqual({ sway: SWAY, url: "https://cdn/tree.webp" });
  });

  it("is null for a variant with no sway, a category with none, or no pack", () => {
    const rt = makeRuntime("p", { sway: { objectPillar: [SWAY, null] }, assets: slots });
    expect(objectSway(obj("objectPillar", 1), rt)).toBeNull();
    expect(objectSway(obj("objectChest", 0), rt)).toBeNull();
    expect(objectSway(obj("objectPillar", 0), null)).toBeNull();
  });

  it("is null when the variant has no asset slot with a url (it would be drawn from a stand-in)", () => {
    const rt = makeRuntime("p", { sway: { objectPillar: [SWAY, SWAY] }, assets: { objectPillar: [{ variant: 0, url: "https://cdn/tree.webp" }] } });
    expect(objectSway(obj("objectPillar", 1), rt)).toBeNull();
  });

  it("never sways a flat or stair category, whatever the manifest says", () => {
    const rt = makeRuntime("p", {
      sway: { rubble: [SWAY], stairsUp: [SWAY] },
      assets: { rubble: [{ variant: 0, url: "https://cdn/r.webp" }], stairsUp: [{ variant: 0, url: "https://cdn/s.webp" }] },
    });
    expect(objectSway(obj("rubble"), rt)).toBeNull();
    expect(objectSway(obj("stairsUp"), rt)).toBeNull();
  });

  it("never sways a stair down either", () => {
    const rt = makeRuntime("p", { sway: { stairsDown: [SWAY] }, assets: { stairsDown: [{ variant: 0, url: "https://cdn/s.webp" }] } });
    expect(objectSway(obj("stairsDown"), rt)).toBeNull();
  });

  it("ignores a side-specific slot, which is directional art the live layer cannot sway", () => {
    const rt = makeRuntime("p", { sway: { objectPillar: [SWAY] }, assets: { objectPillar: [{ variant: 0, side: "N", url: "https://cdn/n.webp" }] } });
    expect(objectSway(obj("objectPillar", 0), rt)).toBeNull();
  });
});

describe("dressingSway", () => {
  const prop = (over: Partial<DressingProp>): DressingProp => ({
    id: "palm", name: "Palm", footprint_w: 1, footprint_h: 1, image: null, flat: false, light: null, url: "https://cdn/palm.webp", sway: SWAY, ...over,
  });

  it("needs a sway and painted art", () => {
    expect(dressingSway(prop({}))).toEqual({ sway: SWAY, url: "https://cdn/palm.webp" });
    expect(dressingSway(prop({ sway: null }))).toBeNull();
    expect(dressingSway(prop({ url: null }))).toBeNull();
    expect(dressingSway(prop({ flat: true }))).toBeNull();
    expect(dressingSway(undefined)).toBeNull();
  });
});

describe("phaseAt", () => {
  it("is deterministic, within 0..2pi, and differs between neighbours", () => {
    expect(phaseAt(3, 4)).toBe(phaseAt(3, 4));
    for (const [x, y] of [[0, 0], [3, 4], [12.5, 7], [100, 100]]) {
      expect(phaseAt(x, y)).toBeGreaterThanOrEqual(0);
      expect(phaseAt(x, y)).toBeLessThan(Math.PI * 2);
    }
    expect(phaseAt(3, 4)).not.toBe(phaseAt(4, 4));
  });
});
