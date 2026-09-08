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
