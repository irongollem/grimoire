/**
 * The glyph pipeline: sheet → cells → potrace traces → generated modules.
 * The `/glyph` skill (`.agents/skills/glyph/SKILL.md`) walks through a run.
 *
 *   npx tsx scripts/glyphs/cli.ts segment <sheet.png> <outDir> <cols> <rows>
 *   npx tsx scripts/glyphs/cli.ts module  <set> <traceDir> <name...>
 *   npx tsx scripts/glyphs/cli.ts add     <set> <traceDir> <name>
 *   npx tsx scripts/glyphs/cli.ts svg     <traceDir> <outDir> <name...>
 *   npx tsx scripts/glyphs/cli.ts preview <set> <name> <out.png>
 *   npx tsx scripts/glyphs/cli.ts optimize <set>
 *   npx tsx scripts/glyphs/cli.ts compare  <set> <beforeModule.ts>
 *
 * <set> is one of the GLYPH_SETS keys. Traces are read as <traceDir>/<name>.svg.
 * Paths resolve against the directory you run it from; the generated modules
 * resolve against the repo root.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import sharp from "sharp";
import { compareSets, type SetComparison } from "./glyphCompare";
import { optimizeGlyph } from "./glyphOptimize";
import {
  GLYPH_SETS,
  INLINE_PAD,
  STANDALONE_PAD,
  assertGlyphName,
  glyphModule,
  inlineGlyph,
  isGlyphSetName,
  normalizeTrace,
  previewSvg,
  readGlyph,
  readGlyphs,
  spliceGlyph,
  standaloneSvg,
  type GlyphSet,
} from "./glyphTrace";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function glyphSet(name: string | undefined): GlyphSet {
  if (!name || !isGlyphSetName(name)) {
    fail(`unknown set '${name}'; expected one of: ${Object.keys(GLYPH_SETS).join(", ")}`);
  }
  return GLYPH_SETS[name];
}

function readTrace(traceDir: string, name: string, pad: number) {
  const file = join(traceDir, `${name}.svg`);
  return normalizeTrace(readFileSync(file, "utf8"), pad, file);
}

// Gutter-aware slicer: finds the white rows and columns between glyphs from a
// darkness projection and cuts through the middle of each gutter, so a glyph
// straddling an even-grid line keeps its extremities (scroll curls, the round
// top of a pin) that a fixed grid or a band-edge crop would shave off.
function segment(sheet: string, outDir: string, cols: number, rows: number): void {
  mkdirSync(outDir, { recursive: true });
  const [width, height] = execFileSync("magick", ["identify", "-format", "%w %h", sheet])
    .toString()
    .split(" ")
    .map(Number);

  const SAMPLES = 400;
  const profile = (resize: string) =>
    Array.from(
      execFileSync("magick", [sheet, "-colorspace", "Gray", "-negate", "-resize", resize, "-depth", "8", "gray:-"], {
        maxBuffer: 1 << 24,
      }),
    );

  // Runs of content (darkness above a small threshold) as [startFrac, endFrac];
  // keeps the widest `expected` runs, which drops speckle.
  const bands = (values: number[], expected: number): Array<[number, number]> => {
    const thresh = Math.max(...values) * 0.06;
    const runs: Array<[number, number]> = [];
    let start = -1;
    values.forEach((v, i) => {
      const on = v > thresh;
      if (on && start < 0) start = i;
      if (!on && start >= 0) {
        runs.push([start, i - 1]);
        start = -1;
      }
    });
    if (start >= 0) runs.push([start, values.length - 1]);
    return runs
      .sort((a, b) => b[1] - b[0] - (a[1] - a[0]))
      .slice(0, expected)
      .sort((a, b) => a[0] - b[0])
      .map(([s, e]) => [s / values.length, (e + 1) / values.length]);
  };

  const colBands = bands(profile(`${SAMPLES}x1!`), cols);
  const rowBands = bands(profile(`1x${SAMPLES}!`), rows);
  if (colBands.length !== cols || rowBands.length !== rows) {
    console.error(`expected ${cols}x${rows} bands, found ${colBands.length}x${rowBands.length}`);
  }

  const cuts = (b: Array<[number, number]>) => {
    const c = [0];
    for (let i = 1; i < b.length; i++) c.push((b[i - 1][1] + b[i][0]) / 2);
    c.push(1);
    return c;
  };
  const colCuts = cuts(colBands);
  const rowCuts = cuts(rowBands);

  let i = 0;
  for (let r = 0; r < rowBands.length; r++) {
    for (let c = 0; c < colBands.length; c++) {
      const x = Math.round(colCuts[c] * width);
      const y = Math.round(rowCuts[r] * height);
      const w = Math.round(colCuts[c + 1] * width) - x;
      const h = Math.round(rowCuts[r + 1] * height) - y;
      execFileSync("magick", [sheet, "-crop", `${w}x${h}+${x}+${y}`, "+repage", join(outDir, `cell_${i}.png`)]);
      i++;
    }
  }
  console.log(`cols cut @ ${colCuts.map((b) => b.toFixed(2)).join(",")}`);
  console.log(`rows cut @ ${rowCuts.map((b) => b.toFixed(2)).join(",")}`);
  console.log(`wrote ${i} cells to ${outDir}`);
}

const gz = (text: string) => gzipSync(text).length;

function reportComparison(c: SetComparison): void {
  for (const [size, w] of Object.entries(c.worst)) {
    console.log(`  worst @${size}px: ${w.name} (${w.pixels} px differ, max level move ${w.maxLevel}/255)`);
  }
}

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case "segment": {
    const [sheet, outDir, cols, rows] = args;
    if (!sheet || !outDir || !Number(cols) || !Number(rows)) fail("usage: segment <sheet.png> <outDir> <cols> <rows>");
    segment(resolve(sheet), resolve(outDir), Number(cols), Number(rows));
    break;
  }
  case "module": {
    const [setName, traceDir, ...names] = args;
    const set = glyphSet(setName);
    if (!traceDir || !names.length) fail("usage: module <set> <traceDir> <name...>");
    names.forEach(assertGlyphName);
    const entries: Array<readonly [string, string]> = [];
    for (const name of names) entries.push([name, await inlineGlyph(readTrace(resolve(traceDir), name, INLINE_PAD))]);
    writeFileSync(join(REPO_ROOT, set.file), glyphModule(set, entries));
    console.log(`wrote ${set.file} (${entries.length} glyphs)`);
    break;
  }
  case "add": {
    const [setName, traceDir, name] = args;
    const set = glyphSet(setName);
    if (!traceDir || !name) fail("usage: add <set> <traceDir> <name>");
    assertGlyphName(name);
    const file = join(REPO_ROOT, set.file);
    const inner = await inlineGlyph(readTrace(resolve(traceDir), name, INLINE_PAD));
    writeFileSync(file, spliceGlyph(readFileSync(file, "utf8"), name, inner));
    console.log(`spliced '${name}' into ${set.file}`);
    break;
  }
  case "svg": {
    const [traceDir, outDir, ...names] = args;
    if (!traceDir || !outDir || !names.length) fail("usage: svg <traceDir> <outDir> <name...>");
    mkdirSync(resolve(outDir), { recursive: true });
    for (const name of names) {
      const t = readTrace(resolve(traceDir), name, STANDALONE_PAD);
      writeFileSync(join(resolve(outDir), `${name}.svg`), standaloneSvg(t));
      console.log(`${name.padEnd(12)} ${Number(t.width.toFixed(3))}x${Number(t.height.toFixed(3))} -> ${Number(t.scale.toFixed(3))}`);
    }
    break;
  }
  case "preview": {
    const [setName, name, out] = args;
    const set = glyphSet(setName);
    if (!name || !out) fail("usage: preview <set> <name> <out.png>");
    const inner = readGlyph(readFileSync(join(REPO_ROOT, set.file), "utf8"), name);
    if (inner === null) fail(`no '${name}' in ${set.file}`);
    // sharp (librsvg) rather than magick, whose SVG delegate cannot read stdin.
    await sharp(Buffer.from(previewSvg(inner))).png().toFile(resolve(out));
    console.log(`rendered '${name}' to ${out}`);
    break;
  }
  case "optimize": {
    // Re-optimise a generated module in place, operating on the stored markup
    // (the original traces are gone). Each glyph takes the smallest form that
    // renders the same (see glyphOptimize.ts); re-running is harmless.
    const [setName] = args;
    const set = glyphSet(setName);
    const file = join(REPO_ROOT, set.file);
    const before = readGlyphs(readFileSync(file, "utf8"));
    const after: Array<readonly [string, string]> = [];
    for (const [name, inner] of before) {
      const result = await optimizeGlyph(inner);
      console.log(`  ${name.padEnd(14)} ${String(inner.length).padStart(7)} -> ${String(result.markup.length).padStart(7)}  ${result.rung}`);
      after.push([name, result.markup]);
    }
    const comparison = await compareSets(before, after);
    console.log(`${set.file}: ${before.length} glyphs`);
    console.log(`  markup ${before.reduce((n, [, m]) => n + m.length, 0)} -> ${after.reduce((n, [, m]) => n + m.length, 0)} chars`);
    console.log(`  gzip   ${gz(before.map((e) => e[1]).join(""))} -> ${gz(after.map((e) => e[1]).join(""))} bytes`);
    reportComparison(comparison);
    if (!comparison.ok) fail("not written: a glyph differs after optimisation");
    writeFileSync(file, glyphModule(set, after));
    console.log("  written");
    break;
  }
  case "compare": {
    // Render every glyph of the set in the working module and in an earlier
    // copy of it (`git show <rev>:<path> > before.ts`) and report the worst.
    const [setName, beforeFile] = args;
    const set = glyphSet(setName);
    if (!beforeFile) fail("usage: compare <set> <beforeModule.ts>");
    const before = readGlyphs(readFileSync(resolve(beforeFile), "utf8"));
    const after = readGlyphs(readFileSync(join(REPO_ROOT, set.file), "utf8"));
    const comparison = await compareSets(before, after);
    console.log(`${set.file}: ${after.length} glyphs`);
    reportComparison(comparison);
    if (!comparison.ok) fail("visible difference");
    break;
  }
  default:
    fail("usage: cli.ts <segment|module|add|svg|preview|optimize|compare> …  (see the header of scripts/glyphs/cli.ts)");
}
