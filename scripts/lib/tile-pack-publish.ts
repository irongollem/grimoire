/**
 * The pure half of `scripts/publish-tile-pack.ts` (#891): a folder of runtime tiles becomes the slots of a library pack's
 * manifest. Kept apart so the mapping from file path to slot is tested without a network.
 */
import { BASE_TILE_SIZE, TILE_PACK_SCHEMA, categoryDef, type AssetSlot, type PackCategory, type TilePackManifest } from "../../src/cartographer/packSchema.ts";

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
 * DM who already loaded the pack is not served the old tile from the CDN's month-long cache.
 */
export function buildManifest(
  base: Pick<TilePackManifest, "pack_id" | "name" | "description" | "pack_version" | "palette">,
  files: readonly TileFile[],
  rev: number,
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
  };
  return { manifest, errors };
}
