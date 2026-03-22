import type { MonsterStatBlock } from "@/types/monster.types";

export type CompanionType = "familiar" | "animal_companion" | "mount" | "ally" | "sidekick";
export type CompanionSourceType = "monster" | "npc" | "custom";

export const COMPANION_TYPES: CompanionType[] = [
  "familiar",
  "animal_companion",
  "mount",
  "ally",
  "sidekick",
];

export const COMPANION_TYPE_LABELS: Record<CompanionType, string> = {
  familiar:         "Familiar",
  animal_companion: "Animal Companion",
  mount:            "Mount",
  ally:             "Ally",
  sidekick:         "Sidekick",
};

export const COMPANION_TYPE_COLORS: Record<CompanionType, string> = {
  familiar:         "#7c3aed",
  animal_companion: "#059669",
  mount:            "#b45309",
  ally:             "#2563eb",
  sidekick:         "#db2777",
};

export interface Companion {
  id: string;
  user_id: string;
  campaign_id: string | null;
  name: string;
  companion_type: CompanionType;
  source_type: CompanionSourceType;
  source_monster_id: string | null;  // text — supports both SRD slugs and custom UUID ids
  source_npc_id: string | null;
  owner_party_member_id: string | null;
  max_hp: number;
  current_hp: number;
  ac: number;
  speed: number;
  conditions: string[];
  notes: string | null;
  party_notes?: string | null;
  sort_order: number;
  portrait_url: string | null;
  portrait_focal_point?: { x: number; y: number } | null;
  stat_block: MonsterStatBlock | null;
  created_at: string;
  updated_at: string;
}

export type CompanionInsert = Omit<Companion, "id" | "user_id" | "created_at" | "updated_at">;
export type CompanionUpdate = Partial<CompanionInsert>;
