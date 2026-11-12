import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "@/generated/artManifest.json";
import { STOCK_GRAIN_PATHS, STOCK_PAPERS } from "./papers";

const PUBLIC = join(import.meta.dirname, "../../../public");

describe("stock papers", () => {
  it("every paper surface exists on disk and in the art manifest", () => {
    // Fails on: a path typo, art never generated, or art without `npm run art:manifest` (a production 404).
    const known = manifest as Record<string, unknown>;
    for (const p of STOCK_PAPERS) {
      expect(existsSync(join(PUBLIC, p.surfacePath)), p.surfacePath).toBe(true);
      expect(known[p.surfacePath], p.surfacePath).toBeTruthy();
    }
  });

  it("every paper's grain has a path", () => {
    // Fails on: a paper whose tooth was never generated, so paper-mode brushes catch nothing on it.
    for (const p of STOCK_PAPERS) expect(STOCK_GRAIN_PATHS[p.grainId], p.id).toBeTruthy();
  });

  it("paper ids are unique and tooth is a fraction with hot-press the smoothest", () => {
    // Fails on: a copied paper keeping its id, a value outside 0..1, or tooth numbers swapped between papers.
    expect(new Set(STOCK_PAPERS.map((p) => p.id)).size).toBe(STOCK_PAPERS.length);
    for (const p of STOCK_PAPERS) {
      expect(p.tooth, p.id).toBeGreaterThanOrEqual(0);
      expect(p.tooth, p.id).toBeLessThanOrEqual(1);
    }
    const smoothest = STOCK_PAPERS.reduce((a, b) => (b.tooth < a.tooth ? b : a));
    expect(smoothest.id).toBe("hot-press");
  });

  it("every surface scale is at least 1, and the big-featured papers are the largest", () => {
    // Fails on: a scale below 1 (tiny, busier repeats), or treasure map and parchment losing the lead that hides their grid.
    for (const p of STOCK_PAPERS) expect(p.surfaceScale, p.id).toBeGreaterThanOrEqual(1);
    const top = [...STOCK_PAPERS].sort((a, b) => b.surfaceScale - a.surfaceScale).slice(0, 2).map((p) => p.id);
    expect(top).toEqual(["treasure-map", "parchment"]);
  });
});
