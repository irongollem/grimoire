import { combineModes, type RollMode } from "@/lib/dice/dice";
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
  let mode: RollMode = "normal";
  const reasons: string[] = [];
  if (hasSaveDisadvantage(conditions, ability, ruleset)) {
    mode = combineModes(mode, "disadvantage");
    reasons.push(
      ability === "dex" && conditions.includes("Restrained")
        ? "Restrained on a Dexterity save"
        : "Exhaustion imposes disadvantage on saves",
    );
  }
  if (dmMode && dmMode !== "normal") {
    mode = combineModes(mode, dmMode);
    reasons.push(`DM sets ${dmMode}`);
  }
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

/** "Con +5, Wis +3" -> { con: 5, wis: 3 }. Unreadable parts are skipped. */
function parseSaveString(s: string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const part of s.split(",")) {
    const m = part.trim().match(/^(\w+)\s+([+-]\d+)$/);
    if (m) result[m[1].toLowerCase()] = Number(m[2]);
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
