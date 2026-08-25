import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import {
  BASE_TILE_SIZE,
  TILE_PACK_SCHEMA,
  type PackCategory,
  type TilePackManifest,
} from "../../src/cartographer/packSchema.ts";
import {
  createDraftManifest,
  createGenerationPlan,
  upsertManifestSlot,
  type GenerationAttempt,
  type GenerationJob,
  type GenerationPlan,
  type PackArtBible,
} from "../../src/cartographer/authoringPlan.ts";

export const MANIFEST_FILE = "manifest.draft.json";
export const PLAN_FILE = "generation-plan.json";
export const ART_BIBLE_FILE = "art-bible.json";

export interface WorkspaceState {
  root: string;
  manifest: TilePackManifest;
  plan: GenerationPlan;
  artBible: PackArtBible;
}

export interface InitWorkspaceInput {
  repoRoot: string;
  workspaceRoot: string;
  packId: string;
  name: string;
  theme: string;
  packVersion: number;
  artBible: PackArtBible;
  palette?: TilePackManifest["palette"];
  references?: string[];
  now?: string;
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

export async function loadWorkspace(root: string): Promise<WorkspaceState> {
  const [manifest, plan, artBible] = await Promise.all([
    readJson<TilePackManifest>(path.join(root, MANIFEST_FILE)),
    readJson<GenerationPlan>(path.join(root, PLAN_FILE)),
    readJson<PackArtBible>(path.join(root, ART_BIBLE_FILE)),
  ]);
  return { root, manifest, plan, artBible };
}

export async function saveWorkspace(state: WorkspaceState): Promise<void> {
  state.plan.updated_at = new Date().toISOString();
  await Promise.all([
    writeJson(path.join(state.root, MANIFEST_FILE), state.manifest),
    writeJson(path.join(state.root, PLAN_FILE), state.plan),
    writeJson(path.join(state.root, ART_BIBLE_FILE), state.artBible),
  ]);
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function interiorCorner(side: string | undefined, size: number): { x: number; y: number } {
  switch (side) {
    case "L_NE": return { x: 0, y: size };
    case "L_SE": return { x: 0, y: 0 };
    case "L_SW": return { x: size, y: 0 };
    case "L_NW": return { x: size, y: size };
    default: throw new Error(`Unsupported rounded-junction side: ${side ?? "missing"}`);
  }
}

function stairRotation(side: string | undefined): number {
  switch (side) {
    case "N": return 0;
    case "E": return 90;
    case "S": return 180;
    case "W": return 270;
    default: return 0;
  }
}

function templateSvg(job: GenerationJob): string {
  const size = 1024;
  const band = Math.round(size * 0.18);
  const offset = Math.round((size - band) / 2);
  let footprint = `<rect width="${size}" height="${size}" fill="#d8dee9"/>`;
  if (job.mechanics.footprint === "centered-horizontal-edge") {
    if (job.slot.category === "doorOpenH") {
      const gap = Math.round(size * 0.28);
      const leaf = Math.round((size - gap) / 2);
      footprint = `<rect y="${offset}" width="${leaf}" height="${band}" fill="#586577"/><rect x="${leaf + gap}" y="${offset}" width="${leaf}" height="${band}" fill="#586577"/>`;
    } else {
      footprint = `<rect y="${offset}" width="${size}" height="${band}" fill="#586577"/>`;
    }
  } else if (job.mechanics.footprint === "centered-vertical-edge") {
    if (job.slot.category === "doorOpenV") {
      const gap = Math.round(size * 0.28);
      const leaf = Math.round((size - gap) / 2);
      footprint = `<rect x="${offset}" width="${band}" height="${leaf}" fill="#586577"/><rect x="${offset}" y="${leaf + gap}" width="${band}" height="${leaf}" fill="#586577"/>`;
    } else {
      footprint = `<rect x="${offset}" width="${band}" height="${size}" fill="#586577"/>`;
    }
  } else if (job.mechanics.footprint === "rounded-junction") {
    const corner = interiorCorner(job.slot.side, size);
    footprint = `<rect width="${size}" height="${size}" fill="#586577"/><circle cx="${corner.x}" cy="${corner.y}" r="${Math.round(size * 0.65)}" fill="#fff"/>`;
  } else if (job.mechanics.footprint === "centered-overlay") {
    footprint = `<circle cx="512" cy="512" r="330" fill="#586577"/>`;
  }
  const stairGuide = job.slot.category === "stairsUp" || job.slot.category === "stairsDown"
    ? `<g transform="rotate(${stairRotation(job.slot.side)} 512 512)" stroke="#111827" fill="none">
        <path d="M220 220H804M220 320H804M220 420H804M220 520H804M220 620H804M220 720H804M220 820H804" stroke-width="18" opacity="0.55"/>
        <path d="M512 820V220M512 220L430 330M512 220L594 330" stroke="#dc2626" stroke-width="28"/>
      </g>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" fill="#ffffff"/>
    ${footprint}
    ${stairGuide}
    <rect x="2" y="2" width="1020" height="1020" fill="none" stroke="#111827" stroke-width="4"/>
    <path d="M512 0V1024M0 512H1024" stroke="#dc2626" stroke-width="3" stroke-dasharray="16 16" opacity="0.7"/>
    <text x="32" y="54" font-family="sans-serif" font-size="30" fill="#111827">${escapeXml(job.id)} — ${escapeXml(job.mechanics.footprint)}</text>
  </svg>`;
}

async function writeJobFiles(root: string, plan: GenerationPlan): Promise<void> {
  await Promise.all(plan.jobs.flatMap((job) => [
    sharp(Buffer.from(templateSvg(job))).png().toFile(path.join(root, job.paths.template)),
    writeFile(path.join(root, job.paths.prompt), `${job.prompt.final_prompt}\n`, "utf8"),
  ]));
}

export async function initWorkspace(input: InitWorkspaceInput): Promise<WorkspaceState> {
  const root = path.resolve(input.workspaceRoot);
  await Promise.all(["templates", "prompts", "raw", "accepted", "qa"].map((dir) => mkdir(path.join(root, dir), { recursive: true })));
  const manifest = createDraftManifest({
    packId: input.packId,
    name: input.name,
    description: input.theme,
    packVersion: input.packVersion,
    palette: input.palette,
  });
  const plan = createGenerationPlan({
    manifest,
    artBible: input.artBible,
    userReferenceImages: input.references,
    now: input.now,
  });
  const state = { root, manifest, plan, artBible: input.artBible };
  await writeJobFiles(root, plan);
  await saveWorkspace(state);
  return state;
}

export async function rebuildPlan(root: string, selectedSlotIds?: string[]): Promise<WorkspaceState> {
  const state = await loadWorkspace(root);
  state.plan = createGenerationPlan({
    manifest: state.manifest,
    artBible: state.artBible,
    userReferenceImages: state.plan.user_reference_images,
    selectedSlotIds,
    existingPlan: state.plan,
  });
  await writeJobFiles(root, state.plan);
  await saveWorkspace(state);
  return state;
}

function findJob(plan: GenerationPlan, id: string): GenerationJob {
  const job = plan.jobs.find((candidate) => candidate.id === id);
  if (!job) throw new Error(`No job ${id}. Rebuild the plan with --slot ${id} first.`);
  return job;
}

function paletteBackground(manifest: TilePackManifest, category: PackCategory): { r: number; g: number; b: number; alpha: number } {
  const [r, g, b] = manifest.palette?.[category] ?? [24, 31, 46];
  return { r, g, b, alpha: 1 };
}

async function normalizeFullCell(source: string, destination: string, job: GenerationJob, manifest: TilePackManifest): Promise<void> {
  const image = job.slot.category === "wallJoint"
    ? sharp(source)
        .resize(BASE_TILE_SIZE * 3, BASE_TILE_SIZE * 3, { fit: "cover", position: "centre" })
        .extract({ left: BASE_TILE_SIZE, top: BASE_TILE_SIZE, width: BASE_TILE_SIZE, height: BASE_TILE_SIZE })
    : sharp(source).resize(BASE_TILE_SIZE, BASE_TILE_SIZE, { fit: "cover", position: "centre" });
  await image
    .flatten({ background: paletteBackground(manifest, job.slot.category) })
    .webp({ quality: 90, effort: 6 })
    .toFile(destination);
}

async function stripBoundaryLightBackground(input: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  if (channels !== 4) return input;
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;
  const isBackground = (pixel: number): boolean => {
    const offset = pixel * channels;
    const r = data[offset]!;
    const g = data[offset + 1]!;
    const b = data[offset + 2]!;
    const alpha = data[offset + 3]!;
    return alpha > 0 && Math.min(r, g, b) >= 210 && Math.max(r, g, b) - Math.min(r, g, b) <= 24;
  };
  const enqueue = (pixel: number): void => {
    if (visited[pixel] || !isBackground(pixel)) return;
    visited[pixel] = 1;
    queue[tail++] = pixel;
  };
  for (let x = 0; x < width; x++) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y++) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }
  while (head < tail) {
    const pixel = queue[head++]!;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    if (x > 0) enqueue(pixel - 1);
    if (x + 1 < width) enqueue(pixel + 1);
    if (y > 0) enqueue(pixel - width);
    if (y + 1 < height) enqueue(pixel + width);
  }
  for (let pixel = 0; pixel < visited.length; pixel++) {
    if (visited[pixel]) data[pixel * channels + 3] = 0;
  }
  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

async function normalizeTransparent(source: string, destination: string, job: GenerationJob): Promise<void> {
  const metadata = await sharp(source).metadata();
  const horizontal = job.mechanics.footprint === "centered-horizontal-edge";
  const vertical = job.mechanics.footprint === "centered-vertical-edge";
  const roundedJunction = job.mechanics.footprint === "rounded-junction";
  const band = Math.round(BASE_TILE_SIZE * 0.18);
  let artwork: Buffer;

  if (metadata.hasAlpha && (horizontal || vertical)) {
    const trimmed = sharp(source).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } });
    artwork = await trimmed
      .resize(horizontal ? BASE_TILE_SIZE : band, horizontal ? band : BASE_TILE_SIZE, { fit: "contain" })
      .png()
      .toBuffer();
  } else if (horizontal || vertical) {
    const square = await sharp(source).resize(BASE_TILE_SIZE, BASE_TILE_SIZE, { fit: "cover", position: "centre" }).png().toBuffer();
    artwork = await sharp(square)
      .extract(horizontal
        ? { left: 0, top: Math.floor((BASE_TILE_SIZE - band) / 2), width: BASE_TILE_SIZE, height: band }
        : { left: Math.floor((BASE_TILE_SIZE - band) / 2), top: 0, width: band, height: BASE_TILE_SIZE })
      .png()
      .toBuffer();
  } else if (roundedJunction) {
    artwork = await sharp(source)
      .resize(BASE_TILE_SIZE, BASE_TILE_SIZE, { fit: "cover", position: "centre" })
      .png()
      .toBuffer();
  } else {
    artwork = await sharp(source)
      .resize(Math.round(BASE_TILE_SIZE * 0.8), Math.round(BASE_TILE_SIZE * 0.8), { fit: "contain" })
      .png()
      .toBuffer();
  }
  artwork = await stripBoundaryLightBackground(artwork);

  const artMeta = await sharp(artwork).metadata();
  const left = Math.round((BASE_TILE_SIZE - (artMeta.width ?? BASE_TILE_SIZE)) / 2);
  const top = Math.round((BASE_TILE_SIZE - (artMeta.height ?? BASE_TILE_SIZE)) / 2);
  const composites: OverlayOptions[] = [{ input: artwork, left, top }];
  if (job.slot.category === "doorOpenH" || job.slot.category === "doorOpenV") {
    const gap = Math.round(BASE_TILE_SIZE * 0.28);
    const horizontalGap = job.slot.category === "doorOpenH";
    const clearingMask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${BASE_TILE_SIZE}" height="${BASE_TILE_SIZE}">
      <rect x="${horizontalGap ? Math.round((BASE_TILE_SIZE - gap) / 2) : 0}" y="${horizontalGap ? 0 : Math.round((BASE_TILE_SIZE - gap) / 2)}"
        width="${horizontalGap ? gap : BASE_TILE_SIZE}" height="${horizontalGap ? BASE_TILE_SIZE : gap}" fill="#fff"/>
    </svg>`);
    composites.push({ input: clearingMask, blend: "dest-out" });
  } else if (roundedJunction) {
    const corner = interiorCorner(job.slot.side, BASE_TILE_SIZE);
    const clearingMask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${BASE_TILE_SIZE}" height="${BASE_TILE_SIZE}">
      <circle cx="${corner.x}" cy="${corner.y}" r="${Math.round(BASE_TILE_SIZE * 0.65)}" fill="#fff"/>
    </svg>`);
    composites.push({ input: clearingMask, blend: "dest-out" });
  }
  await sharp({ create: { width: BASE_TILE_SIZE, height: BASE_TILE_SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(composites)
    .webp({ lossless: true, effort: 6 })
    .toFile(destination);
}

export async function importJob(input: {
  repoRoot: string;
  workspaceRoot: string;
  jobId: string;
  source: string;
  note?: string;
  execution?: GenerationAttempt["execution"];
  now?: string;
}): Promise<WorkspaceState> {
  const state = await loadWorkspace(input.workspaceRoot);
  const job = findJob(state.plan, input.jobId);
  const source = path.resolve(input.source);
  const metadata = await sharp(source).metadata();
  if (!metadata.width || !metadata.height || metadata.width < BASE_TILE_SIZE || metadata.height < BASE_TILE_SIZE) {
    throw new Error(`${input.jobId}: source must decode and be at least ${BASE_TILE_SIZE}×${BASE_TILE_SIZE}`);
  }
  if (Math.max(metadata.width / metadata.height, metadata.height / metadata.width) > 3) {
    throw new Error(`${input.jobId}: source aspect ratio exceeds the safe 3:1 normalization limit`);
  }

  const extension = path.extname(source).toLowerCase() || ".png";
  const acceptedRelative = `accepted/${job.id.replaceAll(":", "-")}${extension}`;
  const accepted = path.join(state.root, acceptedRelative);
  await copyFile(source, accepted);
  job.paths.raw = path.relative(state.root, source);
  job.paths.accepted = acceptedRelative;
  job.status = "accepted";
  job.attempts.push({
    at: input.now ?? new Date().toISOString(),
    action: "accepted",
    source_path: source,
    ...(input.note ? { note: input.note } : {}),
    ...(input.execution ? { execution: input.execution } : {}),
  });

  const normalized = path.join(input.repoRoot, job.paths.normalized);
  await mkdir(path.dirname(normalized), { recursive: true });
  if (job.mechanics.alpha === "opaque") await normalizeFullCell(accepted, normalized, job, state.manifest);
  else await normalizeTransparent(accepted, normalized, job);
  const normalizedStat = await stat(normalized);
  upsertManifestSlot(state.manifest, job.slot, normalizedStat.size);
  job.status = "normalized";
  job.attempts.push({ at: input.now ?? new Date().toISOString(), action: "normalized", source_path: acceptedRelative });
  await saveWorkspace(state);
  await writeRuntimeManifest(input.repoRoot, state.manifest);
  return state;
}

export async function rejectJob(root: string, id: string, reason: string, now?: string): Promise<WorkspaceState> {
  const state = await loadWorkspace(root);
  const job = findJob(state.plan, id);
  job.status = "rejected";
  job.attempts.push({ at: now ?? new Date().toISOString(), action: "rejected", note: reason });
  await saveWorkspace(state);
  return state;
}

export async function writeRuntimeManifest(repoRoot: string, manifest: TilePackManifest): Promise<string> {
  const destination = path.join(repoRoot, "public", "cartographer", manifest.pack_id, `v${manifest.pack_version}`, "manifest.json");
  await mkdir(path.dirname(destination), { recursive: true });
  await writeJson(destination, manifest);
  return destination;
}

export function defaultArtBible(input: {
  theme: string;
  medium?: string;
  styleNotes?: string[];
  materialNotes?: string[];
  paletteNotes?: string[];
  campaignContext?: string;
  consistency?: PackArtBible["campaign_consistency"];
}): PackArtBible {
  return {
    visual_medium: input.medium ?? "polished painterly fantasy game asset",
    rendering_conventions: [
      "exact orthographic top-down view",
      "clean readable shapes at 128×128",
      "even lighting without directional cast shadows",
      ...(input.styleNotes ?? []),
    ],
    world_motifs: input.materialNotes ?? [],
    tone_palette: input.paletteNotes ?? [],
    environment_defaults: [],
    hard_canon: [],
    exclusions: ["text", "characters", "watermarks", "isometric perspective"],
    pack_local_theme: input.theme,
    campaign_consistency: input.consistency ?? "adaptive",
    ...(input.campaignContext ? { source_campaign_context: input.campaignContext } : {}),
  };
}

export function workspacePath(repoRoot: string, packId: string, version: number): string {
  return path.join(repoRoot, "art-src", "cartographer", packId, `v${version}`);
}

export function schemaSummary(): string {
  return `schema v${TILE_PACK_SCHEMA.version}, ${BASE_TILE_SIZE}×${BASE_TILE_SIZE} WebP`;
}
