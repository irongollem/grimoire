import { INCAPACITATING_CONDITIONS } from "../conditions.ts";
import type { AppliedCondition } from "../../types/condition.types.ts";
import type { RulesetKey } from "../../types/ruleset.types.ts";

/** Incapacitated ends concentration (SRD 5.1 "Concentration"), so the breaking set is the incapacitating one. */
export const CONCENTRATION_BREAKING_CONDITIONS = INCAPACITATING_CONDITIONS;

export function concentrationBreaksOn(conditions: readonly AppliedCondition[]): boolean {
  return conditions.some((c) => CONCENTRATION_BREAKING_CONDITIONS.has(c.name));
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
