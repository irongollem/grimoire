import { inventoryItemRef } from "@/lib/itemRef";
import type { CraftingAttemptResult, CraftingOutput } from "@/types/crafting.types";

type Outcome = CraftingAttemptResult["outcome"];

export function outcomeLabel(outcome: Outcome): string {
  if (outcome === "success") return "Success!";
  if (outcome === "ruin") return "Critical Failure: Item Ruined";
  return "Failure";
}

export function outcomeDetail(outcome: Outcome, outputNames: readonly string[], fine = false): string {
  if (outcome === "success") return `${outputNames.join(", ")} added to your backpack${fine ? ", and it came out Fine" : ""}.`;
  if (outcome === "ruin") {
    return "The primary ingredient was ruined and returned to your inventory as wreckage. Your other ingredients are untouched.";
  }
  return "The attempt failed. The time is lost and your primary ingredient is a step worse.";
}

/** Display names of what a recipe makes ("2× Healing Potion"); "item" is label text, not data. */
export function outputDisplayNames(
  outputs: readonly CraftingOutput[],
  resolveName: (ref: string) => string | undefined,
): string[] {
  return outputs.map((o) => {
    const ref = inventoryItemRef(o);
    const name = (ref ? resolveName(ref) : undefined) ?? "item";
    return o.quantity > 1 ? `${o.quantity}× ${name}` : name;
  });
}

export interface CraftMessageInput {
  memberName: string;
  recipeName: string;
  dc: number;
  result: Pick<CraftingAttemptResult, "roll" | "roll2" | "total" | "outcome" | "hasDisadvantage">;
  abilityMod: number;
  /** Already upper-cased, e.g. "INT". */
  abilityLabel: string;
  hasProficiency: boolean;
  profBonus: number;
  modifierBonuses: readonly number[];
  outputNames: readonly string[];
  /** The roll beat the DC by FINE_RESULT_MARGIN, so the outputs are Fine. */
  fine?: boolean;
}

/** The line posted to the campaign chat after a craft. */
export function craftChatMessage(i: CraftMessageInput): string {
  const res = i.result;
  const modSum = i.modifierBonuses.reduce((a, b) => a + b, 0);
  let msg = `🔨 **${i.memberName}** attempted to craft **${i.recipeName}** (DC ${i.dc})`;
  msg += `\nRoll: ${res.roll}${res.hasDisadvantage && res.roll2 !== undefined ? ` (disadvantage: also rolled ${Math.max(res.roll, res.roll2)})` : ""} + ${i.abilityMod} (${i.abilityLabel})`;
  if (i.hasProficiency) msg += ` + ${i.profBonus} (prof)`;
  else msg += ` (no proficiency)`;
  if (modSum !== 0) msg += ` ${modSum >= 0 ? "+" : ""}${modSum} (modifiers)`;
  msg += ` = **${res.total}** vs DC ${i.dc}`;
  if (res.outcome === "success") msg += `\n✅ **Success!** ${i.outputNames.join(", ")} crafted${i.fine ? ", and it came out Fine" : ""}.`;
  else if (res.outcome === "ruin") msg += `\n💀 **Critical failure!** Primary ingredient ruined; the rest kept.`;
  else msg += `\n❌ **Failed.** Time lost; the primary ingredient is a step worse.`;
  return msg;
}

/** "+ 3" / "- 1": a modifier as it reads after a die. */
export const signed = (n: number) => (n >= 0 ? `+ ${n}` : `- ${Math.abs(n)}`);

/** The roll's whole modifier: ability, proficiency only when held, and every ticked bonus. */
export function craftBonus(
  abilityMod: number,
  profBonus: number,
  hasProficiency: boolean,
  modifierBonuses: readonly number[],
): number {
  return abilityMod + (hasProficiency ? profBonus : 0) + modifierBonuses.reduce((a, b) => a + b, 0);
}

/** "Rolled 14 + 3 = 17 against DC 15", with the disadvantage pair when two dice were thrown. */
export function rolledLine(
  result: Pick<CraftingAttemptResult, "roll" | "roll2" | "total" | "hasDisadvantage">,
  bonus: number,
  dc: number,
): string {
  const dice =
    result.hasDisadvantage && result.roll2 !== undefined
      ? `Rolled ${Math.max(result.roll, result.roll2)} and ${Math.min(result.roll, result.roll2)}, took ${result.roll}`
      : `Rolled ${result.roll}`;
  return `${dice} ${signed(bonus)} = ${result.total} against DC ${dc}`;
}
