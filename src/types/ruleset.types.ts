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
