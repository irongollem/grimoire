import type { SpellcastingBlock } from "@/types/npc.types";
import type { VersionedContentMetadata } from "@/types/content.types";
import type { AiProvenance } from "@/ai/provenance";

export const MONSTER_TYPES = [
  "aberration",
  "beast",
  "celestial",
  "construct",
  "dragon",
  "elemental",
  "fey",
  "fiend",
  "giant",
  "humanoid",
  "monstrosity",
  "ooze",
  "plant",
  "undead",
] as const;

export type MonsterType = (typeof MONSTER_TYPES)[number];

export const MONSTER_SIZES = [
  "tiny",
  "small",
  "medium",
  "large",
  "huge",
  "gargantuan",
] as const;

export type MonsterSize = (typeof MONSTER_SIZES)[number];

export interface MonsterStatBlock {
  armor_class: number;
  hit_points: string; // pure dice expr, e.g. "8d8+16"
  speed: string; // e.g. "30 ft."
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  challenge_rating: string; // e.g. "5" | "1/2" | "1/4"
  proficiency_bonus?: number; // e.g. 3 (overrides CR-derived default)
  // 2024 stat blocks print a flat "Initiative +N" derived from DEX + proficiency
  // (and sometimes more). Absent/null means "derive from DEX mod" (2014 behavior).
  initiative_bonus?: number | null;
  saving_throws?: string; // e.g. "Con +5, Wis +3"
  skills?: Record<string, string>; // e.g. { perception: '+3', stealth: '+5' }
  damage_vulnerabilities?: string;
  damage_resistances?: string;
  damage_immunities?: string;
  condition_immunities?: string;
  senses?: string;
  languages?: string;
  special_abilities?: Array<{ name: string; description: string }>;
  actions?: Array<{ name: string; description: string }>;
  bonus_actions?: Array<{ name: string; description: string }>;
  reactions?: Array<{ name: string; description: string }>;
  legendary_resistance?: number;
  legendary_actions?: Array<{ name: string; description: string }>;
  lair_actions?: Array<{ name: string; description: string }>;
  spellcasting?: SpellcastingBlock;
}

export interface Monster extends VersionedContentMetadata {
  id: string;
  user_id: string;
  /** NULL = available in every campaign; set = only visible when that campaign
   *  is active. Shared library_monsters rows are always null — they are gated
   *  by the campaign's enabled sources instead. */
  campaign_id: string | null;
  name: string;
  monster_type: MonsterType;
  size: MonsterSize;
  alignment: string;
  habitat: string | null;
  lair_location_id?: string | null; // user monsters only — SRD rows are shared content with no location FK
  source: string | null;       // Open5e document slug when imported, or free text
  source_title?: string | null; // Open5e document full title
  source_url?: string | null;   // Open5e document URL
  tags: string[];
  stat_block: MonsterStatBlock;
  description?: string | null;
  notes: string | null;
  image_url: string | null;    // portrait / profile image (tall)
  portrait_focal_point?: { x: number; y: number } | null;
  ai_provenance?: AiProvenance | null;
  created_at: string;
  updated_at: string;
  is_shared?: boolean;            // true for read-only shared library_monsters rows, whatever the publisher
  open5e_import?: boolean;     // true when the row was upserted by Open5e sync
}

/**
 * What a *player* receives, which is not a `Monster` (#842).
 *
 * `get_player_visible_monsters` returns `stat_block` as **null** whenever the
 * DM has not revealed a creature's stats — the gate is `reveal_stats`, and
 * withholding is the whole point of that column. `monsters.stat_block` is NOT
 * NULL, so `Monster` is accurate for a row and wrong for a projection.
 *
 * That mismatch is not academic: three users hit `null is not an object
 * (evaluating 'monster.stat_block.challenge_rating')` in production, and
 * nothing could fail to compile because the type promised a stat block was
 * always there.
 *
 * So player surfaces take this type instead, and the compiler tells their
 * authors what a DM-surface author never has to think about. The alternative —
 * optional-chaining `stat_block` at all ~30 call sites — would silence the
 * distinction rather than express it, and leave the next player surface to
 * rediscover it the same way.
 */
export type PlayerVisibleMonster = Omit<Monster, "stat_block"> & {
  stat_block: MonsterStatBlock | null;
};


export type MonsterInsert = Omit<Monster, "id" | "user_id" | "created_at" | "updated_at">;
export type MonsterUpdate = Partial<MonsterInsert>;

export interface DiscoveredMonster {
  id: string;
  campaign_id: string;
  monster_id: string | null;   // custom monster FK
  library_monster_id: string | null;     // SRD monster stable ID e.g. "srd_aboleth"
  visible_to: string[] | null; // null = whole party (legacy); array = specific party_member_ids
  /**
   * Whether the party may see this creature's numbers. **False withholds the
   * challenge rating too** — `get_player_visible_monsters` nulls the whole
   * `stat_block`, and the CR lives inside it, so the bestiary shows "CR ???".
   *
   * An earlier revision of this comment said "false = name/art/CR only", which
   * the code has never done. The behaviour was right and the comment was wrong:
   * CR is a spoiler, decided 7 Sep 2026 (#842). Pinned by
   * `supabase/tests/monster_stat_reveal.test.sql`, so passing "just the CR"
   * through — which that comment invited — now fails rather than leaking.
   *
   * What players do get before the reveal is the name and the art: they met the
   * thing, they just have not measured it.
   */
  reveal_stats: boolean;
  discovered_at: string;
}

export type DiscoveredMonsterInsert = Omit<DiscoveredMonster, "id" | "discovered_at" | "reveal_stats"> & { reveal_stats?: boolean };
