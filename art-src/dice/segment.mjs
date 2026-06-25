import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";

// Gutter-aware slicer for an icon sheet: finds the white rows/columns between
// glyphs (via a darkness projection) and crops each cell on those gutters,
// instead of a fixed even grid that can clip glyphs straddling a boundary.
//
// Usage: node segment.mjs <sheet.png> <outDir> <cols> <rows>
const [, , sheet, outDir, colsArg, rowsArg] = process.argv;
const COLS = Number(colsArg);
const ROWS = Number(rowsArg);
mkdirSync(outDir, { recursive: true });

// Full image dimensions.
const dim = execSync(`magick identify -format "%w %h" ${JSON.stringify(sheet)}`)
  .toString()
  .split(" ")
  .map(Number);
const [W, H] = dim;

const SAMPLES = 400;
const profile = (resize) =>
  Array.from(
    execSync(
      `magick ${JSON.stringify(sheet)} -colorspace Gray -negate -resize ${resize} -depth 8 gray:-`,
      { maxBuffer: 1 << 24 },
    ),
  );

// runs of "content" (darkness above a small threshold), as [startFrac, endFrac]
function bands(values, expected) {
  const max = Math.max(...values);
  const thresh = max * 0.06;
  const runs = [];
  let start = -1;
  for (let i = 0; i < values.length; i++) {
    const on = values[i] > thresh;
    if (on && start < 0) start = i;
    if (!on && start >= 0) {
      runs.push([start, i - 1]);
      start = -1;
    }
  }
  if (start >= 0) runs.push([start, values.length - 1]);
  // keep the widest `expected` runs (drops speckle), then sort by position
  runs.sort((a, b) => b[1] - b[0] - (a[1] - a[0]));
  return runs
    .slice(0, expected)
    .sort((a, b) => a[0] - b[0])
    .map(([s, e]) => [s / values.length, (e + 1) / values.length]);
}

const colBands = bands(profile(`${SAMPLES}x1!`), COLS);
const rowBands = bands(profile(`1x${SAMPLES}!`), ROWS);
if (colBands.length !== COLS || rowBands.length !== ROWS) {
  console.error(
    `expected ${COLS}x${ROWS} bands, found ${colBands.length}x${rowBands.length}`,
  );
}

// Cut lines run through the MIDDLE of the white gutters between glyphs, so each
// cell contains a whole glyph including faint extremities (scroll curls, the
// rounded top of a pin) that a band-edge crop would shave off.
function cuts(b) {
  const c = [0];
  for (let i = 1; i < b.length; i++) c.push((b[i - 1][1] + b[i][0]) / 2);
  c.push(1);
  return c;
}
const colCuts = cuts(colBands);
const rowCuts = cuts(rowBands);

let i = 0;
for (let r = 0; r < rowBands.length; r++) {
  for (let c = 0; c < colBands.length; c++) {
    const x = Math.round(colCuts[c] * W);
    const y = Math.round(rowCuts[r] * H);
    const w = Math.round(colCuts[c + 1] * W) - x;
    const h = Math.round(rowCuts[r + 1] * H) - y;
    execSync(
      `magick ${JSON.stringify(sheet)} -crop ${w}x${h}+${x}+${y} +repage ${JSON.stringify(`${outDir}/cell_${i}.png`)}`,
    );
    i++;
  }
}
console.log(`cols cut @ ${colCuts.map((b) => b.toFixed(2)).join(",")}`);
console.log(`rows cut @ ${rowCuts.map((b) => b.toFixed(2)).join(",")}`);
console.log(`wrote ${i} cells to ${outDir}`);
