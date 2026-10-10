import type { RollMode } from "@/lib/dice/dice";
import { hasSaveDisadvantage } from "@/rules/conditions";
import type { RulesetKey } from "@/types/ruleset.types";
import type { SaveAbility } from "@/types/statBlock.types";

/** These conditions make the creature automatically fail Strength and Dexterity saves (SRD). */
export const AUTO_FAIL_STR_DEX_CONDITIONS = new Set<string>(["Paralyzed", "Stunned", "Petrified", "Unconscious"]);

export function autoFailsSave(conditions: string[], ability: SaveAbility): boolean {
  if (ability !== "str" && ability !== "dex") return false;
  return conditions.some((c) => AUTO_FAIL_STR_DEX_CONDITIONS.has(c));
}

export function saveRollMode(input: {
  conditions: string[];
  ability: SaveAbility;
  ruleset: RulesetKey;
  dmMode?: RollMode;
}): { mode: RollMode; reasons: string[] } {
  const { conditions, ability, ruleset, dmMode } = input;
  // Decide once over every source (any advantage with any disadvantage is a straight roll).
  const hasAdvantage = dmMode === "advantage";
  let hasDisadvantage = dmMode === "disadvantage";
  const reasons: string[] = [];
  if (hasSaveDisadvantage(conditions, ability, ruleset)) {
    hasDisadvantage = true;
    reasons.push(
      ability === "dex" && conditions.includes("Restrained")
        ? "Restrained on a Dexterity save"
        : "Exhaustion imposes disadvantage on saves",
    );
  }
  if (dmMode && dmMode !== "normal") reasons.push(`DM sets ${dmMode}`);
  const mode: RollMode = hasAdvantage === hasDisadvantage ? "normal" : hasAdvantage ? "advantage" : "disadvantage";
  return { mode, reasons };
}

/**
 * Compare a save to its DC. RAW saves have no natural-20 or natural-1 rule
 * (that is attack rolls only), so the numbers alone decide.
 */
export function resolveSave(input: {
  d20: number;
  bonus: number;
  dc: number;
  penalty?: number;
  autoFail?: boolean;
}): { total: number; success: boolean } {
  const total = input.d20 + input.bonus + (input.penalty ?? 0);
  return { total, success: !input.autoFail && total >= input.dc };
}

const SAVE_ABILITY_NAMES: Record<string, SaveAbility> = {
  str: "str", strength: "str",
  dex: "dex", dexterity: "dex",
  con: "con", constitution: "con",
  int: "int", intelligence: "int",
  wis: "wis", wisdom: "wis",
  cha: "cha", charisma: "cha",
};

/**
 * "Con +5, Wis +3" -> { con: 5, wis: 3 }. Full names and abbreviations in any
 * case, optional space before the sign, "-" or U+2212, and trailing text after
 * a bonus ("Dex +3 (advantage vs. traps)") are all read. Unreadable parts are skipped.
 */
function parseSaveString(s: string): Partial<Record<SaveAbility, number>> {
  const result: Partial<Record<SaveAbility, number>> = {};
  for (const part of s.split(",")) {
    const m = part.trim().match(/^([a-z]+)\s*([+\-\u2212])\s*(\d+)/i);
    if (!m) continue;
    const ability = SAVE_ABILITY_NAMES[m[1].toLowerCase()];
    if (ability) result[ability] = (m[2] === "+" ? 1 : -1) * Number(m[3]);
  }
  return result;
}

/** The save bonus the stat block prints for this ability ("Con +5"), or null when it lists none. */
export function listedSaveBonus(block: { saving_throws?: string }, ability: SaveAbility): number | null {
  if (!block.saving_throws) return null;
  return parseSaveString(block.saving_throws)[ability] ?? null;
}

/** The listed save bonus if the stat block has one, else the ability modifier. */
export function saveBonusFromStatBlock(
  block: { saving_throws?: string; str: number; dex: number; con: number; int: number; wis: number; cha: number },
  ability: SaveAbility,
): number {
  const listed = listedSaveBonus(block, ability);
  return listed ?? Math.floor((block[ability] - 10) / 2);
}
