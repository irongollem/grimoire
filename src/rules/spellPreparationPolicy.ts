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

/**
 * Whether the pinned class definition for this level-up is the official
 * system-provided one or a campaign's custom class. Mirrors the
 * `p_definition_kind` argument of `required_level_up_spell_choices`
 * (migration 20260720000026) — a null/unpinned definition coalesces to
 * "system" on the server, so that is this function's default too.
 */
export type SpellDefinitionKind = "system" | "custom";

/**
 * Number of non-cantrip spell choices made while entering a class level.
 *
 * Faithfully mirrors `required_level_up_spell_choices`: the 2024 policy
 * tables (and the Wizard spellbook special case) are consulted ONLY for a
 * "system" definition. A "custom" definition — even one that reuses an
 * official class name like "Cleric" — always falls back to its own
 * `legacySpellsKnown` progression, gated on `casterType === "known"` just
 * like the server's `v_caster_type = 'known'` check. Without that gate, a
 * custom class sharing an official name could silently inherit the wrong
 * (official) progression, and the server would reject the level-up because
 * its own count would disagree.
 */
export function levelUpSpellChoiceCount(
  className: string | null | undefined,
  ruleset: RulesetKey,
  level: number,
  legacySpellsKnown: readonly number[] | null | undefined,
  definitionKind: SpellDefinitionKind = "system",
  casterType?: CasterType | null,
): number {
  const nextLevel = Math.max(1, Math.min(20, Math.floor(level)));
  const previousLevel = nextLevel - 1;

  if (definitionKind === "system") {
    // Both editions give a Wizard six book spells on taking Wizard 1 and two
    // more on every later Wizard level. Prepared-spell limits are a separate
    // choice and must never be mistaken for spellbook acquisition.
    if (className === "Wizard") return previousLevel === 0 ? 6 : 2;

    const revised = getSpellPreparationPolicy(className, ruleset);
    if (revised) {
      const progression = revised.prepared;
      if (!progression) return 0;
      const current = progression[nextLevel - 1] ?? 0;
      const previous = previousLevel > 0 ? (progression[previousLevel - 1] ?? 0) : 0;
      return Math.max(0, current - previous);
    }
  }

  // Fallback path — a custom definition, or a system class without a
  // policy-table row (e.g. a 2014-ruleset class). Only a "known" caster
  // learns spells at level-up; a prepared/spellbook/none caster gets 0 here,
  // matching the server's `v_caster_type = 'known'` gate.
  if (casterType !== "known") return 0;
  const progression = legacySpellsKnown;
  if (!progression) return 0;
  const current = progression[nextLevel - 1] ?? 0;
  const previous = previousLevel > 0 ? (progression[previousLevel - 1] ?? 0) : 0;
  return Math.max(0, current - previous);
}
