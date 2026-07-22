/** The six ability scores, spelled out — matches how Open5e ships its `ability_score` benefit text. */
export const ABILITY_SCORE_KEYS = [
  "strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma",
] as const;
export type AbilityScoreKey = (typeof ABILITY_SCORE_KEYS)[number];

/**
 * 2024 PHB: a background's Origin feat grant, parsed from Open5e's `feat` benefit
 * (e.g. "Magic Initiate (Cleric)" → { name: "Magic Initiate", variant: "Cleric" }).
 * The variant is the specific choice baked into the background (a class for Magic
 * Initiate, etc.) — kept separate from `name` so `name` alone matches a feat's
 * `conceptual_key` for lookup against imported `class_features` rows.
 */
export interface BackgroundOriginFeat {
  name: string;
  variant: string | null;
}

/**
 * Player character backgrounds (Acolyte, Outlander, Urchin …). Modelled on
 * the Open5e `/v1/backgrounds/` schema plus Grimoire-specific fields
 * (tags, custom image, Tiptap JSON description).
 */
export interface Background extends VersionedContentMetadata {
  id: string;
  user_id: string;
  name: string;
  /** Tiptap JSON or plain prose — what the background is narratively. */
  description: string | null;
  skill_proficiencies: string[];
  tool_proficiencies: string[];
  languages: string[];
  /** Free-text starting-equipment list — Open5e ships this as prose. */
  equipment: string | null;
  feature_name: string | null;
  feature_description: string | null;
  /**
   * 2024 PHB: every background grants a feat at 1st level.
   * Stored as a free-text name so any ruleset / homebrew feat can be referenced.
   */
  feat_grant_name: string | null;
  /** Optional description / summary of what the feat does, for in-app display. */
  feat_grant_description: string | null;
  /**
   * 2024 PHB: the three abilities a player chooses among for the background's
   * ability score increase (+2/+1 split or +1 to all three). Order follows the
   * source text; null for 2014 backgrounds and homebrew that grant no ASI.
   */
  asi_ability_trio: AbilityScoreKey[] | null;
  /**
   * 2024 PHB: structured form of `feat_grant_name`, parsed for lookup against
   * imported `class_features` rows. Null when the background grants no feat.
   */
  origin_feat: BackgroundOriginFeat | null;
  /** Block of personality traits / ideals / bonds / flaws suggestions. */
  suggested_characteristics: string | null;
  tags: string[];
  source: string | null;
  source_title?: string | null;
  source_url?: string | null;
  open5e_import?: boolean;
  image_url: string | null;
  focal_point: { x: number; y: number } | null;
  created_at: string;
  updated_at: string;
}

export type BackgroundInsert = Omit<Background, "id" | "user_id" | "created_at" | "updated_at">;
export type BackgroundUpdate = Partial<BackgroundInsert>;
import type { VersionedContentMetadata } from "@/types/content.types";
