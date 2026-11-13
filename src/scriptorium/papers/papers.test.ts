import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "@/generated/artManifest.json";
import sharp from "sharp";
import { PAPER_IDS, STOCK_GRAIN_PATHS, STOCK_PAPERS, paperById } from "./papers";

const PUBLIC = join(import.meta.dirname, "../../../public");
const STYLES = join(import.meta.dirname, "../styles");
const MIGRATIONS = join(import.meta.dirname, "../../../supabase/migrations");

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

  it("has the ten stock papers and the two handmade scans", () => {
    // Fails on: a scan left out of the shared list, so books lose "Grey" and "Warm grey".
    expect(PAPER_IDS).toHaveLength(12);
    expect(PAPER_IDS).toEqual(expect.arrayContaining(["grey", "warm-grey"]));
    expect(STOCK_PAPERS.map((p) => p.id)).toEqual([...PAPER_IDS]);
  });

  it("the database check on paper_tone allows exactly these ids", () => {
    // Fails on: a paper added here without a migration (saving a book on it is refused), or an id kept in SQL after it left.
    const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
    let ids: string[] | null = null;
    for (const file of files) {
      const text = readFileSync(join(MIGRATIONS, file), "utf8");
      const m = /add constraint scriptorium_documents_paper_tone_check check \(paper_tone in \(([^)]*)\)/.exec(text);
      if (m) ids = [...m[1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]!);
    }
    expect(ids, "no migration defines the paper_tone check").not.toBeNull();
    expect([...ids!].sort()).toEqual([...PAPER_IDS].sort());
  });
});

/** Every look's and handout theme's text colour, read from its stylesheet so a new look is covered by itself. */
function inkColours(): { file: string; ink: string }[] {
  return readdirSync(STYLES)
    .filter((f) => /^theme-(?!base).+\.css$/.test(f))
    .map((file) => {
      const m = /--sc-ink:\s*(#[0-9a-fA-F]{6})\s*;/.exec(readFileSync(join(STYLES, file), "utf8"));
      return { file, ink: m?.[1] ?? "" };
    });
}

const linear = (c: number) => {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
};
const luminance = (r: number, g: number, b: number) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

describe("paper legibility", () => {
  it("every look names its ink", () => {
    // Fails on: a theme without a literal --sc-ink, which would silently skip the contrast check below.
    const inks = inkColours();
    expect(inks.length).toBeGreaterThanOrEqual(7);
    for (const { file, ink } of inks) expect(ink, file).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it.each(PAPER_IDS)("%s: its darkest patches, under its veil, still carry every look's ink at 4.5:1", async (id) => {
    // Fails on: a veil too light for a dark paper (kraft, the greys, treasure map's mottling), which makes text hard to read.
    const paper = paperById(id);
    const { data } = await sharp(join(PUBLIC, paper.surfacePath)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    // Every pixel is read (a sample would thin out the darkest patches this guards), but the veil and the
    // linearisation are looked up per channel value instead of recomputed (and re-allocated) per pixel.
    const veiled = new Float64Array(256);
    const lin = new Float64Array(256);
    for (let v = 0; v < 256; v++) {
      veiled[v] = v * (1 - paper.veil) + 255 * paper.veil;
      lin[v] = linear(veiled[v]!);
    }
    const lums = new Float32Array(data.length / 3);
    const sums = [0, 0, 0];
    for (let i = 0, j = 0; i < data.length; i += 3, j++) {
      const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
      sums[0]! += veiled[r]!;
      sums[1]! += veiled[g]!;
      sums[2]! += veiled[b]!;
      lums[j] = 0.2126 * lin[r]! + 0.7152 * lin[g]! + 0.0722 * lin[b]!;
    }
    lums.sort();
    const darkest = lums[Math.floor(lums.length * 0.05)]!;
    for (const { file, ink } of inkColours()) {
      const n = (h: number) => parseInt(ink.slice(h, h + 2), 16);
      const contrast = (darkest + 0.05) / (luminance(n(1), n(3), n(5)) + 0.05);
      expect(contrast, `${id} behind ${file} ink ${ink}`).toBeGreaterThanOrEqual(4.5);
    }
    // The stored tint is the veiled surface's mean, so page tints match what is drawn.
    const tint = sums.map((m) => Math.round(m / lums.length));
    const stored = [1, 3, 5].map((h) => parseInt(paper.tint.slice(h, h + 2), 16));
    stored.forEach((c, k) => expect(Math.abs(c - tint[k]!), `${id} tint channel ${k}`).toBeLessThanOrEqual(3));
  });
});
