import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { RULESET_KEYS, RULESET_OPTIONS, type RulesetKey } from "@/types/ruleset.types";

/**
 * A character's edition, as distinct from its table's (#943).
 *
 * `party_members.ruleset` is the character's own and is not client-writable: it
 * changes only through the two conversions here. Whether a character may sit at
 * a table is the table's decision (`campaigns.allows_mixed_rulesets`), enforced
 * by the database on attach, join and insert; the helpers below let a surface
 * say so *before* the round trip, and read the refusal when it comes anyway.
 */

/**
 * How an edition is worded, by where it appears. A picker or a standalone label
 * uses `rulesetLabel` ("D&D 5e (2014)"); a sentence or a button uses
 * `rulesetRules` ("2014 rules": "plays the 2014 rules", "Convert to the 2024
 * rules"); a compact suffix on a card or chooser row uses `rulesetYear`. No
 * template interpolates the key itself, so the wording stays in one place.
 */
export function rulesetLabel(ruleset: RulesetKey): string {
  const option = RULESET_OPTIONS.find((candidate) => candidate.value === ruleset);
  if (!option) throw new Error(`Unknown ruleset: ${ruleset}`);
  return option.label;
}

/** The short form for a sentence: "2014 rules". */
export function rulesetRules(ruleset: RulesetKey): string {
  return `${rulesetYear(ruleset)} rules`;
}

/** The bare year, for a compact suffix such as `Level 3 · 2014`. */
export function rulesetYear(ruleset: RulesetKey): string {
  if (!RULESET_KEYS.includes(ruleset)) throw new Error(`Unknown ruleset: ${ruleset}`);
  return ruleset;
}

/** The other edition. There are two, and a conversion is always to the one a character is not. */
export function otherRuleset(ruleset: RulesetKey): RulesetKey {
  return ruleset === "2014" ? "2024" : "2014";
}

/** Whether a table takes a character: the same edition, or a table that allows both. */
export function isRulesetAdmissible(
  character: { ruleset: RulesetKey },
  campaign: { ruleset: RulesetKey; allows_mixed_rulesets: boolean },
): boolean {
  return character.ruleset === campaign.ruleset || campaign.allows_mixed_rulesets;
}

/** The two editions named by a bounce. */
export interface RulesetBounce {
  characterRuleset: RulesetKey;
  campaignRuleset: RulesetKey;
}

/**
 * SQLSTATE raised by `private.assert_ruleset_admissible()` when a table does not
 * take a character's edition. A code of this app's own, so it cannot be confused
 * with a permission or validation failure that happens to mention a ruleset.
 */
export const RULESET_BOUNCE_CODE = "RS001";

function isRulesetKey(value: unknown): value is RulesetKey {
  return typeof value === "string" && (RULESET_KEYS as readonly string[]).includes(value);
}

/**
 * Reads a bounce out of a failed attach or join, or returns null for any other
 * failure. The database puts both editions in the error's `details` as JSON.
 * Null rather than a guess when the shape is wrong: a caller that gets null
 * shows the error as an error, which is right for anything unrecognised.
 */
export function parseRulesetBounce(error: unknown): RulesetBounce | null {
  if (typeof error !== "object" || error === null) return null;
  const { code, details } = error as { code?: unknown; details?: unknown };
  if (code !== RULESET_BOUNCE_CODE || typeof details !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(details);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { character_ruleset, campaign_ruleset } = parsed as Record<string, unknown>;
  if (!isRulesetKey(character_ruleset) || !isRulesetKey(campaign_ruleset)) return null;
  return { characterRuleset: character_ruleset, campaignRuleset: campaign_ruleset };
}

// A conversion re-pins classes and spells and rewrites the character's review
// rows, so everything that renders a character is stale after one.
function invalidateConvertedCharacter(queryClient: ReturnType<typeof useQueryClient>) {
  for (const key of ["character-pool", "party", "my-characters", "character_classes", "character_spells", "ruleset_reviews"]) {
    void queryClient.invalidateQueries({ queryKey: [key] });
  }
}

/**
 * Converts a character to the other edition in place. For its owner, or for a
 * character nobody owns, its creator or the DM of its table. Official classes
 * and spells follow to their counterpart; anything without one is kept and
 * flagged in `ruleset_reviews` for the player to look at.
 */
export function useConvertCharacterRuleset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { partyMemberId: string; ruleset: RulesetKey }) => {
      const { error } = await supabase.rpc("convert_party_member_ruleset", {
        p_party_member_id: input.partyMemberId,
        p_ruleset: input.ruleset,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateConvertedCharacter(queryClient),
  });
}

/**
 * Makes a copy of a character in the caller's pool, converted to the given
 * edition, and returns the copy's id. The original is not touched, which is why
 * this is what a bounce offers: a conversion that loses something costs nothing.
 */
export function useConvertCharacterCopy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { partyMemberId: string; ruleset: RulesetKey }): Promise<string> => {
      const { data, error } = await supabase.rpc("convert_party_member_copy", {
        p_party_member_id: input.partyMemberId,
        p_ruleset: input.ruleset,
      });
      if (error) throw error;
      if (typeof data !== "string") throw new Error("The converted copy came back without an id.");
      return data;
    },
    onSuccess: () => invalidateConvertedCharacter(queryClient),
  });
}
