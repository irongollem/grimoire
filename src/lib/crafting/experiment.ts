import { ineligibility, rowDisplayName } from "@/lib/crafting/ingredients";
import { spriteForItem, type ResolvedSprite } from "@/lib/crafting/workbench/materialSprite";
import { inventoryItemRef } from "@/lib/itemRef";
import type { Item } from "@/types/item.types";
import type { PartyInventoryItem } from "@/types/inventory.types";

/** What `craft_experiment` answers (#1103): one recipe, a near miss, or nothing, never a list. */
export type ExperimentResult =
  | { result: "match"; recipeId: string; name: string }
  | { result: "near"; hint: "missing" | "extra" }
  | { result: "none" };

/** The most dishes the bench holds; the function refuses more. */
export const EXPERIMENT_MAX_ITEMS = 8;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Reads the function's jsonb. Throws on anything it does not promise, so a changed server shows up loudly. */
export function parseExperimentResult(json: unknown): ExperimentResult {
  if (!isRecord(json)) throw new Error("Unexpected experiment answer");
  if (json.result === "none") return { result: "none" };
  if (json.result === "near") {
    if (json.hint === "missing" || json.hint === "extra") return { result: "near", hint: json.hint };
    throw new Error("Unexpected experiment hint");
  }
  if (json.result === "match") {
    if (typeof json.recipe_id === "string" && typeof json.name === "string") {
      return { result: "match", recipeId: json.recipe_id, name: json.name };
    }
    throw new Error("Unexpected experiment match");
  }
  throw new Error("Unexpected experiment answer");
}

/** The line posted to the campaign chat when a character finds a recipe. */
export function experimentChatMessage(memberName: string, recipeName: string): string {
  return `🔍 **${memberName}** discovered **${recipeName}** by experimenting.`;
}

/** A row laid out on the bench: the inventory row, what to call it and how to draw it. */
export interface ExperimentEntry {
  row: PartyInventoryItem;
  name: string;
  sprite: ResolvedSprite;
}

/** Every row the bench may offer: the same rule a craft spends by (never ruined, equipped or a container). */
export function experimentPack(rows: readonly PartyInventoryItem[]): PartyInventoryItem[] {
  // A name-only row ("Smith's Tools") has no item and no tags, so no ingredient can ever match it.
  return rows.filter((r) => ineligibility(r) === null && r.quantity > 0 && inventoryItemRef(r) !== null);
}

/** The entries for the laid-out row ids, in the order laid out; a row that has left the pack drops out. */
export function experimentEntries(
  ids: readonly string[],
  pack: readonly PartyInventoryItem[],
  allItems: readonly Item[],
): ExperimentEntry[] {
  return ids.flatMap((id) => {
    const row = pack.find((r) => r.id === id);
    if (!row) return [];
    const ref = inventoryItemRef(row);
    const item = ref ? (allItems.find((i) => i.id === ref) ?? null) : null;
    return [{ row, name: rowDisplayName(row, allItems), sprite: spriteForItem(item) }];
  });
}
