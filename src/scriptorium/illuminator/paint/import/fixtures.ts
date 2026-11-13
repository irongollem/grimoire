import { zipSync, zlibSync } from "fflate";

/*
 * Tiny hand-made brush files for the importer tests: an .abr writer (v1, v2 and v6 with a descriptor), a
 * binary plist and NSKeyedArchiver writer, and a PNG writer. Test support only; no real brush file is used.
 */

export const cat = (...parts: (Uint8Array | number[])[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};
export const u16 = (n: number): number[] => [(n >> 8) & 255, n & 255];
export const u32 = (n: number): number[] => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
export const ascii = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));
const f64 = (n: number): number[] => [...new Uint8Array(new Float64Array([n]).buffer)].reverse();
const ucs2 = (s: string): number[] => [...u32(s.length + 1), ...[...s].flatMap((c) => u16(c.charCodeAt(0))), 0, 0];

export function packBitsEncode(row: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  while (i < row.length) {
    let run = 1;
    while (i + run < row.length && row[i + run] === row[i] && run < 128) run++;
    if (run >= 2) {
      out.push(257 - run, row[i]);
      i += run;
    } else {
      let end = i + 1;
      while (end < row.length && end - i < 128 && (end + 1 >= row.length || row[end] !== row[end + 1])) end++;
      out.push(end - i - 1, ...row.subarray(i, end));
      i = end;
    }
  }
  return Uint8Array.from(out);
}

// ---------- action descriptors ----------

const key = (s: string): number[] => (s.length === 4 ? [...u32(0), ...ascii(s)] : [...u32(s.length), ...ascii(s)]);
export const d = {
  obj: (cls: string, entries: [string, number[]][]): number[] => [
    ...ascii("Objc"),
    ...ucs2(""),
    ...key(cls),
    ...u32(entries.length),
    ...entries.flatMap(([k, v]) => [...key(k), ...v]),
  ],
  list: (values: number[][]): number[] => [...ascii("VlLs"), ...u32(values.length), ...values.flat()],
  text: (s: string): number[] => [...ascii("TEXT"), ...ucs2(s)],
  unitf: (unit: string, v: number): number[] => [...ascii("UntF"), ...ascii(unit), ...f64(v)],
  bool: (v: boolean): number[] => [...ascii("bool"), v ? 1 : 0],
  long: (v: number): number[] => [...ascii("long"), ...u32(v >>> 0)],
  enum: (type: string, value: string): number[] => [...ascii("enum"), ...key(type), ...key(value)],
};

export const px = (v: number): number[] => d.unitf("#Pxl", v);
export const pct = (v: number): number[] => d.unitf("#Prc", v);
export const ang = (v: number): number[] => d.unitf("#Ang", v);

/** A preset descriptor like Photoshop's: a name and a "Brsh" tip, plus any extra keys. */
export function preset(name: string, tip: [string, number[]][], extra: [string, number[]][] = []): number[] {
  return d.obj("Brsh", [["Nm  ", d.text(name)], ["Brsh", d.obj("computedBrush", tip)], ...extra]);
}

export function descBlock(presets: number[][]): number[] {
  const root = d.obj("null", [["Brsh", d.list(presets)]]);
  // The root descriptor has no type tag of its own.
  return [...u32(16), ...root.slice(4)];
}

// ---------- abr ----------

export interface Tip {
  id: string;
  width: number;
  height: number;
  /** One byte per pixel (or two when `depth` is 16: pass the full byte stream). */
  pixels: Uint8Array;
  rle?: boolean;
  depth?: 8 | 16;
}

function picture(t: Tip): number[] {
  const depth = t.depth ?? 8;
  const rowBytes = t.width * (depth / 8);
  if (!t.rle) return [...u16(depth), 0, ...t.pixels];
  const rows = Array.from({ length: t.height }, (_, y) => packBitsEncode(t.pixels.subarray(y * rowBytes, (y + 1) * rowBytes)));
  return [...u16(depth), 1, ...rows.flatMap((r) => u16(r.length)), ...rows.flatMap((r) => [...r])];
}

function sampItem(t: Tip, subVersion: 1 | 2): number[] {
  if (t.id.length !== 36) throw new Error("a sample key is 36 characters");
  const body = [36, ...ascii(t.id), ...Array.from({ length: subVersion === 1 ? 10 : 264 }, () => 0), ...u32(0), ...u32(0), ...u32(t.height), ...u32(t.width), ...picture(t)];
  const padded = [...body, ...Array.from({ length: (4 - (body.length % 4)) % 4 }, () => 0)];
  return [...u32(body.length), ...padded];
}

export function buildAbrV6(tips: Tip[], presets: number[][] | null, subVersion: 1 | 2 = 2): Uint8Array {
  const block = (name: string, data: number[]): number[] => [...ascii("8BIM"), ...ascii(name), ...u32(data.length), ...data];
  return cat(
    u16(6),
    u16(subVersion),
    block("samp", tips.flatMap((t) => sampItem(t, subVersion))),
    presets === null ? [] : block("desc", descBlock(presets)),
  );
}

/** Version 1 or 2 file; a brush is computed (diameter, hardness...) or a sampled tip. */
export function buildAbrOld(
  version: 1 | 2,
  brushes: (
    | { computed: { spacing: number; diameter: number; roundness: number; hardness: number; angle: number } }
    | { name?: string; spacing: number; tip: Tip }
  )[],
): Uint8Array {
  const body = (b: (typeof brushes)[number]): [number, number[]] => {
    if ("computed" in b) {
      const c = b.computed;
      return [1, [...u32(0), ...u16(c.spacing), ...u16(c.diameter), ...u16(c.roundness), ...u16(c.hardness), ...u16(c.angle)]];
    }
    const t = b.tip;
    return [
      2,
      [
        ...u32(0),
        ...u16(b.spacing),
        ...(version === 2 ? ucs2(b.name ?? "") : []),
        1,
        ...Array.from({ length: 8 }, () => 0),
        ...u32(0),
        ...u32(0),
        ...u32(t.height),
        ...u32(t.width),
        ...picture(t),
      ],
    ];
  };
  return cat(u16(version), u16(brushes.length), ...brushes.flatMap((b) => {
    const [type, data] = body(b);
    return [u16(type), u32(data.length), data];
  }));
}

// ---------- binary plist ----------

export class Uid {
  constructor(readonly index: number) {}
}
type P = null | boolean | number | string | Uint8Array | Uid | P[] | Map<string, P>;

export function buildBplist(root: P): Uint8Array {
  const objects: number[][] = [];
  const refs = (n: number): number[] => u16(n);
  const lenHeader = (kind: number, n: number): number[] => (n < 15 ? [(kind << 4) | n] : [(kind << 4) | 15, 0x11, ...u16(n)]);
  const add = (v: P): number => {
    const at = objects.length;
    objects.push([]);
    let enc: number[];
    if (v === null) enc = [0x00];
    else if (typeof v === "boolean") enc = [v ? 0x09 : 0x08];
    else if (typeof v === "number") {
      enc = Number.isInteger(v) ? [0x11, ...u16(v)] : [0x23, ...f64(v)];
    } else if (typeof v === "string") enc = [...lenHeader(5, v.length), ...ascii(v)];
    else if (v instanceof Uint8Array) enc = [...lenHeader(4, v.length), ...v];
    else if (v instanceof Uid) enc = [0x80, v.index];
    else if (Array.isArray(v)) {
      const ids = v.map(add);
      enc = [...lenHeader(10, v.length), ...ids.flatMap(refs)];
    } else {
      const entries = [...v];
      const ks = entries.map(([k]) => add(k));
      const vs = entries.map(([, val]) => add(val));
      enc = [...lenHeader(13, entries.length), ...ks.flatMap(refs), ...vs.flatMap(refs)];
    }
    objects[at] = enc;
    return at;
  };
  add(root);
  const header = ascii("bplist00");
  const offsets: number[] = [];
  let at = header.length;
  for (const o of objects) {
    offsets.push(at);
    at += o.length;
  }
  const trailer = [0, 0, 0, 0, 0, 0, 4, 2, ...u32(0), ...u32(objects.length), ...u32(0), ...u32(0), ...u32(0), ...u32(at)];
  return cat(header, ...objects, offsets.flatMap(u32), trailer);
}

/** NSKeyedArchiver form: strings live in "$objects" and are reached through UIDs, like Procreate's. */
export function buildKeyedArchive(settings: Record<string, string | number | boolean>): Uint8Array {
  const objects: P[] = ["$null"];
  const dict = new Map<string, P>();
  objects.push(dict);
  objects.push(new Map<string, P>([["$classname", "SilicaBrush"]]));
  dict.set("$class", new Uid(2));
  for (const [k, v] of Object.entries(settings)) {
    if (typeof v === "string") {
      objects.push(v);
      dict.set(k, new Uid(objects.length - 1));
    } else dict.set(k, v);
  }
  return buildBplist(
    new Map<string, P>([
      ["$archiver", "NSKeyedArchiver"],
      ["$top", new Map<string, P>([["root", new Uid(1)]])],
      ["$objects", objects],
    ]),
  );
}

// ---------- png and zip ----------

/** An 8-bit PNG, filter 0, checksums left zero (the reader does not check them). */
export function buildPng(width: number, height: number, channels: 1 | 3 | 4, data: Uint8Array): Uint8Array {
  const colour = { 1: 0, 3: 2, 4: 6 }[channels];
  const rows = new Uint8Array((width * channels + 1) * height);
  for (let y = 0; y < height; y++) rows.set(data.subarray(y * width * channels, (y + 1) * width * channels), y * (width * channels + 1) + 1);
  const chunk = (type: string, body: Uint8Array | number[]): number[] => [...u32(body.length), ...ascii(type), ...body, 0, 0, 0, 0];
  return cat([137, 80, 78, 71, 13, 10, 26, 10], chunk("IHDR", [...u32(width), ...u32(height), 8, colour, 0, 0, 0]), chunk("IDAT", zlibSync(rows)), chunk("IEND", []));
}

export interface BrushFolder {
  dir: string;
  settings: Record<string, string | number | boolean>;
  shape?: Uint8Array;
  grain?: Uint8Array;
  rawArchive?: Uint8Array;
}

export function buildProcreate(folders: BrushFolder[], extra: Record<string, Uint8Array> = {}): Uint8Array {
  const files: Record<string, Uint8Array> = { ...extra };
  for (const f of folders) {
    const p = f.dir === "" ? "" : `${f.dir}/`;
    files[`${p}Brush.archive`] = f.rawArchive ?? buildKeyedArchive(f.settings);
    if (f.shape) files[`${p}Shape.png`] = f.shape;
    if (f.grain) files[`${p}Grain.png`] = f.grain;
  }
  return zipSync(files);
}

/** A 36-character sample key, like the ids real files use. */
export const sampleKey = (s: string): string => s.padEnd(36, "-");
