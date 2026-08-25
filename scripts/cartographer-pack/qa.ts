import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import { BASE_TILE_SIZE, type AssetSlot, type PackCategory, type TilePackManifest } from "../../src/cartographer/packSchema.ts";
import { validatePack, type ValidationResult } from "../../src/cartographer/validatePack.ts";

export interface AssetCheck {
  category: PackCategory;
  side?: string;
  variant: number;
  path: string;
  exists: boolean;
  format?: string;
  width?: number;
  height?: number;
  has_alpha?: boolean;
  alpha_min?: number;
  edge_delta?: number;
  issues: string[];
}

export interface AuthoringValidationReport {
  generated_at: string;
  schema: ValidationResult;
  assets: AssetCheck[];
  failed_jobs: string[];
  valid: boolean;
}

function slotPath(packRoot: string, slot: AssetSlot): string {
  return path.join(packRoot, slot.url);
}

function needsTransparency(category: PackCategory): boolean {
  return category === "wallSegmentH" || category === "wallSegmentV" || category === "wallRoundJoint" ||
    category.startsWith("door") || category === "rubble" || category === "debris" || category.startsWith("object");
}

async function edgeDelta(file: string): Promise<number> {
  const image = sharp(file).removeAlpha().resize(BASE_TILE_SIZE, BASE_TILE_SIZE, { fit: "fill" });
  const [left, right, top, bottom] = await Promise.all([
    image.clone().extract({ left: 0, top: 0, width: 1, height: BASE_TILE_SIZE }).raw().toBuffer(),
    image.clone().extract({ left: BASE_TILE_SIZE - 1, top: 0, width: 1, height: BASE_TILE_SIZE }).raw().toBuffer(),
    image.clone().extract({ left: 0, top: 0, width: BASE_TILE_SIZE, height: 1 }).raw().toBuffer(),
    image.clone().extract({ left: 0, top: BASE_TILE_SIZE - 1, width: BASE_TILE_SIZE, height: 1 }).raw().toBuffer(),
  ]);
  let total = 0;
  let count = 0;
  for (let index = 0; index < left.length; index++) {
    total += Math.abs(left[index]! - right[index]!);
    count++;
  }
  for (let index = 0; index < top.length; index++) {
    total += Math.abs(top[index]! - bottom[index]!);
    count++;
  }
  return Math.round((total / Math.max(count, 1)) * 100) / 100;
}

async function lightBoundaryRatio(file: string): Promise<number> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = new Set<number>();
  for (let x = 0; x < info.width; x++) {
    pixels.add(x);
    pixels.add((info.height - 1) * info.width + x);
  }
  for (let y = 1; y < info.height - 1; y++) {
    pixels.add(y * info.width);
    pixels.add(y * info.width + info.width - 1);
  }
  let contaminated = 0;
  for (const pixel of pixels) {
    const offset = pixel * info.channels;
    const r = data[offset]!;
    const g = data[offset + 1]!;
    const b = data[offset + 2]!;
    const alpha = info.channels === 4 ? data[offset + 3]! : 255;
    if (alpha > 32 && Math.min(r, g, b) >= 210 && Math.max(r, g, b) - Math.min(r, g, b) <= 24) contaminated++;
  }
  return contaminated / Math.max(pixels.size, 1);
}

async function checkAsset(packRoot: string, category: PackCategory, slot: AssetSlot): Promise<AssetCheck> {
  const file = slotPath(packRoot, slot);
  const check: AssetCheck = {
    category,
    ...(slot.side ? { side: slot.side } : {}),
    variant: slot.variant,
    path: file,
    exists: true,
    issues: [],
  };
  try {
    await access(file);
  } catch {
    check.exists = false;
    check.issues.push("file is missing");
    return check;
  }
  try {
    const image = sharp(file);
    const metadata = await image.metadata();
    const stats = await image.stats();
    const alpha = metadata.hasAlpha ? stats.channels.at(-1) : undefined;
    Object.assign(check, {
      format: metadata.format,
      width: metadata.width,
      height: metadata.height,
      has_alpha: metadata.hasAlpha,
      ...(alpha ? { alpha_min: alpha.min } : {}),
    });
    if (metadata.format !== "webp") check.issues.push(`format is ${metadata.format ?? "unknown"}, expected webp`);
    if (metadata.width !== BASE_TILE_SIZE || metadata.height !== BASE_TILE_SIZE) {
      check.issues.push(`dimensions are ${metadata.width ?? "?"}×${metadata.height ?? "?"}, expected ${BASE_TILE_SIZE}×${BASE_TILE_SIZE}`);
    }
    if (needsTransparency(category) && (!metadata.hasAlpha || (alpha?.min ?? 255) === 255)) {
      check.issues.push("transparent footprint required but no transparent pixels found");
    }
    if (needsTransparency(category) && await lightBoundaryRatio(file) > 0.02) {
      check.issues.push("opaque light background reaches the asset boundary");
    }
    if (category === "doorOpenH" || category === "doorOpenV") {
      const gap = Math.round(BASE_TILE_SIZE * 0.12);
      const horizontal = category === "doorOpenH";
      const gapBuffer = await image.clone().extract(horizontal
        ? { left: Math.round((BASE_TILE_SIZE - gap) / 2), top: Math.round(BASE_TILE_SIZE * 0.42), width: gap, height: Math.round(BASE_TILE_SIZE * 0.16) }
        : { left: Math.round(BASE_TILE_SIZE * 0.42), top: Math.round((BASE_TILE_SIZE - gap) / 2), width: Math.round(BASE_TILE_SIZE * 0.16), height: gap })
        .ensureAlpha()
        .png()
        .toBuffer();
      const gapStats = await sharp(gapBuffer).stats();
      const gapAlpha = gapStats.channels.at(-1);
      if ((gapAlpha?.mean ?? 255) > 32) check.issues.push(`open-door crossing is not transparently clear (mean alpha ${gapAlpha?.mean ?? 255})`);
    }
    if (category === "floor" || category === "solidBlock") check.edge_delta = await edgeDelta(file);
  } catch (error) {
    check.issues.push(`decode failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return check;
}

export async function validateAuthoredPack(input: {
  repoRoot: string;
  manifest: TilePackManifest;
  failedJobs?: string[];
  now?: string;
}): Promise<AuthoringValidationReport> {
  const packRoot = path.join(input.repoRoot, "public", "cartographer", input.manifest.pack_id, `v${input.manifest.pack_version}`);
  const checks: Promise<AssetCheck>[] = [];
  for (const [category, slots] of Object.entries(input.manifest.assets)) {
    for (const slot of (slots ?? []) as AssetSlot[]) checks.push(checkAsset(packRoot, category as PackCategory, slot));
  }
  const schema = validatePack(input.manifest);
  const assets = await Promise.all(checks);
  const failedJobs = input.failedJobs ?? [];
  return {
    generated_at: input.now ?? new Date().toISOString(),
    schema,
    assets,
    failed_jobs: failedJobs,
    valid: schema.valid && schema.extras.length === 0 && assets.every((asset) => asset.issues.length === 0) && failedJobs.length === 0,
  };
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function nextRandom(state: { value: number }): number {
  state.value = (Math.imul(state.value, 1664525) + 1013904223) >>> 0;
  return state.value;
}

export function seededVariantGrid(width: number, height: number, variantCount: number, seed: string): number[][] {
  if (variantCount < 1) throw new Error("variantCount must be positive");
  const random = { value: hashSeed(seed) };
  const grid: number[][] = [];
  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) {
      const left = row[x - 1];
      const up = grid[y - 1]?.[x];
      let candidates = Array.from({ length: variantCount }, (_, index) => index)
        .filter((index) => index !== left && index !== up);
      if (!candidates.length) candidates = Array.from({ length: variantCount }, (_, index) => index).filter((index) => index !== left);
      if (!candidates.length) candidates = [0];
      row.push(candidates[nextRandom(random) % candidates.length]!);
    }
    grid.push(row);
  }
  return grid;
}

function textSvg(width: number, height: number, text: string, fontSize = 18): Buffer {
  const escaped = text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#111827"/>
    <text x="10" y="${Math.round(height * 0.68)}" fill="#f8fafc" font-family="sans-serif" font-size="${fontSize}">${escaped}</text>
  </svg>`);
}

interface LocatedSlot { category: PackCategory; slot: AssetSlot; file: string }

function locatedSlots(repoRoot: string, manifest: TilePackManifest): LocatedSlot[] {
  const packRoot = path.join(repoRoot, "public", "cartographer", manifest.pack_id, `v${manifest.pack_version}`);
  return Object.entries(manifest.assets).flatMap(([category, slots]) =>
    ((slots ?? []) as AssetSlot[]).map((slot) => ({ category: category as PackCategory, slot, file: slotPath(packRoot, slot) })),
  );
}

async function contactSheet(output: string, slots: LocatedSlot[]): Promise<void> {
  const columns = 4;
  const cellWidth = 176;
  const cellHeight = 176;
  const rows = Math.max(1, Math.ceil(slots.length / columns));
  const composites: OverlayOptions[] = [];
  for (const [index, located] of slots.entries()) {
    const x = (index % columns) * cellWidth;
    const y = Math.floor(index / columns) * cellHeight;
    composites.push({ input: located.file, left: x + 24, top: y + 8 });
    composites.push({ input: textSvg(cellWidth, 32, `${located.category}${located.slot.side ? `/${located.slot.side}` : ""}/${located.slot.variant}`, 14), left: x, top: y + 140 });
  }
  await sharp({ create: { width: columns * cellWidth, height: rows * cellHeight, channels: 3, background: "#334155" } })
    .composite(composites)
    .png()
    .toFile(output);
}

async function tiledFloorPreview(output: string, floorFiles: string[], seed: string, width = 20, height = 20): Promise<void> {
  const grid = seededVariantGrid(width, height, floorFiles.length, seed);
  const tile = 64;
  const inputs = await Promise.all(floorFiles.map((file) => sharp(file).resize(tile, tile).toBuffer()));
  const composites = grid.flatMap((row, y) => row.map((variant, x) => ({ input: inputs[variant]!, left: x * tile, top: y * tile })));
  await sharp({ create: { width: width * tile, height: height * tile, channels: 3, background: "#000000" } })
    .composite(composites)
    .png()
    .toFile(output);
}

async function seamPreview(output: string, floorFiles: string[]): Promise<void> {
  const tile = BASE_TILE_SIZE;
  const width = Math.max(1, floorFiles.length) * tile * 2;
  const composites: OverlayOptions[] = [];
  for (const [variant, file] of floorFiles.entries()) {
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 2; x++) composites.push({ input: file, left: variant * tile * 2 + x * tile, top: y * tile });
    }
  }
  await sharp({ create: { width, height: tile * 2, channels: 3, background: "#000000" } }).composite(composites).png().toFile(output);
}

async function alignmentPreview(output: string, manifest: TilePackManifest, repoRoot: string): Promise<void> {
  const root = path.join(repoRoot, "public", "cartographer", manifest.pack_id, `v${manifest.pack_version}`);
  const first = (category: PackCategory): string | undefined => {
    const slot = manifest.assets[category]?.[0];
    return slot ? path.join(root, slot.url) : undefined;
  };
  const floor = first("floor");
  if (!floor) throw new Error("Cannot make alignment QA without a floor tile");
  const size = 5 * BASE_TILE_SIZE;
  const composites: OverlayOptions[] = [];
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) composites.push({ input: floor, left: x * BASE_TILE_SIZE, top: y * BASE_TILE_SIZE });
  const edgePlacements: [PackCategory, number, number][] = [
    ["wallSegmentH", 1, 2], ["doorClosedH", 2, 2], ["doorOpenH", 3, 2],
    ["wallSegmentV", 2, 1], ["doorClosedV", 2, 3], ["doorOpenV", 2, 4],
  ];
  for (const [category, x, y] of edgePlacements) {
    const file = first(category);
    if (!file) continue;
    const horizontal = category.endsWith("H");
    composites.push({
      input: file,
      left: horizontal ? x * BASE_TILE_SIZE : x * BASE_TILE_SIZE - BASE_TILE_SIZE / 2,
      top: horizontal ? y * BASE_TILE_SIZE - BASE_TILE_SIZE / 2 : y * BASE_TILE_SIZE,
    });
  }
  await sharp({ create: { width: size, height: size, channels: 3, background: "#000000" } }).composite(composites).png().toFile(output);
}

async function sampleMap(output: string, manifest: TilePackManifest, repoRoot: string): Promise<void> {
  const root = path.join(repoRoot, "public", "cartographer", manifest.pack_id, `v${manifest.pack_version}`);
  const files = (category: PackCategory) => (manifest.assets[category] ?? []).map((slot) => path.join(root, slot.url));
  const floors = files("floor");
  const solids = files("solidBlock");
  if (!floors.length || !solids.length) throw new Error("Cannot make sample map without floor and solidBlock assets");
  const width = 10;
  const height = 8;
  const grid = seededVariantGrid(width, height, floors.length, `${manifest.pack_id}:sample`);
  const composites: OverlayOptions[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const boundary = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      const file = boundary ? solids[(x + y) % solids.length]! : floors[grid[y]![x]!]!;
      composites.push({ input: file, left: x * BASE_TILE_SIZE, top: y * BASE_TILE_SIZE });
    }
  }
  const door = manifest.assets.doorClosedH?.[0];
  if (door) composites.push({ input: path.join(root, door.url), left: 4 * BASE_TILE_SIZE, top: BASE_TILE_SIZE / 2 });
  await sharp({ create: { width: width * BASE_TILE_SIZE, height: height * BASE_TILE_SIZE, channels: 3, background: "#020617" } })
    .composite(composites)
    .png()
    .toFile(output);
}

export async function generateQa(input: {
  repoRoot: string;
  workspaceRoot: string;
  manifest: TilePackManifest;
  failedJobs?: string[];
}): Promise<AuthoringValidationReport> {
  const qaRoot = path.join(input.workspaceRoot, "qa");
  await mkdir(qaRoot, { recursive: true });
  const report = await validateAuthoredPack(input);
  await writeFile(path.join(qaRoot, "validation-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const slots = locatedSlots(input.repoRoot, input.manifest).filter((slot) => report.assets.some((asset) => asset.path === slot.file && asset.exists));
  const floors = slots.filter((slot) => slot.category === "floor").map((slot) => slot.file);
  if (slots.length) await contactSheet(path.join(qaRoot, "contact-sheet.png"), slots);
  if (floors.length) {
    await seamPreview(path.join(qaRoot, "floor-seams.png"), floors);
    await tiledFloorPreview(path.join(qaRoot, "floor-variation-20x20.png"), floors, `${input.manifest.pack_id}:variation`);
  }
  if (floors.length) await alignmentPreview(path.join(qaRoot, "wall-door-alignment.png"), input.manifest, input.repoRoot);
  if (floors.length && input.manifest.assets.solidBlock?.length) {
    await sampleMap(path.join(qaRoot, "sample-map.png"), input.manifest, input.repoRoot);
  }
  return report;
}

export async function readManifest(file: string): Promise<TilePackManifest> {
  return JSON.parse(await readFile(file, "utf8")) as TilePackManifest;
}
