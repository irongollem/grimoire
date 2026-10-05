import type { PartyInventoryItem } from "@/types/inventory.types";
import type { Item } from "@/types/item.types";
import { inventoryItemRef } from "@/lib/itemRef";

/** Standard SRD shield bonus, used when a shield item has no parseable armor_class. */
const DEFAULT_SHIELD_BONUS = 2;

/**
 * Parse the numeric AC bonus from a shield's armor_class string.
 * Accepts "2", "+2", "+ 2", "3 (magic)" — the first signed integer wins.
 */
export function parseShieldAcBonus(armorClass: string | null | undefined): number {
  if (!armorClass) return DEFAULT_SHIELD_BONUS;
  const match = armorClass.match(/[+-]?\s*\d+/);
  if (!match) return DEFAULT_SHIELD_BONUS;
  return parseInt(match[0].replace(/\s+/g, ""), 10);
}

/**
 * AC bonus from equipped shields, summed per party member id.
 * Counts inventory rows that are equipped, carried by a member, resolve to a
 * vault item of type "shield", and are not ruined.
 */
export function shieldAcBonusByMember(
  inventory: PartyInventoryItem[],
  items: Item[],
): Record<string, number> {
  const itemById = new Map(items.map((i) => [i.id, i]));
  const result: Record<string, number> = {};
  for (const inv of inventory) {
    // `inventoryItemRef`, not `item_id`: gear picked from the shared library is
    // referenced by `library_item_id` and never counted otherwise (#956).
    const ref = inventoryItemRef(inv);
    if (inv.location !== "equipped" || !inv.carried_by || !ref || inv.is_ruined) continue;
    const item = itemById.get(ref);
    if (!item || item.item_type !== "shield") continue;
    result[inv.carried_by] = (result[inv.carried_by] ?? 0) + parseShieldAcBonus(item.armor_class);
  }
  return result;
}
