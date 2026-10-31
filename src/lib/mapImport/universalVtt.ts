/**
 * Universal VTT (.dd2vtt / .uvtt / .df2vtt) reading and writing, the format
 * Dungeondraft, Dungeon Alchemist and DungeonFog export (#1125 decision 7).
 * Coordinates in the file are grid units relative to `map_origin`; the parsed
 * map is in absolute grid units. Walls are free-angle segments.
 */

export interface UvttPoint {
  x: number;
  y: number;
}
export type UvttSegment = { a: [number, number]; b: [number, number] };
export type UvttDoor = UvttSegment & { open: boolean };
export interface UvttLight {
  x: number;
  y: number;
  rangeCells: number;
  intensity: number;
  /** "#rrggbb"; the file's alpha byte is dropped. */
  color: string;
}

export interface UniversalVttMap {
  image: Blob;
  cols: number;
  rows: number;
  pixelsPerGrid: number;
  walls: UvttSegment[];
  doors: UvttDoor[];
  lights: UvttLight[];
  ambient?: string;
}

export interface UvttError {
  error: string;
}

export function isUvttError(r: UniversalVttMap | UvttError): r is UvttError {
  return "error" in r;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function point(v: unknown): UvttPoint | null {
  if (!isRecord(v)) return null;
  const x = num(v.x);
  const y = num(v.y);
  return x === null || y === null ? null : { x, y };
}

function arrayOf(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** "ffeccd8b" is ARGB; the CSS colour is the last six digits. */
export function argbToHex(argb: string): string | null {
  const m = /^#?([0-9a-f]{8}|[0-9a-f]{6})$/i.exec(argb);
  if (!m) return null;
  return `#${m[1].slice(-6).toLowerCase()}`;
}

function hexToArgb(hex: string): string {
  return `ff${hex.replace("#", "").toLowerCase()}`;
}

function sniffImageMime(bytes: Uint8Array): string | null {
  const startsWith = (sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (startsWith([0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && bytes[8] === 0x57 && bytes[9] === 0x45) return "image/webp";
  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  return null;
}

function decodeBase64(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64.replace(/^data:[^,]*,/, "").replace(/\s/g, ""));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export function parseUniversalVtt(json: unknown): UniversalVttMap | UvttError {
  if (!isRecord(json)) return { error: "This is not a Universal VTT file." };
  const res = json.resolution;
  if (!isRecord(res)) return { error: "The file has no map size." };
  const size = point(res.map_size);
  const ppg = num(res.pixels_per_grid);
  if (!size || ppg === null || size.x <= 0 || size.y <= 0 || ppg <= 0) {
    return { error: "The file has no usable map size." };
  }
  const origin = point(res.map_origin) ?? { x: 0, y: 0 };

  if (typeof json.image !== "string" || json.image.length === 0) return { error: "The file has no map picture." };
  const bytes = decodeBase64(json.image);
  const mime = bytes ? sniffImageMime(bytes) : null;
  if (!bytes || !mime) return { error: "The map picture is not a PNG, WebP or JPEG." };

  const shift = (p: UvttPoint): [number, number] => [p.x + origin.x, p.y + origin.y];

  const walls: UvttSegment[] = [];
  for (const key of ["line_of_sight", "objects_line_of_sight"] as const) {
    for (const line of arrayOf(json[key])) {
      const pts = arrayOf(line).map(point);
      if (pts.some((p) => p === null)) continue;
      const clean = pts.filter((p): p is UvttPoint => p !== null);
      for (let i = 0; i + 1 < clean.length; i++) walls.push({ a: shift(clean[i]), b: shift(clean[i + 1]) });
    }
  }

  const doors: UvttDoor[] = [];
  for (const p of arrayOf(json.portals)) {
    if (!isRecord(p)) continue;
    const bounds = arrayOf(p.bounds).map(point);
    const a = bounds[0];
    const b = bounds[1];
    if (!a || !b) continue;
    doors.push({ a: shift(a), b: shift(b), open: p.closed === false });
  }

  const lights: UvttLight[] = [];
  for (const l of arrayOf(json.lights)) {
    if (!isRecord(l)) continue;
    const pos = point(l.position);
    const range = num(l.range);
    if (!pos || range === null) continue;
    const color = typeof l.color === "string" ? argbToHex(l.color) : null;
    const intensity = num(l.intensity);
    const [x, y] = shift(pos);
    lights.push({ x, y, rangeCells: range, intensity: intensity === null ? 1 : intensity, color: color === null ? "#ffffff" : color });
  }

  const map: UniversalVttMap = {
    image: new Blob([bytes as BlobPart], { type: mime }),
    cols: size.x,
    rows: size.y,
    pixelsPerGrid: ppg,
    walls,
    doors,
    lights,
  };
  if (isRecord(json.environment) && typeof json.environment.ambient_light === "string") {
    const amb = argbToHex(json.environment.ambient_light);
    if (amb) map.ambient = amb;
  }
  return map;
}

export interface UvttWriteInput {
  /** Base64 of a PNG or WebP, no data: prefix. */
  imageBase64: string;
  cols: number;
  rows: number;
  pixelsPerGrid: number;
  walls: UvttSegment[];
  doors: UvttDoor[];
  lights: UvttLight[];
}

/** Format 0.3 JSON, readable by Foundry, Roll20 importers and Owlbear. Origin is always 0,0. */
export function writeUniversalVtt(input: UvttWriteInput) {
  const pt = ([x, y]: [number, number]) => ({ x, y });
  return {
    format: 0.3,
    resolution: {
      map_origin: { x: 0, y: 0 },
      map_size: { x: input.cols, y: input.rows },
      pixels_per_grid: input.pixelsPerGrid,
    },
    line_of_sight: input.walls.map((w) => [pt(w.a), pt(w.b)]),
    objects_line_of_sight: [],
    portals: input.doors.map((d) => ({
      position: { x: (d.a[0] + d.b[0]) / 2, y: (d.a[1] + d.b[1]) / 2 },
      bounds: [pt(d.a), pt(d.b)],
      rotation: 0,
      closed: !d.open,
      freestanding: false,
    })),
    lights: input.lights.map((l) => ({
      position: { x: l.x, y: l.y },
      range: l.rangeCells,
      intensity: l.intensity,
      color: hexToArgb(l.color),
      shadows: true,
    })),
    environment: { baked_lighting: false, ambient_light: "ffffffff" },
    image: input.imageBase64,
  };
}
