import type { Rule, TrackerDef } from "@/types/rule.types";

/**
 * The custom-rule-tracker widget's per-instance configuration (#764).
 *
 * Same shape of problem as `rollTableCard.ts`, for the same reason: the DM
 * pins one *campaign row* (a custom rule with a tracker attached) rather than
 * something shipped in the bundle, so it can disappear from under a saved
 * layout — the DM deleted the rule, stripped its tracker, or switched to a
 * campaign that never had it. Resolution therefore answers in the same three
 * states, and a `missing` card must say so rather than quietly rolling (here:
 * displaying) some other rule's tracker — a Sanity card that silently started
 * showing Corruption would read as correct while being wrong.
 */

/** A custom rule guaranteed to carry a tracker — the type-level version of
 *  the `tracker !== null` filter, so call sites never need a non-null
 *  assertion to reach `rule.tracker`. */
export type RuleWithTracker = Rule & { tracker: TrackerDef };

export interface RuleTrackerCardSettings {
  /** Absent on a card the DM has not configured — see `resolveRuleTracker`. */
  ruleId?: string;
}

export type RuleTrackerResolution =
  /** Nothing to track: the campaign has no custom rules with a tracker. */
  | { state: "none" }
  /** Configured (or defaulted) and present. */
  | { state: "ready"; rule: RuleWithTracker }
  /** The layout names a rule this campaign does not have — or that used to
   *  have a tracker and no longer does, which reads the same from here: there
   *  is nothing left to draw a tracker for. */
  | { state: "missing"; ruleId: string };

export function parseRuleTrackerCardSettings(raw: unknown): RuleTrackerCardSettings {
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    const ruleId = (raw as Record<string, unknown>).ruleId;
    if (typeof ruleId === "string" && ruleId !== "") return { ruleId };
  }
  return {};
}

/** Only rules that actually carry a tracker are eligible — a rule with
 *  `tracker: null` has nothing this card can draw. */
function trackedRules(rules: readonly Rule[]): RuleWithTracker[] {
  return rules.filter((rule): rule is RuleWithTracker => rule.tracker !== null);
}

/**
 * Which rule's tracker one card should show.
 *
 * An unconfigured card falls to the first tracker-bearing rule, rather than
 * demanding a trip through the gear before it shows anything — `useRules`
 * orders by title, so "first" is stable and skips straight past any rule
 * whose `tracker` is null, since those were never candidates to begin with.
 *
 * A configured id that is not among the tracker-bearing rules — because the
 * rule is gone, or because it is still there but lost its tracker — is
 * reported as `missing`, never quietly replaced with a different rule's
 * tracker.
 */
export function resolveRuleTracker(
  raw: unknown,
  rules: readonly Rule[],
): RuleTrackerResolution {
  const { ruleId } = parseRuleTrackerCardSettings(raw);
  const eligible = trackedRules(rules);

  if (ruleId === undefined) {
    const first = eligible[0];
    return first === undefined ? { state: "none" } : { state: "ready", rule: first };
  }

  const rule = eligible.find((candidate) => candidate.id === ruleId);
  return rule === undefined ? { state: "missing", ruleId } : { state: "ready", rule };
}
