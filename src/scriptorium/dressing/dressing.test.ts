import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  activeDressing,
  dressPage,
  emptyDressing,
  isBare,
  isDrawn,
  MARK_ASSETS,
  newSeed,
  parseDressing,
  type Dressing,
  type Mark,
} from "./dressing";

const FULL: Dressing = {
  v: 1,
  seed: 4242,
  stain: { on: true, strength: 0.6 },
  wash: { on: true, strength: 0.5 },
  corners: { on: true, strength: 0.8 },
};

describe("parseDressing", () => {
  it("reads a good value back as it was written", () => {
    expect(parseDressing(JSON.parse(JSON.stringify(FULL)))).toEqual(FULL);
  });

  it.each<[string, unknown]>([
    ["null (no dressing)", null],
    ["a string", "stain"],
    ["an array", [FULL]],
    ["another version", { ...FULL, v: 2 }],
    ["no version", { ...FULL, v: undefined }],
    ["a fractional seed", { ...FULL, seed: 1.5 }],
    ["a negative seed", { ...FULL, seed: -1 }],
    ["a text seed", { ...FULL, seed: "7" }],
    ["a missing part", { ...FULL, wash: undefined }],
    ["a part that is not an object", { ...FULL, stain: true }],
    ["a non-boolean on", { ...FULL, corners: { on: 1, strength: 0.5 } }],
    ["a strength above 1", { ...FULL, corners: { on: true, strength: 1.5 } }],
    ["a negative strength", { ...FULL, stain: { on: true, strength: -0.1 } }],
    ["a NaN strength", { ...FULL, stain: { on: true, strength: Number.NaN } }],
  ])("reads %s as no dressing, never a crash", (_name, json) => {
    // Fails on: a half-valid column (written by a later version, edited by hand) reaching the renderers and
    // drawing marks at opacity NaN, or throwing out of every page of the book.
    expect(parseDressing(json)).toBeNull();
  });

  it("drops fields it does not know instead of carrying them", () => {
    expect(parseDressing({ ...FULL, extra: "x" })).toEqual(FULL);
  });
});

describe("activeDressing", () => {
  it("is none for an ink-friendly book, whatever it carries", () => {
    // Fails on: a renderer that checks the finish for the paper but forgets it for the dressing, printing
    // stains on the page the author asked to print plain white.
    expect(activeDressing(FULL, true)).toBeNull();
    expect(activeDressing(FULL, false)).toEqual(FULL);
    expect(activeDressing("junk", false)).toBeNull();
  });
});

describe("dressPage", () => {
  const key = (marks: Mark[]) => JSON.stringify(marks);

  it("gives the same page the same marks every time, and other pages other marks", () => {
    // Fails on: a Math.random in the placement (the editor, preview and PDF would each draw a different page),
    // or a placement that ignores the page number (every page identical, which reads as a stamp).
    expect(key(dressPage(FULL, 7, "text"))).toBe(key(dressPage(FULL, 7, "text")));
    const stains = new Set([3, 5, 7, 9, 11, 13, 15, 17].map((n) => key(dressPage({ ...FULL, wash: { ...FULL.wash, on: false }, corners: { ...FULL.corners, on: false } }, n, "text"))));
    expect(stains.size).toBeGreaterThan(5);
  });

  it("moves every mark when the seed changes (Shuffle) and keeps the choices", () => {
    // Fails on: Shuffle writing a seed the placement ignores, so the button does nothing.
    const a = dressPage(FULL, 3, "text");
    const b = dressPage({ ...FULL, seed: FULL.seed + 1 }, 3, "text");
    expect(key(a)).not.toBe(key(b));
    expect(b).toHaveLength(a.length);
  });

  it("leaves a cover and a blank page bare", () => {
    // Fails on: dressing drawn over the cover art or the deliberately empty page.
    expect(dressPage(FULL, 1, "cover")).toEqual([]);
    expect(dressPage(FULL, 4, "blank")).toEqual([]);
    expect(dressPage(FULL, 3, "text").length).toBeGreaterThan(0);
  });

  it("draws nothing without a dressing, for a part that is off, or at strength 0", () => {
    expect(dressPage(null, 3, "text")).toEqual([]);
    const only = (part: "stain" | "wash" | "corners"): Dressing => ({
      ...FULL,
      stain: { ...FULL.stain, on: part === "stain" },
      wash: { ...FULL.wash, on: part === "wash" },
      corners: { ...FULL.corners, on: part === "corners" },
    });
    expect(dressPage(only("stain"), 3, "text").every((m) => m.asset.startsWith("stain"))).toBe(true);
    expect(dressPage(only("wash"), 3, "text").map((m) => m.asset)).toEqual(["edge-wash-band"]);
    expect(dressPage(only("corners"), 3, "text").map((m) => m.asset)).toEqual(Array(4).fill("corner-flourish"));
    expect(dressPage({ ...FULL, stain: { on: true, strength: 0 }, wash: { on: false, strength: 0.5 }, corners: { on: false, strength: 0.5 } }, 3, "text")).toEqual([]);
  });

  it("switching one part off leaves the other parts exactly where they were", () => {
    // Fails on: one random source shared by the parts, so ticking Stain moves the corners and the wash.
    const without = dressPage({ ...FULL, stain: { ...FULL.stain, on: false } }, 3, "text");
    const withAll = dressPage(FULL, 3, "text").filter((m) => !m.asset.startsWith("stain"));
    expect(key(without)).toBe(key(withAll));
  });

  it("puts the wash on the outer edge of a spread: right on odd pages, left on even", () => {
    // Fails on: the same edge on both pages of a spread, so the washes meet in the gutter.
    const wash = (n: number) => dressPage({ ...FULL, stain: { ...FULL.stain, on: false }, corners: { ...FULL.corners, on: false } }, n, "text")[0];
    const centre = (m: Mark) => m.left + m.width / 2;
    expect(wash(3).rotate).toBeGreaterThan(80);
    expect(centre(wash(3))).toBeGreaterThan(50);
    expect(wash(4).rotate).toBeLessThan(-80);
    expect(centre(wash(4))).toBeLessThan(50);
  });

  it("hangs a handout's wash from the top, where a book's runs along the edge", () => {
    const [mark] = dressPage({ ...FULL, stain: { ...FULL.stain, on: false }, corners: { ...FULL.corners, on: false } }, 1, "text", { handout: true });
    expect(Math.abs(mark.rotate)).toBeLessThan(2);
    expect(mark.top).toBeLessThan(5);
  });

  it("mirrors the corner flourish to all four corners, the same on every page", () => {
    const corners = (n: number) => dressPage({ ...FULL, stain: { ...FULL.stain, on: false }, wash: { ...FULL.wash, on: false } }, n, "text");
    expect(key(corners(3))).toBe(key(corners(8)));
    const flips = corners(3).map((m) => `${m.flipX}${m.flipY}`).sort();
    expect(flips).toEqual(["falsefalse", "falsetrue", "truefalse", "truetrue"]);
    const [tl] = corners(3).filter((m) => !m.flipX && !m.flipY);
    expect(tl.left).toBeLessThan(10);
    expect(tl.top).toBeLessThan(10);
  });

  it("keeps a mark's proportions on a page of another shape", () => {
    // Fails on: height taken as a fixed % of the page, which squashes the flourish on US Letter.
    const aspect = (a: number) => {
      const m = dressPage({ ...FULL, stain: { ...FULL.stain, on: false }, wash: { ...FULL.wash, on: false } }, 3, "text", { aspect: a })[0];
      return (m.width * 1) / (m.height * a);
    };
    for (const a of [1.294, 1.414, 1.9]) expect(aspect(a)).toBeCloseTo(MARK_ASSETS["corner-flourish"].aspect, 3);
  });

  it("stays on the page: a stain runs off the lower edge, never floats above its place", () => {
    for (let n = 2; n < 40; n++) {
      for (const m of dressPage({ ...FULL, wash: { ...FULL.wash, on: false }, corners: { ...FULL.corners, on: false } }, n, "text")) {
        expect(m.top + m.height).toBeGreaterThan(80);
        expect(m.top).toBeGreaterThan(50);
        expect(m.opacity).toBeGreaterThan(0);
        expect(m.opacity).toBeLessThanOrEqual(0.6);
      }
    }
  });
});

describe("isDrawn", () => {
  it("agrees with what dressPage would draw, so a surface is only made a stacking context when it carries marks", () => {
    const strengths = [0, 0.4];
    for (const on of [false, true]) {
      for (const strength of strengths) {
        const d: Dressing = { ...emptyDressing(1), stain: { on, strength } };
        expect(isDrawn(d)).toBe(dressPage(d, 3, "text").length > 0);
      }
    }
    expect(isDrawn(null)).toBe(false);
  });
});

describe("a fresh dressing", () => {
  it("starts with every part off and counts as bare until one is on", () => {
    expect(isBare(emptyDressing(1))).toBe(true);
    expect(isBare({ ...emptyDressing(1), wash: { on: true, strength: 0.5 } })).toBe(false);
  });

  it("makes a seed parseDressing accepts", () => {
    for (let i = 0; i < 50; i++) expect(parseDressing(emptyDressing(newSeed()))).not.toBeNull();
  });
});

describe("the shipped marks", () => {
  const dir = path.join(import.meta.dirname, "../../../public/assets/paintbox/marks");
  it.each(Object.entries(MARK_ASSETS))("%s is where it is said to be, with the proportions the placement assumes", async (_id, { path: file, aspect }) => {
    // Fails on: art re-exported at another trim without updating MARK_ASSETS, so every mark stretches.
    const onDisk = path.join(dir, path.basename(file));
    expect(existsSync(onDisk)).toBe(true);
    if (file.endsWith(".svg")) {
      const [, w, h] = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(readFileSync(onDisk, "utf8")) ?? [];
      expect(Number(w) / Number(h)).toBeCloseTo(aspect, 3);
    } else {
      const meta = await sharp(onDisk).metadata();
      expect((meta.width ?? 0) / (meta.height ?? 1)).toBeCloseTo(aspect, 3);
    }
  });
});
