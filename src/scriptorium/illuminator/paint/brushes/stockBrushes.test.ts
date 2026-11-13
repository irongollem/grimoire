import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "@/generated/artManifest.json";
import { STOCK_GRAIN_PATHS } from "@/scriptorium/papers/papers";
import { STOCK_BRUSHES, STOCK_TIP_PATHS } from "./stockBrushes";

const PUBLIC = join(import.meta.dirname, "../../../../../public");
const allPaths = [
  ...Object.values(STOCK_TIP_PATHS),
  ...Object.values(STOCK_GRAIN_PATHS),
];

describe("stock brushes", () => {
  it("every image tip a brush uses has a path", () => {
    // Fails on: a brush naming a tip with no asset, which the engine would draw as nothing.
    for (const b of STOCK_BRUSHES) {
      if (b.tip.source.kind === "image") expect(STOCK_TIP_PATHS[b.tip.source.id], b.id).toBeTruthy();
    }
  });

  it("every grain a brush uses has a path", () => {
    // Fails on: a brush naming a grain with no asset (the grain silently never applies).
    for (const b of STOCK_BRUSHES) {
      if (b.grain) expect(STOCK_GRAIN_PATHS[b.grain.id], b.id).toBeTruthy();
    }
  });

  it("every path exists on disk", () => {
    // Fails on: a path typo or an asset that was never generated.
    for (const p of allPaths) expect(existsSync(join(PUBLIC, p)), p).toBe(true);
  });

  it("every path is in the art manifest", () => {
    // Fails on: new art without `npm run art:manifest`, a 404 in production.
    const known = manifest as Record<string, unknown>;
    for (const p of allPaths) expect(known[p], p).toBeTruthy();
  });

  it("ids are unique", () => {
    // Fails on: a copied preset keeping its id, so one brush shadows the other in the picker.
    const ids = STOCK_BRUSHES.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("the wet stipple spaces its dabs wide enough that the rim cannot chain", () => {
    // Fails on: tightening the spacing, which turns the rimmed tip into a chain of rings.
    const stipple = STOCK_BRUSHES.find((b) => b.id === "wet-stipple");
    expect(stipple?.tip.spacing).toBeGreaterThanOrEqual(0.6);
  });

  it("the basic hard and soft rounds are there, a hard edge and a soft one", () => {
    // Fails on: losing either basic round, or giving both the same hardness.
    const tip = (id: string) => STOCK_BRUSHES.find((b) => b.id === id)?.tip.source;
    expect(tip("hard-round")).toEqual({ kind: "round", hardness: 0.9 });
    expect(tip("soft-round")).toEqual({ kind: "round", hardness: 0 });
  });

  it("each brush's flow is its own, and the soft brushes are below full", () => {
    // Fails on: flow being dropped, so every brush paints at full flow.
    const flows: Record<string, number> = {
      "round-wash": 0.1,
      "flat-bristle": 0.35,
      "dry-brush": 0.75,
      "sea-sponge": 0.6,
      charcoal: 0.35,
      "ink-round": 1,
      "hard-round": 1,
      "soft-round": 1,
      "soft-airbrush": 0.08,
      "wet-stipple": 0.7,
    };
    for (const b of STOCK_BRUSHES) expect(b.transfer.flow, b.id).toBe(flows[b.id]);
    for (const id of ["round-wash", "soft-airbrush"]) {
      expect(STOCK_BRUSHES.find((b) => b.id === id)?.transfer.flow, id).toBeLessThan(1);
    }
  });
});
