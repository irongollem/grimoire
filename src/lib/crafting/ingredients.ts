import { inventoryItemRef } from "@/lib/itemRef";
import type { CraftingIngredient } from "@/types/crafting.types";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { Item } from "@/types/item.types";

export type Ineligibility = "ruined" | "equipped" | "container";

/**
 * Why a row can never be spent on a craft, or null when it can. Equipped or
 * container rows are never consumed, so crafting can't unequip a weapon or
 * dissolve a container. The "Have" count must use the same rule as consumption:
 * counting an equipped sword towards "Any metal" let an attempt through that
 * then consumed less than the recipe needs.
 */
export function ineligibility(inv: PartyInventoryItem): Ineligibility | null {
  if (inv.is_ruined) return "ruined";
  if (inv.is_equipped) return "equipped";
  if (inv.is_container) return "container";
  return null;
}

export interface SlotCandidate {
  inv: PartyInventoryItem;
  /** The catalogue definition behind the row, when the item list holds it. */
  item: Item | null;
  reason: Ineligibility | null;
}

export type IngredientRequirement = Pick<
  CraftingIngredient,
  "item_id" | "library_item_id" | "tags" | "quantity"
>;

export interface IngredientSlot {
  index: number;
  requirement: IngredientRequirement;
  /** The resolved reference (either column); null for a tag-based slot. */
  ref: string | null;
  tags: string[] | null;
  name: string;
  needed: number;
  /** Sum of the ELIGIBLE matching rows. */
  available: number;
  met: boolean;
  /** Every matching row: eligible first (largest stack first), then the rest. */
  candidates: SlotCandidate[];
}

export function resolveItemName(
  ref: string,
  allItems: readonly Item[],
  itemNameMap?: ReadonlyMap<string, string>,
): string | undefined {
  return allItems.find((i) => i.id === ref)?.name ?? itemNameMap?.get(ref);
}

function tagLabel(tags: readonly string[]): string {
  return tags.length === 1 ? `Any "${tags[0]}"` : `Any [${tags.join(" + ")}]`;
}

/** Match each required ingredient to the inventory rows that could fill it. */
export function buildIngredientSlots(
  reqs: readonly IngredientRequirement[],
  inventory: readonly PartyInventoryItem[],
  allItems: readonly Item[],
  itemNameMap?: ReadonlyMap<string, string>,
): IngredientSlot[] {
  return reqs.map((req, index) => {
    const ref = inventoryItemRef(req);
    // A requirement with neither a reference nor tags matches nothing.
    const tags = ref ? null : req.tags;
    const matches = (inv: PartyInventoryItem, def: Item | null): boolean => {
      if (ref) return inventoryItemRef(inv) === ref;
      if (!tags) return false;
      // Tag-based: any inventory item whose catalogue item has ALL required tags.
      return tags.every((t) => def?.tags?.includes(t) ?? false);
    };

    const candidates: SlotCandidate[] = [];
    for (const inv of inventory) {
      const invRef = inventoryItemRef(inv);
      const def = invRef ? (allItems.find((i) => i.id === invRef) ?? null) : null;
      if (matches(inv, def)) candidates.push({ inv, item: def, reason: ineligibility(inv) });
    }
    // Eligible rows first; within each group the biggest stack first.
    candidates.sort((a, b) => {
      if ((a.reason === null) !== (b.reason === null)) return a.reason === null ? -1 : 1;
      return b.inv.quantity - a.inv.quantity;
    });

    const name = ref
      ? (resolveItemName(ref, allItems, itemNameMap) ?? "Unknown item")
      : tags
        ? tagLabel(tags)
        : "Unknown item";
    const available = candidates
      .filter((c) => c.reason === null)
      .reduce((sum, c) => sum + c.inv.quantity, 0);

    return {
      index,
      requirement: req,
      ref,
      tags,
      name,
      needed: req.quantity,
      available,
      met: available >= req.quantity,
      candidates,
    };
  });
}

export interface ConsumptionPlan {
  consumption: { id: string; qty: number }[];
  /** The first row taken overall; null when nothing is consumed, so there is no
   *  item for a failed attempt to ruin. */
  primary: PartyInventoryItem | null;
  /**
   * Exactly what slot 0 (the primary ingredient) takes, in the same shape as
   * `consumption`. A critical failure spends only this; a success spends all of
   * `consumption`; a plain failure spends nothing.
   */
  primaryConsumption: { id: string; qty: number }[];
  /** True when some slot could not be filled in full. */
  short: boolean;
}

/**
 * How much of which rows to consume. Each slot takes only the recipe's
 * required quantity (not the whole stack), so crafting can't wipe a 20-stack to
 * use 2. The row the player chose goes first, then the largest stacks. What is
 * already taken is tracked across slots, so two slots matching one row never
 * take more than it holds.
 */
export function planConsumption(
  slots: readonly IngredientSlot[],
  preferred: Readonly<Record<number, string>> = {},
): ConsumptionPlan {
  const taken = new Map<string, number>();
  const order: string[] = [];
  let primary: PartyInventoryItem | null = null;
  let short = false;
  const primaryTaken = new Map<string, number>();

  for (const slot of slots) {
    const eligible = slot.candidates.filter((c) => c.reason === null);
    const chosen = eligible.find((c) => c.inv.id === preferred[slot.index]);
    const ordered = chosen ? [chosen, ...eligible.filter((c) => c !== chosen)] : eligible;

    let remaining = slot.needed;
    for (const c of ordered) {
      if (remaining <= 0) break;
      const free = c.inv.quantity - (taken.get(c.inv.id) ?? 0);
      const take = Math.min(remaining, free);
      if (take <= 0) continue;
      if (!taken.has(c.inv.id)) order.push(c.inv.id);
      taken.set(c.inv.id, (taken.get(c.inv.id) ?? 0) + take);
      if (slot.index === 0) primaryTaken.set(c.inv.id, (primaryTaken.get(c.inv.id) ?? 0) + take);
      if (!primary) primary = c.inv;
      remaining -= take;
    }
    if (remaining > 0) short = true;
  }

  return {
    consumption: order.map((id) => ({ id, qty: taken.get(id) ?? 0 })),
    primary,
    primaryConsumption: [...primaryTaken].map(([id, qty]) => ({ id, qty })),
    short,
  };
}
