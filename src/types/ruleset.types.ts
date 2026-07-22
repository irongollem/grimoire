export const RULESET_KEYS = ["2014", "2024"] as const;

export type RulesetKey = (typeof RULESET_KEYS)[number];

export const DEFAULT_RULESET: RulesetKey = "2014";

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

export function normalizeRuleset(value: string | null | undefined): RulesetKey {
  return value === "2024" ? "2024" : DEFAULT_RULESET;
}

// ── Ruleset reviews ───────────────────────────────────────────────────────────

/**
 * A campaign ruleset change (2014⇄2024) can invalidate or newly require a
 * player choice. Rather than a per-domain boolean flag column, every such
 * case is recorded as a row here by a DB trigger. Rows are select-only for
 * clients — cleared via the `acknowledge_ruleset_reviews` RPC.
 */
export type RulesetReviewFlagType = "class" | "subclass" | "spell" | "background";

export interface RulesetReview {
  id: string;
  campaign_id: string;
  party_member_id: string;
  flag_type: RulesetReviewFlagType;
  /** Set for flag_type 'class'/'subclass'; null for 'spell'/'background'. */
  character_class_id: string | null;
  /** Set for flag_type 'spell'; null otherwise. */
  character_spell_id: string | null;
  created_at: string;
  updated_at: string;
}
