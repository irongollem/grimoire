export type NpcStatus = "alive" | "dead" | "missing" | "unknown";
export type NpcRelationship = "ally" | "neutral" | "enemy" | "unknown";

export type NpcRelationshipType =
  | "family"
  | "friend"
  | "ally"
  | "rival"
  | "enemy"
  | "mentor"
  | "apprentice"
  | "lover"
  | "subordinate"
  | "superior"
  | "contact"
  | "former_ally"
  | "former_enemy";

export const NPC_RELATIONSHIP_TYPE_LABELS: Record<NpcRelationshipType, string> = {
  family:       "Family",
  friend:       "Friend",
  ally:         "Ally",
  rival:        "Rival",
  enemy:        "Enemy",
  mentor:       "Mentor",
  apprentice:   "Apprentice",
  lover:        "Lover",
  subordinate:  "Subordinate",
  superior:     "Superior",
  contact:      "Contact",
  former_ally:  "Former Ally",
  former_enemy: "Former Enemy",
};

// When displaying a relationship from the *other* NPC's perspective, use the inverse type.
// Symmetric types map to themselves.
export const NPC_RELATIONSHIP_INVERSE: Record<NpcRelationshipType, NpcRelationshipType> = {
  family:       "family",
  friend:       "friend",
  ally:         "ally",
  rival:        "rival",
  enemy:        "enemy",
  mentor:       "apprentice",
  apprentice:   "mentor",
  lover:        "lover",
  subordinate:  "superior",
  superior:     "subordinate",
  contact:      "contact",
  former_ally:  "former_ally",
  former_enemy: "former_enemy",
};

export const NPC_RELATIONSHIP_TYPE_COLORS: Record<NpcRelationshipType, string> = {
  family:       "#7c3aed",
  friend:       "#059669",
  ally:         "#2563eb",
  rival:        "#d97706",
  enemy:        "#dc2626",
  mentor:       "#0891b2",
  apprentice:   "#6366f1",
  lover:        "#db2777",
  subordinate:  "#6b7280",
  superior:     "#374151",
  contact:      "#64748b",
  former_ally:  "#92400e",
  former_enemy: "#7f1d1d",
};

export interface NpcRelation {
  id: string;
  user_id: string;
  campaign_id: string | null;
  npc_id: string;
  related_npc_id: string;
  relationship_type: NpcRelationshipType;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type NpcRelationInsert = Omit<NpcRelation, "id" | "user_id" | "created_at" | "updated_at">;
export type NpcRelationUpdate = Partial<NpcRelationInsert>;

export interface SpellcastingEntry {
  frequency: string; // e.g. "at will", "3/day each", "1st level (4 slots)"
  spell_ids: string[];
}

export type SpellcastingAbility = "INT" | "WIS" | "CHA";

export interface SpellcastingBlock {
  ability?: SpellcastingAbility;
  save_dc?: number;
  attack_bonus?: number;
  entries: SpellcastingEntry[];
}

export interface StatBlock {
  armor_class: number;
  hit_points: string; // e.g. "52 (8d8 + 16)"
  speed: string; // e.g. "30 ft."
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  challenge_rating: string; // e.g. "5" or "1/2"
  proficiency_bonus?: number; // e.g. 3 (overrides CR-derived default)
  saving_throws?: string; // e.g. "Con +5, Wis +3"
  skills?: Record<string, string>;
  damage_vulnerabilities?: string;
  damage_resistances?: string;
  damage_immunities?: string;
  condition_immunities?: string;
  senses?: string;
  languages?: string;
  special_abilities?: Array<{ name: string; description: string }>;
  actions?: Array<{ name: string; description: string }>;
  legendary_actions?: Array<{ name: string; description: string }>;
  spellcasting?: SpellcastingBlock;
}

export interface Npc {
  id: string;
  user_id: string;
  campaign_id: string | null;
  name: string;
  race: string | null;
  alignment: string | null;
  age: string | null;
  occupation: string | null;
  location_id: string | null;
  appearance: string | null;
  personality: string | null;
  backstory: string | null;
  notes: string | null;
  status: NpcStatus;
  relationship: NpcRelationship;
  portrait_url: string | null; // tall profile image
  card_art_url: string | null; // landscape art for MTG Card Forge
  portrait_focal_point?: { x: number; y: number } | null; // manual override for FocalImage (0–100 percentages)
  // Alter ego / disguise: false identity shown to players until revealed
  disguise_name: string | null;
  disguise_portrait_url: string | null;
  disguise_portrait_focal_point?: { x: number; y: number } | null;
  is_revealed: boolean;
  tags: string[];
  stat_block: StatBlock | null;
  linked_monster_id: string | null; // links to a Bestiary monster (monstrous NPC)
  scriptorium_doc_id: string | null; // links to a ScriptoriumDocument (e.g. stat block sheet)
  player_visible_to: string[]; // [] = hidden; uuid[] = visible to those party_member_ids
  player_visible_fields: string[]; // subset of: portrait | name | status | race | occupation | relationship
  created_at: string;
  updated_at: string;
}

export type NpcInsert = Omit<
  Npc,
  "id" | "user_id" | "created_at" | "updated_at" | "location_id" | "linked_monster_id"
> & { location_id?: string | null; linked_monster_id?: string | null };
export type NpcUpdate = Partial<NpcInsert>;

// ── Per-PC relation notes ─────────────────────────────────────────────────────

export interface NpcPcNote {
  id: string;
  user_id: string;
  campaign_id: string;
  npc_id: string;
  party_member_id: string;
  relationship_type: NpcRelationshipType;
  notes: string;
  created_at: string;
  updated_at: string;
}

export type NpcPcNoteUpsert = Pick<NpcPcNote, "campaign_id" | "npc_id" | "party_member_id" | "relationship_type" | "notes">;

// ── Hall of Heroes ─────────────────────────────────────────────────────────────

export interface HallOfHero {
  id: string;
  user_id: string;
  name: string;
  setting: string;
  race: string | null;
  alignment: string | null;
  age: string | null;
  occupation: string | null;
  appearance: string | null;
  personality: string | null;
  backstory: string | null;
  notes: string | null;
  status: NpcStatus;
  relationship: NpcRelationship;
  portrait_url: string | null;
  card_art_url: string | null;
  portrait_focal_point?: { x: number; y: number } | null;
  disguise_name: string | null;
  disguise_portrait_url: string | null;
  disguise_portrait_focal_point?: { x: number; y: number } | null;
  is_revealed: boolean;
  tags: string[];
  stat_block: StatBlock | null;
  created_at: string;
  updated_at: string;
}

export type HallOfHeroInsert = Omit<HallOfHero, "id" | "user_id" | "created_at" | "updated_at">;
export type HallOfHeroUpdate = Partial<HallOfHeroInsert>;
