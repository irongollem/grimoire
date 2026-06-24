import { readFileSync, writeFileSync } from "node:fs";

// Reads <name>.svg (tight potrace output) from the current working directory
// and writes each normalized <name>.svg to the shipped asset dir, resolved
// relative to this script so it works regardless of where it's invoked.
const OUT_DIR = new URL("../../public/assets/damage-types/", import.meta.url);
const NAMES = [
  "acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic",
  "piercing", "poison", "psychic", "radiant", "slashing", "thunder",
];

const BOX = 100; // shared viewBox
const PAD = 10; // padding each side
const LIVE = BOX - PAD * 2; // live area

for (const name of NAMES) {
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
  const t = (n) => Number(n.toFixed(3));

  const out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BOX} ${BOX}">
<g transform="translate(${t(tx)} ${t(ty)}) scale(${t(scale)})">
${g[0]}
</g>
</svg>
`;
  writeFileSync(new URL(`${name}.svg`, OUT_DIR), out);
  console.log(`${name.padEnd(12)} ${t(w)}x${t(h)} -> scale ${t(scale)}`);
}
console.log("done");
