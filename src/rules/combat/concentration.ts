import type { RulesetKey } from "@/types/ruleset.types";

/** Incapacitated ends concentration; these all include Incapacitated (SRD), so list them. */
export const CONCENTRATION_BREAKING_CONDITIONS = new Set<string>([
  "Incapacitated",
  "Unconscious",
  "Paralyzed",
  "Petrified",
  "Stunned",
]);

export function concentrationBreaksOn(conditions: string[]): boolean {
  return conditions.some((c) => CONCENTRATION_BREAKING_CONDITIONS.has(c));
}

/** DC 10 or half the damage, whichever is higher; 2024 caps it at 30. */
export function concentrationDc(damage: number, ruleset: RulesetKey): number {
  const dc = Math.max(10, Math.floor(damage / 2));
  return ruleset === "2024" ? Math.min(dc, 30) : dc;
}

export function resolveConcentration(input: {
  damage: number;
  d20: number;
  conSaveBonus: number;
  ruleset: RulesetKey;
  penalty?: number;
}): { dc: number; total: number; maintained: boolean } {
  const dc = concentrationDc(input.damage, input.ruleset);
  const total = input.d20 + input.conSaveBonus + (input.penalty ?? 0);
  return { dc, total, maintained: total >= dc };
}
