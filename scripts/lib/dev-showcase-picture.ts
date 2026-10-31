/**
 * A still for the showcase's Picture-only battlefield: a meadow with a ford, a
 * road and boulders, painted pixel by pixel into a PNG with node's own zlib (no
 * canvas in a script). It is an invented scene, committed nowhere: the script
 * uploads it to the local stack's storage and points `map_url` at it.
 */
import { deflateSync } from "node:zlib";

/** Deterministic value noise in 0..1, so a re-run draws the same field. */
function noise(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function smooth(x: number, y: number, scale: number, seed: number): number {
  const gx = x / scale;
  const gy = y / scale;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const s = (t: number) => t * t * (3 - 2 * t);
  const a = noise(x0, y0, seed);
  const b = noise(x0 + 1, y0, seed);
  const c = noise(x0, y0 + 1, seed);
  const d = noise(x0 + 1, y0 + 1, seed);
  return (
    a + (b - a) * s(fx) + (c + (d - c) * s(fx) - (a + (b - a) * s(fx))) * s(fy)
  );
}

const BOULDERS: readonly (readonly [number, number, number])[] = [
  [0.2, 0.3, 0.035],
  [0.28, 0.36, 0.022],
  [0.72, 0.68, 0.04],
  [0.8, 0.28, 0.025],
  [0.46, 0.82, 0.03],
];

function pixel(
  u: number,
  v: number,
  w: number,
  h: number,
): [number, number, number] {
  // Meadow: two octaves of green, a little noisier near the edges.
  const grass =
    0.55 * smooth(u * w, v * h, 60, 1) + 0.45 * smooth(u * w, v * h, 9, 2);
  let rgb: [number, number, number] = [
    58 + grass * 46,
    96 + grass * 54,
    48 + grass * 30,
  ];

  // A ford: a river that bends across the middle, with a shallow crossing where the road meets it.
  const riverY = 0.5 + 0.09 * Math.sin(u * Math.PI * 2.2 + 0.6);
  const dist = Math.abs(v - riverY);
  if (dist < 0.06) {
    const shallow = Math.abs(u - 0.52) < 0.07;
    const wave = smooth(u * w, v * h, 14, 3);
    rgb = shallow
      ? [118 + wave * 40, 150 + wave * 36, 150 + wave * 30]
      : [44 + wave * 30, 92 + wave * 40, 140 + wave * 40];
  } else if (dist < 0.07) {
    rgb = [150, 140, 100];
  }

  // A dirt road from the south-west corner, over the ford, to the north-east.
  const roadV = 0.88 - u * 0.78;
  if (Math.abs(v - roadV) < 0.025 && dist >= 0.06) {
    const dirt = smooth(u * w, v * h, 6, 4);
    rgb = [128 + dirt * 40, 104 + dirt * 32, 70 + dirt * 24];
  }

  for (const [bx, by, r] of BOULDERS) {
    const dx = (u - bx) * (w / h);
    const dy = v - by;
    if (dx * dx + dy * dy < r * r) {
      const shade = 1 - ((dx * 0.6 + dy * 0.8) / r) * 0.35;
      const g = 110 + 40 * shade;
      rgb = [g, g - 4, g - 10];
    }
  }
  return [rgb[0], rgb[1], rgb[2]].map((c) =>
    Math.max(0, Math.min(255, Math.round(c))),
  ) as [number, number, number];
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

export function renderBattlefieldPng(width: number, height: number): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x / width, y / height, width, height);
      raw[row + 1 + x * 3] = r;
      raw[row + 2 + x * 3] = g;
      raw[row + 3 + x * 3] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
