import { strFromU8, unzipSync } from "fflate";
import { slotRelativePath, type SlotIdentity } from "./authoringPlan";
import { BASE_TILE_SIZE, TILE_PACK_SCHEMA, type PackCategory, type TilePackManifest } from "./packSchema";
import { formatMissingForDisplay, validatePack } from "./validatePack";

export interface PreparedPackUpload {
  manifest: TilePackManifest;
  assets: Map<string, Blob>;
}

function safePath(value: string): string {
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").includes("..")) {
    throw new Error(`Unsafe pack path: ${value}`);
  }
  return normalized;
}

async function entriesFromFiles(files: File[]): Promise<Map<string, Blob>> {
  if (files.length === 1 && files[0]!.name.toLowerCase().endsWith(".zip")) {
    const unpacked = unzipSync(new Uint8Array(await files[0]!.arrayBuffer()));
    return new Map(Object.entries(unpacked)
      .filter(([name]) => !name.endsWith("/"))
      .map(([name, bytes]) => [safePath(name), new Blob([bytes])])) as Map<string, Blob>;
  }
  return new Map(files.map((file) => [safePath(file.webkitRelativePath || file.name), file]));
}

function resolveEntry(base: string, relative: string): string {
  const joined = safePath(`${base}${relative}`);
  const parts: string[] = [];
  for (const part of joined.split("/")) {
    if (part === ".") continue;
    if (part === "..") {
      if (!parts.length) throw new Error(`Asset path escapes pack root: ${relative}`);
      parts.pop();
    } else parts.push(part);
  }
  return parts.join("/");
}

async function assertWebp128(blob: Blob, label: string): Promise<void> {
  const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const signature = String.fromCharCode(...bytes);
  if (!signature.startsWith("RIFF") || signature.slice(8, 12) !== "WEBP") {
    throw new Error(`${label}: asset is not WebP`);
  }
  const bitmap = await createImageBitmap(blob);
  const dimensions = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  if (dimensions.width !== BASE_TILE_SIZE || dimensions.height !== BASE_TILE_SIZE) {
    throw new Error(`${label}: expected ${BASE_TILE_SIZE}×${BASE_TILE_SIZE}, got ${dimensions.width}×${dimensions.height}`);
  }
}

export async function preparePackUpload(files: File[]): Promise<PreparedPackUpload> {
  if (!files.length) throw new Error("Choose a pack folder or zip file");
  const entries = await entriesFromFiles(files);
  const manifests = [...entries.keys()].filter((name) => name.toLowerCase().endsWith("manifest.json"))
    .sort((a, b) => a.length - b.length);
  if (!manifests.length) throw new Error("Pack must contain manifest.json");
  const manifestPath = manifests[0]!;
  const manifestBlob = entries.get(manifestPath)!;
  let manifest: TilePackManifest;
  try {
    const bytes = new Uint8Array(await manifestBlob.arrayBuffer());
    manifest = JSON.parse(strFromU8(bytes)) as TilePackManifest;
  } catch {
    throw new Error("manifest.json is not valid JSON");
  }
  if (!manifest.pack_id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.pack_id)) {
    throw new Error("manifest pack_id must be a lowercase kebab-case identifier");
  }
  if (manifest.schema_version !== TILE_PACK_SCHEMA.version) {
    throw new Error(`Pack uses schema v${manifest.schema_version}; this app requires v${TILE_PACK_SCHEMA.version}`);
  }
  if (manifest.base_tile_size !== BASE_TILE_SIZE) throw new Error(`Pack base_tile_size must be ${BASE_TILE_SIZE}`);
  const validation = validatePack(manifest);
  if (!validation.valid) {
    throw new Error(`${manifest.name || manifest.pack_id}: missing ${validation.missing.length} required tiles\n${formatMissingForDisplay(validation.missing)}`);
  }
  if (validation.warnings.some((warning) => warning.includes("non-WebP"))) {
    throw new Error("Pack assets must all use .webp URLs");
  }

  const base = manifestPath.slice(0, manifestPath.lastIndexOf("/") + 1);
  const canonicalAssets = new Map<string, Blob>();
  const normalizedManifest = structuredClone(manifest);
  for (const [category, slots] of Object.entries(manifest.assets)) {
    for (const slot of slots ?? []) {
      const sourcePath = resolveEntry(base, slot.url);
      const blob = entries.get(sourcePath);
      if (!blob) throw new Error(`${category}/${slot.variant}: file not found at ${slot.url}`);
      const identity: SlotIdentity = {
        category: category as PackCategory,
        ...(slot.side ? { side: slot.side } : {}),
        variant: slot.variant,
      };
      const canonical = slotRelativePath(identity);
      await assertWebp128(blob, canonical);
      canonicalAssets.set(canonical, blob);
      const normalizedSlot = normalizedManifest.assets[category as PackCategory]?.find((candidate) =>
        candidate.variant === slot.variant && candidate.side === slot.side
      );
      if (normalizedSlot) {
        normalizedSlot.url = canonical;
        normalizedSlot.byteSize = blob.size;
      }
    }
  }
  return { manifest: normalizedManifest, assets: canonicalAssets };
}
