import type { AiProvenance } from "../../supabase/functions/_shared/provenance/types.ts";
/**
 * The campaign's canon (#1226): one table, `canon_entries`, holding the
 * premise, the truths, the forces, the secrets, the open questions, the lore
 * and the chronicle. The union literals mirror the migration's check
 * constraints; the MCP registry holds its enums equal to these.
 */
export const CANON_PARTS = [
  "premise",
  "truth",
  "force",
  "secret",
  "question",
  "lore",
  "chronicle",
] as const;
export type CanonPart = (typeof CANON_PARTS)[number];

/** Set only when `part` is `premise`. */
export const PREMISE_KINDS = ["pitch", "theme", "table", "voice", "look", "line", "veil"] as const;
export type PremiseKind = (typeof PREMISE_KINDS)[number];

/** Set only when `part` is `truth`. */
export const KNOWLEDGE_MARKS = ["all", "some", "secret"] as const;

/** What a piece of lore is (`canon_entries.lore_kind`, the database's check). */
export const LORE_KINDS = ["history", "legend", "culture", "magic", "place", "faith", "other"] as const;
export type LoreKind = (typeof LORE_KINDS)[number];
export type KnowledgeMark = (typeof KNOWLEDGE_MARKS)[number];

export interface CanonEntry {
  id: string;
  user_id: string;
  campaign_id: string;
  part: CanonPart;
  premise_kind: PremiseKind | null;
  knowledge: KnowledgeMark | null;
  title: string;
  /** Tiptap JSON string. */
  body: string | null;
  sort_order: number;
  player_visible_to: string[];
  /** Set by the DM's Reveal button, only on a secret: until then players never read it. */
  revealed_at: string | null;
  /** What a force wants, in one line. Set only when `part` is `force`. */
  wants: string | null;
  /** How many ticks fill a force's clock (2 to 12); null is no clock. Set only when `part` is `force`. */
  clock_size: number | null;
  image_url: string | null;
  /** What a piece of lore is. Set only when `part` is `lore`. */
  lore_kind: LoreKind | null;
  /** When it happened in the world, in the campaign's calendar. A month needs a year and a day needs a month. */
  world_year: number | null;
  world_month: number | null;
  world_day: number | null;
  ai_provenance: AiProvenance | null;
  created_at: string;
  updated_at: string;
}

/**
 * One passage of a lore entry, in order (`sort_order`). The first is told with the entry itself; every later one is
 * told on its own (`told_at`, to the party members in `player_visible_to`) and may say where it comes out: a place, a
 * person or a beat, at most one of the three.
 */
export interface CanonLorePassage {
  id: string;
  user_id: string;
  campaign_id: string;
  entry_id: string;
  title: string;
  /** Tiptap JSON string. */
  body: string | null;
  sort_order: number;
  player_visible_to: string[];
  told_at: string | null;
  /** The session that was running when it was told; only ever set with `told_at`. */
  told_session_id: string | null;
  location_id: string | null;
  npc_id: string | null;
  quest_beat_id: string | null;
  ai_provenance: AiProvenance | null;
  created_at: string;
  updated_at: string;
}

/**
 * One clue to a secret: a line placed at a place, a person or a quest beat (at most one of the three, or none yet).
 * `found_at` is when the party found it at the table; `found_session_id` is the session that was running then.
 */
export interface CanonClue {
  id: string;
  user_id: string;
  campaign_id: string;
  secret_id: string;
  title: string;
  sort_order: number;
  location_id: string | null;
  npc_id: string | null;
  quest_beat_id: string | null;
  found_at: string | null;
  found_session_id: string | null;
  /** The lore passage this clue is, when it points at one: telling the passage finds the clue (in the database). */
  passage_id: string | null;
  ai_provenance: AiProvenance | null;
  created_at: string;
  updated_at: string;
}

/** One step of what a force does next, in order (`sort_order`). `reached_at` is when the world got there. */
export interface CanonForceStep {
  id: string;
  user_id: string;
  campaign_id: string;
  force_id: string;
  title: string;
  sort_order: number;
  reached_at: string | null;
  /** The session that was running when it was reached; only ever set with `reached_at`. */
  reached_session_id: string | null;
  ai_provenance: AiProvenance | null;
  created_at: string;
  updated_at: string;
}

/**
 * One move of a force's clock: forward is positive, back is negative. The clock's fill is the sum of these, never
 * stored. Written and deleted, never updated.
 */
export interface CanonForceTick {
  id: string;
  user_id: string;
  campaign_id: string;
  force_id: string;
  /** Non-zero, -12 to 12. */
  delta: number;
  note: string;
  session_id: string | null;
  /** The step this tick reached, when it is the tick a Reached tick wrote; null for a tick by hand. */
  step_id: string | null;
  /** The world's date when it ticked, from the campaign's calendar, when the campaign keeps one. */
  world_year: number | null;
  world_month: number | null;
  world_day: number | null;
  created_at: string;
}

/** A quest where the party meets a force. Unique per (force, quest). Written and deleted. */
export interface CanonForceQuest {
  id: string;
  user_id: string;
  campaign_id: string;
  force_id: string;
  quest_id: string;
  created_at: string;
}
