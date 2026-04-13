/**
 * Player character backgrounds (Acolyte, Outlander, Urchin …). Modelled on
 * the Open5e `/v1/backgrounds/` schema plus Grimoire-specific fields
 * (tags, custom image, Tiptap JSON description).
 */
export interface Background {
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
