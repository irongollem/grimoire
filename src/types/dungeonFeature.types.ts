export const DUNGEON_FEATURE_TYPES = [
  "Secret Door",
  "Hidden Passage",
  "Treasure Chest",
  "Hidden Cache",
  "Concealed Alcove",
  "Moving Wall",
  "Other",
] as const;
export type DungeonFeatureType = (typeof DUNGEON_FEATURE_TYPES)[number];

export const DUNGEON_FEATURE_TYPE_COLORS: Record<DungeonFeatureType, string> = {
  "Secret Door":     "#7c3aed",
  "Hidden Passage":  "#0284c7",
  "Treasure Chest":  "#b45309",
  "Hidden Cache":    "#16a34a",
  "Concealed Alcove":"#0891b2",
  "Moving Wall":     "#6b7280",
  "Other":           "#9ca3af",
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

export interface DungeonFeature {
  id: string;
  user_id: string;
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
  /** What's inside / what happens when opened */
  contents_description: string | null;
  image_url: string | null;
  image_focal_point: { x: number; y: number } | null;
  tags: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type DungeonFeatureInsert = Omit<DungeonFeature, "id" | "user_id" | "created_at" | "updated_at">;
export type DungeonFeatureUpdate = Partial<DungeonFeatureInsert>;
