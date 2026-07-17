import { readFileSync, writeFileSync } from "node:fs";

// Add or replace a SINGLE glyph in an existing navGlyphs.*.ts data module,
// without re-tracing the other entries (their _trace scratch SVGs are long
// gone). Normalizes the tight potrace trace exactly like gen-glyphs.mjs
// (0 0 100 100 box, PAD 6, currentColor fill) and splices the key into the
// generated file, keeping every other entry byte-identical.
//
// Usage: node add-glyph.mjs <generatedFile.ts> <name>   (reads <name>.svg from cwd)
const [, , outFile, name] = process.argv;
if (!outFile || !name) {
  console.error("usage: node add-glyph.mjs <generatedFile.ts> <name>");
  process.exit(1);
}

const BOX = 100;
const PAD = 6;
const LIVE = BOX - PAD * 2;
const t = (n) => Number(n.toFixed(3));

const src = readFileSync(`${name}.svg`, "utf8");
const vb = src.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
if (!vb) throw new Error(`no viewBox in ${name}.svg`);
const w = parseFloat(vb[1]);
const h = parseFloat(vb[2]);
let g = src.match(/<g transform=[\s\S]*?<\/g>/)?.[0];
if (!g) throw new Error(`no <g> in ${name}.svg`);
g = g.replace(/fill="#000000"/g, 'fill="currentColor"');

const scale = LIVE / Math.max(w, h);
const tx = (BOX - w * scale) / 2;
const ty = (BOX - h * scale) / 2;
const inner = `<g transform="translate(${t(tx)} ${t(ty)}) scale(${t(scale)})">${g}</g>`;
const entry = `  ${name}: ${JSON.stringify(inner)},`;

let out = readFileSync(outFile, "utf8");
const existing = new RegExp(`^  ${name}: .*,$`, "m");
if (existing.test(out)) {
  out = out.replace(existing, entry);
} else {
  out = out.replace(/^\} as const;$/m, `${entry}\n} as const;`);
}
if (!out.includes(entry)) throw new Error(`failed to splice ${name} into ${outFile}`);
writeFileSync(outFile, out);
console.log(`spliced '${name}' into ${outFile}`);
