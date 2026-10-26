import type { ItemQuality } from "@/types/inventory.types";

/**
 * Item quality (#1102): a trait of an inventory ROW, not of the item, so two stacks of one item
 * can differ. Worst to best. `ruined` replaced the old boolean flag and can never be spent.
 */
export const ITEM_QUALITIES: readonly ItemQuality[] = ["ruined", "poor", "standard", "fine", "masterwork"];

export const QUALITY_LABELS: Record<ItemQuality, string> = {
  ruined: "Ruined",
  poor: "Poor",
  standard: "Standard",
  fine: "Fine",
  masterwork: "Masterwork",
};

/** The crafting roll modifier per step. Ruined has none: such a row never reaches a roll. */
export const QUALITY_MODIFIER: Record<ItemQuality, number | null> = {
  ruined: null,
  poor: -2,
  standard: 0,
  fine: 1,
  masterwork: 2,
};

/** One step down, ruined staying ruined. Mirrors `private.quality_step_down` in the database. */
export function qualityStepDown(q: ItemQuality): ItemQuality {
  switch (q) {
    case "masterwork":
      return "fine";
    case "fine":
      return "standard";
    case "standard":
      return "poor";
    default:
      return "ruined";
  }
}

export function isRuined(row: { quality: ItemQuality }): boolean {
  return row.quality === "ruined";
}

/**
 * The roll modifier a set of ingredient rows contributes: the unit-weighted average of their
 * modifiers, rounded toward the worse. An empty list is 0. A ruined row can never be in a plan,
 * so one reaching here is a bug and throws.
 */
export function ingredientQualityModifier(rows: { quality: ItemQuality; qty: number }[]): number {
  let total = 0;
  let units = 0;
  for (const row of rows) {
    const mod = QUALITY_MODIFIER[row.quality];
    if (mod === null) throw new Error("A ruined ingredient can never be part of a craft");
    total += mod * row.qty;
    units += row.qty;
  }
  if (units === 0) return 0;
  return Math.floor(total / units);
}
