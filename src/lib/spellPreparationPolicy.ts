import type { CasterType } from "@/types/spell.types";
import type { RulesetKey } from "@/types/ruleset.types";

export type PreparationChangeTiming = "level_up" | "long_rest";

export interface SpellPreparationPolicy {
  casterType: CasterType;
  prepared: readonly number[] | null;
  cantrips: readonly number[] | null;
  changeTiming: PreparationChangeTiming;
  /** null means any number of prepared spells may be replaced. */
  changeCount: number | null;
}

const FULL_PREPARED = [4,5,6,7,9,10,11,12,14,15,16,16,17,17,18,18,19,20,21,22] as const;
const HALF_PREPARED = [2,3,4,5,6,6,7,7,9,9,10,10,11,11,12,12,14,14,15,15] as const;
const SORCERER_PREPARED = [2,4,6,7,9,10,11,12,14,15,16,16,17,17,18,18,19,20,21,22] as const;
const WARLOCK_PREPARED = [2,3,4,5,6,7,8,9,10,10,11,11,12,12,13,13,14,14,15,15] as const;
const WIZARD_PREPARED = [4,5,6,7,9,10,11,12,14,15,16,16,17,18,19,21,22,23,24,25] as const;

const CANTRIPS_2_3_4 = [2,2,2,3,3,3,3,3,3,4,4,4,4,4,4,4,4,4,4,4] as const;
const CANTRIPS_3_4_5 = [3,3,3,4,4,4,4,4,4,5,5,5,5,5,5,5,5,5,5,5] as const;
const CANTRIPS_4_5_6 = [4,4,4,5,5,5,5,5,5,6,6,6,6,6,6,6,6,6,6,6] as const;

/** Official 2024 class-table limits. Subclass/feature spells are excluded. */
export const SPELL_PREPARATION_2024: Readonly<Record<string, SpellPreparationPolicy>> = {
  Bard:     { casterType: "prepared",  prepared: FULL_PREPARED,     cantrips: CANTRIPS_2_3_4, changeTiming: "level_up", changeCount: 1 },
  Cleric:   { casterType: "prepared",  prepared: FULL_PREPARED,     cantrips: CANTRIPS_3_4_5, changeTiming: "long_rest", changeCount: null },
  Druid:    { casterType: "prepared",  prepared: FULL_PREPARED,     cantrips: CANTRIPS_2_3_4, changeTiming: "long_rest", changeCount: null },
  Paladin:  { casterType: "prepared",  prepared: HALF_PREPARED,     cantrips: null,            changeTiming: "long_rest", changeCount: 1 },
  Ranger:   { casterType: "prepared",  prepared: HALF_PREPARED,     cantrips: null,            changeTiming: "long_rest", changeCount: 1 },
  Sorcerer: { casterType: "prepared",  prepared: SORCERER_PREPARED, cantrips: CANTRIPS_4_5_6, changeTiming: "level_up", changeCount: 1 },
  Warlock:  { casterType: "prepared",  prepared: WARLOCK_PREPARED,  cantrips: CANTRIPS_2_3_4, changeTiming: "level_up", changeCount: 1 },
  Wizard:   { casterType: "spellbook", prepared: WIZARD_PREPARED,   cantrips: CANTRIPS_3_4_5, changeTiming: "long_rest", changeCount: null },
};

export function getSpellPreparationPolicy(
  className: string | null | undefined,
  ruleset: RulesetKey,
): SpellPreparationPolicy | null {
  if (ruleset !== "2024" || !className) return null;
  return SPELL_PREPARATION_2024[className] ?? null;
}

export function policyValueAtLevel(
  values: readonly number[] | null,
  level: number,
): number | null {
  if (!values) return null;
  return values[Math.max(1, Math.min(20, Math.floor(level))) - 1] ?? null;
}
