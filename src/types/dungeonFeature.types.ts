import type { AiProvenance } from "@/ai/provenance";
import type { ObjectMaterial, ObjectSize } from "@/rules/objects";

export const DUNGEON_FEATURE_TYPES = [
  "Secret Door",
  "Hidden Passage",
  "Treasure Chest",
  "Hidden Cache",
  "Concealed Alcove",
  "Moving Wall",
  "Door",
  "Lock",
  "Object",
  "Other",
] as const;
export type DungeonFeatureType = (typeof DUNGEON_FEATURE_TYPES)[number];

export const DUNGEON_FEATURE_TYPE_BG: Record<DungeonFeatureType, string> = {
  "Secret Door":       "bg-feature-secret-door",
  "Hidden Passage":    "bg-feature-hidden-passage",
  "Treasure Chest":    "bg-feature-treasure-chest",
  "Hidden Cache":      "bg-feature-hidden-cache",
  "Concealed Alcove":  "bg-feature-concealed-alcove",
  "Moving Wall":       "bg-feature-moving-wall",
  Door:                "bg-feature-door",
  Lock:                "bg-feature-lock",
  Object:              "bg-feature-object",
  Other:               "bg-feature-other",
};

export const DUNGEON_FEATURE_TRIGGERS = [
  "Lever",
  "Pressure Plate",
  "Bookshelf",
  "Candlestick",
  "Keyword",
  "Puzzle",
  "Key",
  "Button / Knob",
  "Magic Sensor",
  "Combination",
  "None",
  "Other",
] as const;
export type DungeonFeatureTrigger = (typeof DUNGEON_FEATURE_TRIGGERS)[number];

/** How this feature draws on a site map (#804). Same contract as
 *  `traps.hazard_glyph` — matches the CHECK constraint on
 *  `dungeon_features.feature_glyph` (migration 20260906200347): an app-level
 *  visual kind, never a pack asset id. */
export const FEATURE_GLYPHS = [
  "secret_door",
  "hidden_passage",
  "cache",
  "moving_wall",
  "lever",
  "altar",
  "fountain",
  "statue",
  "rubble",
  "inscription",
] as const;
export type FeatureGlyph = (typeof FEATURE_GLYPHS)[number];

export const FEATURE_GLYPH_LABELS: Record<FeatureGlyph, string> = {
  secret_door:    "Secret Door",
  hidden_passage: "Hidden Passage",
  cache:          "Cache",
  moving_wall:    "Moving Wall",
  lever:          "Lever",
  altar:          "Altar",
  fountain:       "Fountain",
  statue:         "Statue",
  rubble:         "Rubble",
  inscription:    "Inscription",
};

export interface DungeonFeature {
  id: string;
  user_id: string;
  /** NULL = available in every campaign; set = only visible when that campaign
   *  is active. The DM picks, per feature (#800) — existing rows stay null. */
  campaign_id: string | null;
  name: string;
  feature_type: DungeonFeatureType;
  description: string | null;
  /** Passive Perception / active Perception DC to notice the feature */
  perception_dc: number | null;
  /** Investigation DC to understand the mechanism or find hidden compartments */
  investigation_dc: number | null;
  /** Arcana DC — for magically concealed features */
  arcana_dc: number | null;
  trigger_type: DungeonFeatureTrigger | null;
  trigger_description: string | null;
  /** How this feature draws on a site map (#804). Null = renderer falls back
   *  to a generic feature marker — never an empty cell. */
  feature_glyph: FeatureGlyph | null;
  /** The DMG object block (migration 20261030214202): set when the feature is
   *  a physical thing the party can attack, force or pick (a door, a lock, a
   *  cart). All null for a feature that is not a breakable object. Material
   *  and size are what the book's AC and hit points follow (`src/rules/objects.ts`);
   *  AC and HP are stored so a DM can set a sturdier door's numbers by hand. */
  object_material: ObjectMaterial | null;
  object_size: ObjectSize | null;
  object_ac: number | null;
  object_hp: number | null;
  damage_threshold: number | null;
  /** Strength check DC to force it open or break it. */
  break_dc: number | null;
  /** DC to pick its lock with thieves' tools. */
  lock_dc: number | null;
  /** What's inside / what happens when opened */
  contents_description: string | null;
  image_url: string | null;
  image_focal_point: { x: number; y: number } | null;
  tags: string[];
  notes: string | null;
  /** AI provenance (#910); flipped to edited by the editor on a content change. */
  ai_provenance?: AiProvenance | null;
  created_at: string;
  updated_at: string;
}

export type DungeonFeatureInsert = Omit<DungeonFeature, "id" | "user_id" | "created_at" | "updated_at">;
export type DungeonFeatureUpdate = Partial<DungeonFeatureInsert>;

/** A Grimoire-authored dungeon feature (#1060): the content columns of
 *  `DungeonFeature`, none of the ownership. Text ids, never a uuid. */
export type LibraryDungeonFeature = Omit<DungeonFeature, "id" | "user_id" | "campaign_id" | "ai_provenance"> & {
  id: string;
  source: string;
};

/** Anything a feature picker or list can hold: the DM's own or the library's. */
export type DungeonFeatureEntry = DungeonFeature | LibraryDungeonFeature;
