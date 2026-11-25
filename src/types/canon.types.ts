import type { AiProvenance } from "../../supabase/functions/_shared/provenance/types.ts";
/**
 * The campaign's canon (#1226): one table, `canon_entries`, holding the
 * premise, the truths, the forces, the secrets, the open questions, the lore
 * and the backstories. The union literals mirror the migration's check
 * constraints; the MCP registry holds its enums equal to these.
 */
export const CANON_PARTS = [
  "premise",
  "truth",
  "force",
  "secret",
  "question",
  "lore",
  "backstory",
] as const;
export type CanonPart = (typeof CANON_PARTS)[number];

/**
 * The parts a client may create an entry in directly. A backstory is opened for a character (`open_backstory`) and
 * needs its `party_member_id`, so a plain create cannot make one. The MCP registry holds its create enum equal to this.
 */
export const CANON_CREATE_PARTS = ["premise", "truth", "force", "secret", "question", "lore"] as const;

/** Set only when `part` is `premise`. */
export const PREMISE_KINDS = ["pitch", "theme", "table", "voice", "look", "line", "veil"] as const;
export type PremiseKind = (typeof PREMISE_KINDS)[number];

/** Set only when `part` is `truth`. */
export const KNOWLEDGE_MARKS = ["all", "some", "secret"] as const;

/** What a piece of lore is (`canon_entries.lore_kind`, the database's check). */
export const LORE_KINDS = ["history", "legend", "culture", "magic", "place", "faith", "other"] as const;
export type LoreKind = (typeof LORE_KINDS)[number];
export type KnowledgeMark = (typeof KNOWLEDGE_MARKS)[number];

/** How an entry ended (`canon_entries.closed_as`): a question is answered; a force succeeded, was stopped or faded. */
export const CANON_CLOSED_AS = ["answered", "succeeded", "stopped", "faded"] as const;
export type CanonClosedAs = (typeof CANON_CLOSED_AS)[number];

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
  /**
   * When a secret was revealed, or a truth told to the party (#1279 item 27). Set only on a secret or a truth: until
   * then players never read a secret, and a told truth's moment is what gives it a New dot and a place in a session.
   */
  revealed_at: string | null;
  /** The session that was running when it was revealed or told; only ever set with `revealed_at` (#1258). */
  revealed_session_id: string | null;
  /** What people wrongly believe in a secret's place (#1279 item 15). Set only on a secret; players read it, alone, until the reveal. */
  cover_story: string | null;
  /** When the DM said "Leave it" to this entry as a loose end (#1279 item 21); Tonight and the read-through skip it. */
  loose_end_left_at: string | null;
  /** What happens if nobody stops a force (#1258). Set only when `part` is `force`. */
  if_succeeds: string | null;
  /** What a force wants, in one line. Set only when `part` is `force`. */
  wants: string | null;
  /** How many ticks fill a force's clock (2 to 12); null is no clock. Set only when `part` is `force`. */
  clock_size: number | null;
  image_url: string | null;
  /** Up to four style reference pictures, on the Look premise entry only (#1252); empty everywhere else. */
  reference_images: string[];
  /** What a piece of lore is. Set only when `part` is `lore`. */
  lore_kind: LoreKind | null;
  /** When it happened in the world, in the campaign's calendar. A month needs a year and a day needs a month. */
  world_year: number | null;
  world_month: number | null;
  world_day: number | null;
  /** Set only when `part` is `backstory`: the character whose past this is (one entry per character). */
  party_member_id: string | null;
  ai_provenance: AiProvenance | null;
  /** How the entry ended, with when and what became of it. Set together, only on a question or a force. */
  closed_as: CanonClosedAs | null;
  closed_at: string | null;
  closed_note: string | null;
  /** The entry this one turned into (the truth or secret that answers a question, the truth a revealed secret became). */
  became_entry_id: string | null;
  /** The table fact (`story_facts`) this truth was made from. Set only when `part` is `truth`; one fact makes at most one truth. */
  from_fact_id: string | null;
  /** The arc this entry belongs to (`canon_arcs`); never set on a premise entry. */
  arc_id: string | null;
  /** The habitat this truth belongs to (`campaign_habitats`, the Ecology part); set only when `part` is `truth`. */
  habitat_id: string | null;
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
  /** Who wrote it: the DM, or (in a backstory) the character's player. Null once that account is gone. */
  author_id: string | null;
  /** When the DM last rewrote a player's passage (#1279 item 30); cleared by the player's own next edit. */
  dm_edited_at: string | null;
  /** What the player had written before the DM's first edit since; null when the DM has not edited it. */
  body_before_dm_edit: string | null;
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
  /** An item the clue lies in (a letter, a locket), or a Scriptorium handout (#1258). One place at most, as above. */
  item_id: string | null;
  document_id: string | null;
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
  /** When the step is due in the world's calendar: a year, a year and month, or a whole date (#1258). */
  due_year: number | null;
  due_month: number | null;
  due_day: number | null;
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

/** The parts of the canon that may be tied to a quest; the database refuses a premise entry or an open question (23514). */
export const QUEST_LINKED_PARTS = ["force", "secret", "truth", "lore", "backstory"] as const;
export type QuestLinkedPart = (typeof QUEST_LINKED_PARTS)[number];

/** A quest a canon entry matters in: where the party meets a force, the quest that uncovers a secret. Unique per (entry, quest). Written and deleted. */
export interface CanonEntryQuest {
  id: string;
  user_id: string;
  campaign_id: string;
  entry_id: string;
  quest_id: string;
  created_at: string;
}

/** A player's question about the world (#1258 item 24). The DM adopts it as an open question or lets it be. */
export interface CanonWonder {
  id: string;
  user_id: string;
  campaign_id: string;
  party_member_id: string | null;
  body: string;
  adopted_entry_id: string | null;
  dismissed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** A line or veil a player asked for privately (#1279 item 29). `asked_by` is set only when the player signed it. */
export interface CanonLineRequest {
  id: string;
  user_id: string;
  campaign_id: string;
  kind: "line" | "veil";
  body: string;
  asked_by: string | null;
  adopted_entry_id: string | null;
  dismissed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** One thing the DM pinned for the next session (#1279 item 20): exactly one of the four ids is set. */
export interface CanonTonightPin {
  id: string;
  user_id: string;
  campaign_id: string;
  clue_id: string | null;
  passage_id: string | null;
  step_id: string | null;
  entry_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
