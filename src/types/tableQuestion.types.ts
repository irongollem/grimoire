// ── Table questions (#1212) ─────────────────────────────────────────────────
//
// A DM sends a roll table to the table as a question: each player picks their
// own, the table votes, or a player rolls. The question carries a snapshot of
// the table's entries (`options`), because players never read `roll_tables`
// (DM-only, and its entries carry DM notes). Schema and the reasons behind it:
// migration 20261116074944_table_questions.sql.

import type { RollTableDie } from "@/types/rollTable.types";

export const TABLE_QUESTION_MODES = ["pick", "vote", "roll"] as const;
/** pick: each chooses for their own character. vote: the table votes. roll: each rolls. */
export type TableQuestionMode = (typeof TABLE_QUESTION_MODES)[number];

/** What a roll table entry may name, so it can show that thing's picture. */
export const ENTRY_REF_KINDS = ["monster", "item", "npc"] as const;
export type EntryRefKind = (typeof ENTRY_REF_KINDS)[number];

/**
 * A roll table entry's link to a creature, item or NPC. Monster and item ids
 * are either a campaign row's uuid or a library text id (the #597 split, as
 * `useMonstersByIds` / `useItemsByIds` resolve them); an NPC id is a uuid.
 */
export interface EntryRef {
  kind: EntryRefKind;
  id: string;
}

/** One option of a sent question: a snapshot of a roll table entry, read by players. */
export interface TableQuestionOption {
  /** The roll table entry's id. */
  id: string;
  label: string;
  /** One or two plain sentences under the picture; the entry's player-facing blurb. */
  blurb: string | null;
  image_url: string | null;
  focal: { x: number; y: number } | null;
  /**
   * What the option is, when it names a creature or item: a picked creature can
   * become a pet. Never an NPC: a player has no use for an NPC's id, and a
   * disguised one's would say more than its picture does.
   */
  ref: { kind: "monster" | "item"; id: string } | null;
  /** The entry's range, read by a roll question. */
  min: number;
  max: number;
}

export interface TableQuestion {
  id: string;
  campaign_id: string;
  user_id: string;
  roll_table_id: string | null;
  prompt: string;
  mode: TableQuestionMode;
  /** Set for a roll question only. */
  dice: RollTableDie | null;
  /** A pick: only one of each option at this table. */
  exclusive: boolean;
  /** A vote: the players do not see each other's votes until it closes. */
  hidden: boolean;
  options: TableQuestionOption[];
  closed_at: string | null;
  /** A closed vote's result: the DM's call. */
  outcome_option_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TableQuestionInsert {
  campaign_id: string;
  roll_table_id: string | null;
  prompt: string;
  mode: TableQuestionMode;
  dice: RollTableDie | null;
  exclusive: boolean;
  hidden: boolean;
  options: TableQuestionOption[];
}

export interface TableQuestionAnswer {
  id: string;
  question_id: string;
  campaign_id: string;
  user_id: string;
  party_member_id: string | null;
  /** Null only for a roll that landed in a gap of the table. */
  option_id: string | null;
  /** The die the server rolled; null for a pick or a vote. */
  rolled: number | null;
  /** The pet made from this pick. */
  companion_id: string | null;
  created_at: string;
  updated_at: string;
}
