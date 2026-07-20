import type { VersionedContentMetadata } from "@/types/content.types";

export const FEATURE_TYPES = [
  "passive",
  "active",
  "reaction",
  "bonus_action",
  "legendary",
] as const;

export type FeatureType = (typeof FEATURE_TYPES)[number];

export const FEATURE_TYPE_LABELS: Record<FeatureType, string> = {
  passive:      "Passive",
  active:       "Active",
  reaction:     "Reaction",
  bonus_action: "Bonus Action",
  legendary:    "Legendary",
};

export interface ClassFeature extends VersionedContentMetadata {
  id: string;
  user_id: string;
  campaign_id: string | null;
  name: string;
  description: string | null; // Tiptap JSON string
  feature_type: FeatureType;
  source: string | null;
  prerequisite: string | null;
  tags: string[];
  open5e_import: boolean;
  created_at: string;
  updated_at: string;
}

export type ClassFeatureInsert = Omit<ClassFeature, "id" | "user_id" | "created_at" | "updated_at">;
export type ClassFeatureUpdate = Partial<ClassFeatureInsert>;
