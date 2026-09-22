// Tile pack schema — source of truth for what every pack must contain.
// See context/features/cartographer.md "Tile Pack System".

export type CategoryKind = "random" | "directional" | "optional";

export interface RandomCategoryDef {
  kind: "random";
  min: number;
  max: number;
}

export interface DirectionalCategoryDef {
  kind: "directional";
  sides: readonly string[];
  variantsPerSide?: number;
  optional?: boolean;
}

export interface OptionalCategoryDef {
  kind: "optional";
  min: 0;
  max: number;
}

export type CategoryDef = RandomCategoryDef | DirectionalCategoryDef | OptionalCategoryDef;

export const TILE_PACK_SCHEMA = {
  version: 3,
  categories: {
    floor:          { kind: "random",      min: 8,  max: 16 },
    wallSegmentH:   { kind: "random",      min: 2,  max: 6  },
    wallSegmentV:   { kind: "random",      min: 2,  max: 6  },
    wallJoint:      { kind: "directional", sides: ["L_NE","L_SE","L_SW","L_NW","T_N","T_E","T_S","T_W","CROSS"], optional: true },
    // Schema v2: rounded corner art for L-corners. When a pack ships these,
    // the renderer uses them at right-angle corners instead of wallJoint.
    wallRoundJoint: { kind: "directional", sides: ["L_NE","L_SE","L_SW","L_NW"], optional: true },
    doorClosedH:    { kind: "random",      min: 1,  max: 3  },
    doorClosedV:    { kind: "random",      min: 1,  max: 3  },
    doorOpenH:      { kind: "random",      min: 1,  max: 3  },
    doorOpenV:      { kind: "random",      min: 1,  max: 3  },
    solidBlock:     { kind: "random",      min: 4,  max: 12 },
    stairsUp:       { kind: "directional", sides: ["N","E","S","W"], optional: true },
    stairsDown:     { kind: "directional", sides: ["N","E","S","W"], optional: true },
    rubble:         { kind: "optional",    min: 0,  max: 4  },
    debris:         { kind: "optional",    min: 0,  max: 4  },
    objectChest:    { kind: "optional",    min: 0,  max: 4  },
    objectBarrel:   { kind: "optional",    min: 0,  max: 4  },
    objectTable:    { kind: "optional",    min: 0,  max: 4  },
    objectStatue:   { kind: "optional",    min: 0,  max: 4  },
    objectPillar:   { kind: "optional",    min: 0,  max: 4  },
    objectBrazier:  { kind: "optional",    min: 0,  max: 4  },
    // Schema v3 (#804): trap hazard glyphs — drawing hints for
    // `traps.hazard_glyph`. All optional, so a v2 pack stays valid; most
    // packs will render these via the procedural placeholder (see
    // hazardPlaceholders.ts) for a long time before real art exists.
    hazardPit:             { kind: "optional", min: 0, max: 4 },
    hazardPressurePlate:   { kind: "optional", min: 0, max: 4 },
    hazardTripwire:        { kind: "optional", min: 0, max: 4 },
    hazardFallingBlock:    { kind: "optional", min: 0, max: 4 },
    hazardDartWall:        { kind: "optional", min: 0, max: 4 },
    hazardBlade:           { kind: "optional", min: 0, max: 4 },
    hazardFlameJet:        { kind: "optional", min: 0, max: 4 },
    hazardGlyph:           { kind: "optional", min: 0, max: 4 },
    hazardNet:             { kind: "optional", min: 0, max: 4 },
    hazardAlarm:           { kind: "optional", min: 0, max: 4 },
    hazardCollapsingFloor: { kind: "optional", min: 0, max: 4 },
    // Drawn for a placed trap whose hazard_glyph is null — still a marker,
    // never an empty cell (see cartographer/glyphs.ts).
    hazardGeneric:         { kind: "optional", min: 0, max: 4 },
    // Schema v3 (#804): dungeon feature glyphs — drawing hints for
    // `dungeon_features.feature_glyph`. Same contract as the hazard set above.
    featureSecretDoor:     { kind: "optional", min: 0, max: 4 },
    featureHiddenPassage:  { kind: "optional", min: 0, max: 4 },
    featureCache:          { kind: "optional", min: 0, max: 4 },
    featureMovingWall:     { kind: "optional", min: 0, max: 4 },
    featureLever:          { kind: "optional", min: 0, max: 4 },
    featureAltar:          { kind: "optional", min: 0, max: 4 },
    featureFountain:       { kind: "optional", min: 0, max: 4 },
    featureStatue:         { kind: "optional", min: 0, max: 4 },
    featureRubble:         { kind: "optional", min: 0, max: 4 },
    featureInscription:    { kind: "optional", min: 0, max: 4 },
    // Drawn for a placed feature whose feature_glyph is null — same rule as
    // hazardGeneric above.
    featureGeneric:        { kind: "optional", min: 0, max: 4 },
  },
} as const satisfies { version: number; categories: Record<string, CategoryDef> };

export const OBJECT_CATEGORIES = [
  "objectChest",
  "objectBarrel",
  "objectTable",
  "objectStatue",
  "objectPillar",
  "objectBrazier",
] as const satisfies readonly PackCategory[];

export type ObjectCategory = (typeof OBJECT_CATEGORIES)[number];

export type PackCategory = keyof typeof TILE_PACK_SCHEMA.categories;

const REQUIRED_CATEGORIES_INTERNAL = (Object.entries(TILE_PACK_SCHEMA.categories) as [PackCategory, CategoryDef][])
  .filter(([, def]) => {
    if (def.kind === "optional") return false;
    if (def.kind === "directional" && def.optional) return false;
    return true;
  })
  .map(([k]) => k);

export const REQUIRED_CATEGORIES: readonly PackCategory[] = REQUIRED_CATEGORIES_INTERNAL;

export const BASE_TILE_SIZE = 128;

export interface AssetSlot {
  side?: string;
  variant: number;
  url: string;
  byteSize?: number;
  /**
   * When these bytes were last written, as a millisecond epoch.
   *
   * A replaced tile lands at the *same* path as the one it replaces — the path
   * is derived from the slot's identity, not its contents — and the CDN Worker
   * hands every object back as `public, max-age=2592000, immutable`. So a tile
   * regenerated or re-uploaded on a pack a DM has already loaded would keep
   * rendering as the old art for a month, in their browser and at the edge.
   * Readers append this as a query parameter, which changes the cache key
   * without moving the object. `byteSize` cannot stand in for it: two
   * different 128x128 WebPs can encode to the same length.
   *
   * Optional because every tile written before 22 Sep 2026 predates it — an
   * absent `rev` simply falls back to the pack version, which is what those
   * URLs already carried.
   */
  rev?: number;
}

export interface TilePackManifest {
  pack_id: string;
  name: string;
  description: string;
  pack_version: number;
  schema_version: number;
  base_tile_size: typeof BASE_TILE_SIZE;
  assets: Partial<Record<PackCategory, AssetSlot[]>>;
  /** Per-category RGB base colour for procedural placeholder tiles. When absent,
   *  placeholderTile falls back to the built-in stone-dungeon defaults. Image
   *  generators may also read this palette for colour-aware prompt construction. */
  palette?: Partial<Record<PackCategory, [number, number, number]>>;
}

export function categoryDef(cat: PackCategory): CategoryDef {
  return TILE_PACK_SCHEMA.categories[cat] as CategoryDef;
}

/**
 * `wallSegmentH` → `wall segment H`, `hazardPressurePlate` → `hazard pressure plate`.
 *
 * The schema's category keys are camelCase identifiers, and two callers were
 * each putting one in front of a human — or a model — verbatim:
 *
 *  - the admin slot grid rendered `WALLSEGMENTH` and `HAZARDCOLLAPSINGFLOOR`
 *    as group headings (`text-eyebrow` uppercases whatever it is handed), in
 *    a list whose entire purpose is scanning for the right slot;
 *  - `categoryRequest`'s fallback branch — which serves every one of the ~30
 *    optional categories — interpolated the key straight into the prompt, so
 *    gpt-image-2 was being asked for "a top-down hazardPressurePlate overlay".
 *
 * Single-character words are left capitalised, because the trailing `H`/`V`
 * on the directional categories is an axis, not the start of a word.
 */
export function categoryLabel(category: PackCategory | string): string {
  return category
    .replace(/([A-Z])/g, " $1")
    .trim()
    .split(/\s+/)
    .map((word) => (word.length === 1 ? word : word.toLowerCase()))
    .join(" ");
}

/**
 * How thick a wall band is, as a fraction of the tile — the width of the strip
 * a `wallSegment`, `door*` or joint paints across the gridline.
 *
 * **25%, which is exactly 32px at the 128px base tile.** The number is chosen
 * to stay an integer at every zoom the renderer uses (32 → 16 → 8); 20% would
 * be 25.6px and fractional at almost every tile size.
 *
 * It lives here because four places independently decided this and all four
 * disagreed, which is visible on a map as a wall that changes width where it
 * meets a corner. Measured 21 Sep 2026:
 *
 * | source | band |
 * |---|---|
 * | `normalizeGeneratedTile` (every generated tile) | 23px (0.18) |
 * | `placeholderTile` (every procedural fallback) | 23px (0.18) |
 * | `renderMap` / `bake` corner joints | 35px (35/128) |
 * | `wood-interior`'s extracted art | 37px |
 * | `celestial-observatory` horizontal walls | 22px |
 * | `celestial-observatory` **vertical** walls | **14px** |
 *
 * The last two are the same pack — hand-authored through the CLI, tile by
 * tile, with its vertical walls at half the thickness of its horizontal ones.
 * No amount of care catches this by eye; it needs one constant.
 */
export const WALL_BAND_RATIO = 0.25;

/** `WALL_BAND_RATIO` in pixels of a base tile — 32. */
export const WALL_BAND_PX = Math.round(BASE_TILE_SIZE * WALL_BAND_RATIO);
