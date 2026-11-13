import { describe, expect, it, vi } from "vitest";
import { MAX_BAKE_EDGE } from "@/scriptorium/illuminator/lib/renderBake";
import { blankSheetRecipe, sheetPresets, sheetSize, tileSurface } from "./newSheet";

describe("sheetPresets", () => {
  it("never exceeds the bake cap on the long edge, whatever the page shape", () => {
    // Fails on: a preset that outgrows MAX_BAKE_EDGE, so the document size no longer equals the bake size.
    for (const aspect of [0.2, 0.707, 1, 1.5, 6]) {
      for (const p of sheetPresets(aspect)) expect(Math.max(p.width, p.height)).toBeLessThanOrEqual(MAX_BAKE_EDGE);
    }
    expect(Math.max(...Object.values(sheetSize(0.5, 99999)))).toBe(MAX_BAKE_EDGE);
  });

  it("keeps the aspect of the shape it was cut to", () => {
    // Fails on: width and height rounded from the wrong edge, squashing the sheet.
    const full = sheetPresets(1 / 1.414)[0]!;
    expect(full.width / full.height).toBeCloseTo(1 / 1.414, 2);
    const square = sheetPresets(0.7).find((p) => p.id === "square")!;
    expect(square.width).toBe(square.height);
  });

  it("falls back to a sane shape when the page ratio is unusable", () => {
    // Fails on: NaN or zero sizes from a page that has not been measured yet.
    for (const p of sheetPresets(Number.NaN)) expect(p.width).toBeGreaterThan(0);
  });
});

describe("tileSurface", () => {
  it("covers the whole sheet, with a tile reaching past the right and bottom edge", () => {
    // Fails on: a loop that stops at floor(width / tile), leaving a bare strip on the right or bottom.
    const drawImage = vi.fn();
    const n = tileSurface({ drawImage }, {} as CanvasImageSource, 1024, 1024, 2500, 1100);
    expect(n).toBe(3 * 2);
    const calls = drawImage.mock.calls as [unknown, number, number][];
    expect(Math.max(...calls.map((c) => c[1])) + 1024).toBeGreaterThanOrEqual(2500);
    expect(Math.max(...calls.map((c) => c[2])) + 1024).toBeGreaterThanOrEqual(1100);
    expect(calls[0]!.slice(1, 3)).toEqual([0, 0]);
    expect(calls.map((c) => c[1])).toContain(2048);
  });

  it("draws each tile larger by the paper's scale and still covers the sheet", () => {
    // Fails on: scale ignored (small tiles, a visible grid) or a step that stays 1024 so scaled tiles overlap.
    const drawImage = vi.fn();
    const n = tileSurface({ drawImage }, {} as CanvasImageSource, 1024, 1024, 3000, 3000, 2.5);
    expect(n).toBe(2 * 2);
    const calls = drawImage.mock.calls as [unknown, number, number, number, number][];
    expect(calls.every((c) => c[3] === 2560 && c[4] === 2560)).toBe(true);
    expect(calls.map((c) => c[1])).toEqual([0, 2560, 0, 2560]);
    expect(2560 * 2).toBeGreaterThanOrEqual(3000);
  });

  it("refuses a tile with no size rather than looping forever", () => {
    // Fails on: an infinite loop when the paper image failed to decode (width 0).
    expect(() => tileSurface({ drawImage: vi.fn() }, {} as CanvasImageSource, 0, 0, 100, 100)).toThrow();
  });
});

describe("blankSheetRecipe", () => {
  it("carries the chosen paper and the sheet's exact size in one empty paint step", () => {
    // Fails on: the paint step's size drifting from the original, which misaligns every stroke on load.
    const r = blankSheetRecipe("treasure-map", { width: 2400, height: 2400 }, 7);
    expect(r.steps).toEqual([{ type: "paint", width: 2400, height: 2400, paper: "treasure-map", layers: [] }]);
    expect(r.seed).toBe(7);
  });
});
