/**
 * The pure half of `scripts/publish-tile-pack.ts` (#891): a folder of runtime tiles becomes the slots of a library pack's
 * manifest. Kept apart so the mapping from file path to slot is tested without a network.
 */
import { BASE_TILE_SIZE, MAX_LIGHT_FEET, TILE_PACK_SCHEMA, categoryDef, type AssetSlot, type PackCategory, type TileLight, type TilePackManifest } from "../../src/cartographer/packSchema.ts";

/**
 * The optional `pack.json` beside a pack's tiles: the manifest fields no tile can carry (schema 4). It is the ONLY source of
 * them, on purpose: a repaint replaces the pack, so nothing is inherited from an older published version.
 */
export type PackSidecar = Pick<TilePackManifest, "continuous" | "labels" | "doorLeaf" | "lights" | "flush">;

export const SIDECAR_FILE = "pack.json";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isCategory = (key: string): key is PackCategory => Object.hasOwn(TILE_PACK_SCHEMA.categories, key);

/** One `lights` entry: null (no light) or a light that satisfies the same rule as the database column. */
function parseLight(entry: unknown): TileLight | null | "invalid" {
  if (entry === null) return null;
  if (!isRecord(entry)) return "invalid";
  const { color, bright, dim, intensity } = entry;
  if (Object.keys(entry).some((key) => key !== "color" && key !== "bright" && key !== "dim" && key !== "intensity")) return "invalid";
  if (typeof color !== "string" || !/^#[0-9a-f]{6}$/.test(color)) return "invalid";
  const feet = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= MAX_LIGHT_FEET;
  if (!feet(bright) || !feet(dim) || bright + dim === 0) return "invalid";
  if (intensity === undefined) return { color, bright, dim };
  if (typeof intensity !== "number" || !Number.isFinite(intensity) || intensity <= 0 || intensity > 1) return "invalid";
  return { color, bright, dim, intensity };
}

/** Validates a parsed `pack.json`. Every problem is reported (not just the first), and nothing invalid is returned. */
export function parsePackSidecar(raw: unknown): { sidecar: PackSidecar; errors: string[] } {
  const errors: string[] = [];
  const sidecar: PackSidecar = {};
  if (!isRecord(raw)) return { sidecar, errors: [`${SIDECAR_FILE}: must be a JSON object`] };
  for (const key of Object.keys(raw)) {
    if (key !== "continuous" && key !== "labels" && key !== "doorLeaf" && key !== "lights" && key !== "flush") errors.push(`${SIDECAR_FILE}: unknown key "${key}" (expected continuous, labels, doorLeaf, lights, flush)`);
  }

  if (raw.continuous !== undefined) {
    if (!isRecord(raw.continuous)) errors.push(`${SIDECAR_FILE}: continuous must be an object of category to period`);
    else {
      const continuous: Partial<Record<PackCategory, number>> = {};
      for (const [category, period] of Object.entries(raw.continuous)) {
        if (!isCategory(category)) errors.push(`${SIDECAR_FILE}: continuous.${category} is not a schema category`);
        else if (typeof period !== "number" || !Number.isInteger(period) || period < 1) errors.push(`${SIDECAR_FILE}: continuous.${category} must be a positive integer period`);
        else continuous[category] = period;
      }
      sidecar.continuous = continuous;
    }
  }

  if (raw.labels !== undefined) {
    if (!isRecord(raw.labels)) errors.push(`${SIDECAR_FILE}: labels must be an object of category to names`);
    else {
      const labels: Partial<Record<PackCategory, string[]>> = {};
      for (const [category, names] of Object.entries(raw.labels)) {
        if (!isCategory(category)) errors.push(`${SIDECAR_FILE}: labels.${category} is not a schema category`);
        else if (!Array.isArray(names) || names.some((name) => typeof name !== "string" || name.trim() === "")) errors.push(`${SIDECAR_FILE}: labels.${category} must be an array of non-empty strings`);
        else labels[category] = names as string[];
      }
      sidecar.labels = labels;
    }
  }

  if (raw.doorLeaf !== undefined) {
    const leaf = raw.doorLeaf;
    if (!isRecord(leaf)) errors.push(`${SIDECAR_FILE}: doorLeaf must be an object`);
    else {
      const { hingeX, hingeY, openDegrees } = leaf;
      const fraction = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
      if (!fraction(hingeX)) errors.push(`${SIDECAR_FILE}: doorLeaf.hingeX must be a number from 0 to 1`);
      if (!fraction(hingeY)) errors.push(`${SIDECAR_FILE}: doorLeaf.hingeY must be a number from 0 to 1`);
      if (typeof openDegrees !== "number" || !Number.isFinite(openDegrees) || openDegrees < 1 || openDegrees > 180) errors.push(`${SIDECAR_FILE}: doorLeaf.openDegrees must be a number from 1 to 180`);
      if (fraction(hingeX) && fraction(hingeY) && typeof openDegrees === "number" && openDegrees >= 1 && openDegrees <= 180) {
        sidecar.doorLeaf = { hingeX, hingeY, openDegrees };
      }
    }
  }
  if (raw.lights !== undefined) {
    if (!isRecord(raw.lights)) errors.push(`${SIDECAR_FILE}: lights must be an object of category to lights`);
    else {
      const lights: Partial<Record<PackCategory, (TileLight | null)[]>> = {};
      for (const [category, entries] of Object.entries(raw.lights)) {
        if (!isCategory(category)) errors.push(`${SIDECAR_FILE}: lights.${category} is not a schema category`);
        else if (!Array.isArray(entries)) errors.push(`${SIDECAR_FILE}: lights.${category} must be an array of lights or null`);
        else {
          const parsed: (TileLight | null)[] = [];
          entries.forEach((entry, variant) => {
            const light = parseLight(entry);
            if (light === "invalid") errors.push(`${SIDECAR_FILE}: lights.${category}[${variant}] must be null or { color: "#rrggbb", bright: 0 to ${MAX_LIGHT_FEET} feet, dim: 0 to ${MAX_LIGHT_FEET} feet, not both 0, intensity?: above 0 up to 1 }`);
            else parsed.push(light);
          });
          lights[category] = parsed;
        }
      }
      sidecar.lights = lights;
    }
  }
  if (raw.flush !== undefined) {
    if (!Array.isArray(raw.flush) || raw.flush.some((category) => typeof category !== "string" || !isCategory(category))) errors.push(`${SIDECAR_FILE}: flush must be an array of schema categories`);
    else sidecar.flush = raw.flush as PackCategory[];
  }
  return { sidecar: errors.length ? {} : sidecar, errors };
}

export interface TileFile {
  /** Path relative to the pack folder, exactly as the manifest's `url` names it: `floor/0.webp`, `stairsUp/N/0.webp`. */
  relative: string;
  byteSize: number;
}

export interface TileSlot {
  category: PackCategory;
  side?: string;
  variant: number;
  relative: string;
}

/**
 * The slot a file stands for, or an error naming what is wrong with it. A path must be `<category>/<variant>.webp` for a
 * category without sides and `<category>/<side>/<variant>.webp` for a directional one, with the side and variant inside
 * what the schema allows: anything else is a file the manifest could not name, so it is refused rather than skipped.
 */
export function slotForPath(relative: string): TileSlot | { error: string } {
  const parts = relative.split("/");
  const match = /(?:^|\/)(\d+)\.webp$/.exec(relative);
  if (!match) return { error: `${relative}: not <variant>.webp` };
  const variant = Number(match[1]);
  if (!Object.hasOwn(TILE_PACK_SCHEMA.categories, parts[0])) return { error: `${relative}: ${parts[0]} is not a schema category` };
  const category = parts[0] as PackCategory;
  const def = categoryDef(category);
  if (def.kind === "directional") {
    if (parts.length !== 3) return { error: `${relative}: ${category} needs a side folder` };
    const side = parts[1];
    if (!(def.sides as readonly string[]).includes(side)) return { error: `${relative}: ${side} is not a side of ${category}` };
    if (variant >= (def.variantsPerSide ?? 1)) return { error: `${relative}: ${category} allows ${def.variantsPerSide ?? 1} variant(s) per side` };
    return { category, side, variant, relative };
  }
  if (parts.length !== 2) return { error: `${relative}: ${category} takes no side folder` };
  if (variant >= def.max) return { error: `${relative}: ${category} allows at most ${def.max} variants` };
  return { category, variant, relative };
}

/**
 * A whole new manifest for the pack, built from the tiles alone: a repaint replaces every slot, so no slot of the old art
 * survives beside the new (a pack that mixed two lanes' walls would not read as one set). The palette is kept, because the
 * loader still draws placeholders from it for any optional slot the pack leaves empty. `rev` is stamped on every slot so a
 * DM who already loaded the pack is not served the old tile from the CDN's month-long cache. `continuous`, `labels` and
 * `doorLeaf` come from the sidecar alone (already validated by `parsePackSidecar`) and are never inherited from `base`.
 */
export function buildManifest(
  base: Pick<TilePackManifest, "pack_id" | "name" | "description" | "pack_version" | "palette">,
  files: readonly TileFile[],
  rev: number,
  sidecar: PackSidecar = {},
): { manifest: TilePackManifest; errors: string[] } {
  const errors: string[] = [];
  const assets: Partial<Record<PackCategory, AssetSlot[]>> = {};
  for (const file of [...files].sort((a, b) => a.relative.localeCompare(b.relative, "en", { numeric: true }))) {
    const slot = slotForPath(file.relative);
    if ("error" in slot) { errors.push(slot.error); continue; }
    (assets[slot.category] ??= []).push({ ...(slot.side ? { side: slot.side } : {}), variant: slot.variant, url: slot.relative, byteSize: file.byteSize, rev });
  }
  const manifest: TilePackManifest = {
    pack_id: base.pack_id,
    name: base.name,
    description: base.description,
    pack_version: base.pack_version,
    schema_version: TILE_PACK_SCHEMA.version,
    base_tile_size: BASE_TILE_SIZE,
    assets,
    ...(base.palette ? { palette: base.palette } : {}),
    ...(sidecar.continuous ? { continuous: sidecar.continuous } : {}),
    ...(sidecar.labels ? { labels: sidecar.labels } : {}),
    ...(sidecar.doorLeaf ? { doorLeaf: sidecar.doorLeaf } : {}),
    ...(sidecar.lights ? { lights: sidecar.lights } : {}),
    ...(sidecar.flush ? { flush: sidecar.flush } : {}),
  };
  return { manifest, errors };
}
