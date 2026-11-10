export const RULESET_KEYS = ["2014", "2024"] as const;

export type RulesetKey = (typeof RULESET_KEYS)[number];

/** The edition of the default game system (`DEFAULT_GAME_SYSTEM` in the registry). */
export const DEFAULT_RULESET: RulesetKey = "2024";

export const RULESET_OPTIONS: ReadonlyArray<{
  value: RulesetKey;
  label: string;
  description: string;
}> = [
  {
    value: "2014",
    label: "D&D 5e (2014)",
    description: "The original fifth-edition rules used by existing Grimoire campaigns.",
  },
  {
    value: "2024",
    label: "D&D 5e (2024)",
    description: "The revised fifth-edition rules, class progressions, and content versions.",
  },
];

// ── Ruleset reviews ───────────────────────────────────────────────────────────

/**
 * Converting a character between editions (2014⇄2024) can invalidate or newly
 * require a player choice. Rather than a per-domain boolean flag column, every
 * such case is recorded as a row here, raised by the per-character conversion
 * (`convert_party_member_ruleset`). A review belongs to the character, not to a
 * campaign, so the row carries no campaign id. Rows are select-only for
 * clients, cleared via the `acknowledge_ruleset_reviews` RPC.
 */
export type RulesetReviewFlagType = "class" | "subclass" | "spell" | "background";

export interface RulesetReview {
  id: string;
  party_member_id: string;
  flag_type: RulesetReviewFlagType;
  /** Set for flag_type 'class'/'subclass'; null for 'spell'/'background'. */
  character_class_id: string | null;
  /** Set for flag_type 'spell'; null otherwise. */
  character_spell_id: string | null;
  created_at: string;
  updated_at: string;
}
