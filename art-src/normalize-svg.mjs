import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

// Generic: wrap tight potrace traces into a shared 0 0 100 100 viewBox,
// centered with PAD padding. Usage:
//   node normalize-svg.mjs <outDir> <name1> <name2> ...
// Reads <name>.svg from the cwd, writes <outDir>/<name>.svg.
const [, , outDir, ...names] = process.argv;
if (!outDir || !names.length) {
  console.error("usage: node normalize-svg.mjs <outDir> <name...>");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const BOX = 100;
const PAD = 10;
const LIVE = BOX - PAD * 2;
const t = (n) => Number(n.toFixed(3));

for (const name of names) {
  const src = readFileSync(`${name}.svg`, "utf8");
  const vb = src.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  if (!vb) throw new Error(`no viewBox in ${name}.svg`);
  const w = parseFloat(vb[1]);
  const h = parseFloat(vb[2]);
  const g = src.match(/<g transform=[\s\S]*?<\/g>/);
  if (!g) throw new Error(`no <g> in ${name}.svg`);

  const scale = LIVE / Math.max(w, h);
  const tx = (BOX - w * scale) / 2;
  const ty = (BOX - h * scale) / 2;

  writeFileSync(
    `${outDir}/${name}.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BOX} ${BOX}">
<g transform="translate(${t(tx)} ${t(ty)}) scale(${t(scale)})">
${g[0]}
</g>
</svg>
`,
  );
  console.log(`${name.padEnd(12)} ${t(w)}x${t(h)} -> ${t(scale)}`);
}
