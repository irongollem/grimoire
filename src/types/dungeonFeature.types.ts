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

export const DUNGEON_FEATURE_TYPE_BG: Record<DungeonFeatureType, string> = {
  "Secret Door":       "bg-feature-secret-door",
  "Hidden Passage":    "bg-feature-hidden-passage",
  "Treasure Chest":    "bg-feature-treasure-chest",
  "Hidden Cache":      "bg-feature-hidden-cache",
  "Concealed Alcove":  "bg-feature-concealed-alcove",
  "Moving Wall":       "bg-feature-moving-wall",
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
