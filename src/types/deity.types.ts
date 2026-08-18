export const CLERIC_DOMAINS = [
  "Arcana",
  "Death",
  "Forge",
  "Grave",
  "Knowledge",
  "Life",
  "Light",
  "Mercy",
  "Nature",
  "Order",
  "Peace",
  "Tempest",
  "Trickery",
  "Twilight",
  "War",
] as const;

export type ClericDomain = (typeof CLERIC_DOMAINS)[number];

export const DEITY_ALIGNMENTS = [
  "Lawful Good",
  "Neutral Good",
  "Chaotic Good",
  "Lawful Neutral",
  "True Neutral",
  "Chaotic Neutral",
  "Lawful Evil",
  "Neutral Evil",
  "Chaotic Evil",
  "Unaligned",
] as const;

export type DeityAlignment = (typeof DEITY_ALIGNMENTS)[number];

// ── Pantheons ─────────────────────────────────────────────────────────────────

export interface Pantheon {
  id: string;
  user_id: string;
  campaign_id: string;
  name: string;
  description: string | null; // Tiptap JSON
  emblem_url: string | null;
  tags: string[];
  player_visible_to: string[];
  /**
   * Setting key that seeded this row via Populate Setting; null when the user
   * made it. Content we ship does not count against free-tier quotas — see
   * `check_quota` and `lib/settingContent`.
   */
  setting_source?: string | null;
  created_at: string;
  updated_at: string;
}

export type PantheonInsert = Omit<Pantheon, "id" | "user_id" | "created_at" | "updated_at">;
export type PantheonUpdate = Partial<PantheonInsert>;

// ── Deities ───────────────────────────────────────────────────────────────────

export interface Deity {
  id: string;
  user_id: string;
  campaign_id: string;
  name: string;
  titles: string | null;
  alternate_names: string[];
  pantheon_id: string | null;
  alignment: string | null;
  symbol: string | null;
  symbol_image_url: string | null;
  portrait_url: string | null;
  portrait_focal_point: { x: number; y: number } | null;
  domains: string[];
  portfolio: string | null;
  description: string | null; // Tiptap JSON
  dm_notes: string | null;    // Tiptap JSON
  tags: string[];
  player_visible_to: string[];
  /**
   * Setting key that seeded this row via Populate Setting; null when the user
   * made it. Content we ship does not count against free-tier quotas — see
   * `check_quota` and `lib/settingContent`.
   */
  setting_source?: string | null;
  created_at: string;
  updated_at: string;
}

export type DeityInsert = Omit<Deity, "id" | "user_id" | "created_at" | "updated_at">;
export type DeityUpdate = Partial<DeityInsert>;
