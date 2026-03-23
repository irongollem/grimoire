export const FACTION_TYPES = [
  "Guild",
  "Government",
  "Religion",
  "Criminal",
  "Military",
  "Merchant",
  "Secret Society",
  "Cult",
  "Other",
] as const;

export type FactionType = (typeof FACTION_TYPES)[number];

export const FACTION_ALIGNMENTS = [
  "Lawful Good",
  "Neutral Good",
  "Chaotic Good",
  "Lawful Neutral",
  "True Neutral",
  "Chaotic Neutral",
  "Lawful Evil",
  "Neutral Evil",
  "Chaotic Evil",
] as const;

export const NPC_FACTION_ROLES = [
  "Leader",
  "Officer",
  "Member",
  "Associate",
  "Agent",
  "Informant",
  "Unknown",
] as const;

export type NpcFactionRole = (typeof NPC_FACTION_ROLES)[number];

export const RELATION_TYPES = [
  { value: "allied",       label: "Allied",       color: "#22c55e" },
  { value: "friendly",     label: "Friendly",     color: "#86efac" },
  { value: "neutral",      label: "Neutral",      color: "#94a3b8" },
  { value: "suspicious",   label: "Suspicious",   color: "#f59e0b" },
  { value: "rival",        label: "Rival",        color: "#f97316" },
  { value: "hostile",      label: "Hostile",      color: "#ef4444" },
  { value: "secret_ally",  label: "Secret Ally",  color: "#8b5cf6" },
  { value: "secret_enemy", label: "Secret Enemy", color: "#ec4899" },
] as const;

export type RelationType = (typeof RELATION_TYPES)[number]["value"];

export function relationMeta(type: string) {
  return RELATION_TYPES.find((r) => r.value === type) ?? RELATION_TYPES[2];
}

export interface Faction {
  id: string;
  user_id: string;
  name: string;
  faction_type: string | null;
  description: string | null;
  emblem_url: string | null;
  alignment: string | null;
  is_player_visible: boolean;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface FactionNpc {
  id: string;
  faction_id: string;
  npc_id: string;
  role: string | null;
  user_id: string;
}

export interface FactionLocation {
  id: string;
  faction_id: string;
  location_id: string;
  notes: string | null;
  user_id: string;
}

export interface FactionItem {
  id: string;
  faction_id: string;
  item_id: string;
  notes: string | null;
  user_id: string;
}

export interface FactionRelation {
  id: string;
  faction_id: string;
  target_faction_id: string;
  relation_type: RelationType;
  notes: string | null;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface EntityNote {
  id: string;
  user_id: string;
  entity_type: string;
  entity_id: string;
  content: string | null;
  is_private: boolean;
  created_at: string;
  updated_at: string;
}
