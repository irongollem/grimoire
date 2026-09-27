// Pack loader — fetches a TilePackManifest, validates it, and exposes per-slot
// HTMLImageElement | HTMLCanvasElement for the renderer. Missing or failed-to-load
// assets fall back to procedural placeholder tiles so the editor stays usable
// while the AI generation pipeline is producing real WebP art.

import { validatePack, formatMissingForDisplay, type ValidationResult } from "./validatePack";
import { getPlaceholderTile, getStalePackTile } from "./placeholderTile";
import type { AssetSlot, PackCategory, TilePackManifest } from "./packSchema";

export interface LoadedTileSource {
  source: CanvasImageSource;
  isPlaceholder: boolean;
}

export interface TilePackRuntime {
  manifest: TilePackManifest;
  validation: ValidationResult;
  getTile(category: PackCategory, variant: number, side?: string): LoadedTileSource;
  variantCount(category: PackCategory, side?: string): number;
}

const runtimeCache = new Map<string, TilePackRuntime>();

function runtimeKey(packId: string, packVersion: number): string {
  return `${packId}@${packVersion}`;
}

function slotKey(category: PackCategory, variant: number, side?: string): string {
  return `${category}|${side ?? ""}|${variant}`;
}

function groupKey(category: PackCategory, side?: string): string {
  return `${category}|${side ?? ""}`;
}

/**
 * The drawn variant that stands in for one with no art, or null when the
 * group has none drawn at all.
 *
 * A manifest declares every slot a pack may fill, and publishing requires
 * only the required ones, so a published pack can list floor variants 8 and
 * 9 with no bytes behind them (Stone Dungeon and Forest both did, 27 Sep
 * 2026). The editor picks among every declared variant, so about one floor
 * cell in five rendered as a placeholder square in the middle of real art.
 * Borrowing a drawn sibling of the same category and side fixes maps already
 * painted as well as new ones, and the slot shows its own art the moment a
 * gap-fill run draws it. Deterministic, so a cell never flickers between
 * renders or between the editor and the baked image.
 */
export function standInVariant(drawn: readonly number[], variant: number): number | null {
  if (drawn.length === 0) return null;
  const sorted = [...drawn].sort((a, b) => a - b);
  return sorted[Math.abs(variant) % sorted.length]!;
}

async function fetchManifest(url: string): Promise<TilePackManifest> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch pack manifest at ${url}: ${res.status}`);
  return (await res.json()) as TilePackManifest;
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.crossOrigin = "anonymous";
    img.src = url;
  });
}

export async function loadPack(manifestUrl: string): Promise<TilePackRuntime> {
  const manifest = await fetchManifest(manifestUrl);
  return buildRuntime(manifest, manifestUrl);
}

async function buildRuntime(manifest: TilePackManifest, manifestUrl: string): Promise<TilePackRuntime> {
  const cacheKey = runtimeKey(manifest.pack_id, manifest.pack_version);
  const cached = runtimeCache.get(cacheKey);
  if (cached) return cached;

  const validation = validatePack(manifest);

  // Resolve all asset URLs relative to the manifest URL.
  const base = new URL(manifestUrl, window.location.href);
  const slotImages = new Map<string, CanvasImageSource>();

  const loadTasks: Promise<void>[] = [];
  for (const [cat, slots] of Object.entries(manifest.assets)) {
    const list = (slots ?? []) as AssetSlot[];
    for (const slot of list) {
      const absoluteUrl = new URL(slot.url, base).toString();
      loadTasks.push(
        loadImage(absoluteUrl).then((img) => {
          if (img) slotImages.set(slotKey(cat as PackCategory, slot.variant, slot.side), img);
        }),
      );
    }
  }
  await Promise.all(loadTasks);

  const drawnVariants = new Map<string, number[]>();
  for (const [cat, slots] of Object.entries(manifest.assets)) {
    for (const slot of (slots ?? []) as AssetSlot[]) {
      if (!slotImages.has(slotKey(cat as PackCategory, slot.variant, slot.side))) continue;
      const key = groupKey(cat as PackCategory, slot.side);
      drawnVariants.set(key, [...(drawnVariants.get(key) ?? []), slot.variant]);
    }
  }

  const runtime: TilePackRuntime = {
    manifest,
    validation,
    getTile(category, variant, side) {
      const real = slotImages.get(slotKey(category, variant, side));
      if (real) return { source: real, isPlaceholder: false };
      const standIn = standInVariant(drawnVariants.get(groupKey(category, side)) ?? [], variant);
      const borrowed = standIn === null ? undefined : slotImages.get(slotKey(category, standIn, side));
      if (borrowed) return { source: borrowed, isPlaceholder: false };
      return {
        source: getPlaceholderTile({ pack_id: manifest.pack_id, category, side, variant }, manifest.palette),
        isPlaceholder: true,
      };
    },
    variantCount(category, side) {
      const slots = (manifest.assets[category] ?? []) as AssetSlot[];
      if (side) return slots.filter((s) => s.side === side).length;
      return slots.length;
    },
  };

  runtimeCache.set(cacheKey, runtime);
  return runtime;
}

export function getStalePackPlaceholder(): CanvasImageSource {
  return getStalePackTile();
}

export function isPackLoaded(packId: string, packVersion: number): boolean {
  return runtimeCache.has(runtimeKey(packId, packVersion));
}

export function getLoadedPack(packId: string, packVersion: number): TilePackRuntime | undefined {
  return runtimeCache.get(runtimeKey(packId, packVersion));
}

export function describeValidation(v: ValidationResult): string {
  const lines: string[] = [];
  if (!v.valid) lines.push(`Pack invalid — ${v.missing.length} required slot(s) missing:`);
  if (v.missing.length) lines.push(formatMissingForDisplay(v.missing));
  if (v.warnings.length) lines.push("Warnings:\n" + v.warnings.map((w) => `  • ${w}`).join("\n"));
  if (v.extras.length) lines.push("Unknown categories in manifest: " + v.extras.join(", "));
  return lines.join("\n");
}
