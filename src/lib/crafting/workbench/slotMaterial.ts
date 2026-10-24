import { spriteForItem, spriteForTags, type ResolvedSprite } from "@/lib/crafting/workbench/materialSprite";
import { planConsumption, type IngredientSlot, type SlotCandidate } from "@/lib/crafting/ingredients";
import type { CraftingAttemptResult } from "@/types/crafting.types";
import type { Item } from "@/types/item.types";

/** What a dish says about itself: before the roll by what the player holds, after it by what happened. */
export type SlotState = "ready" | "missing" | "short" | "spent" | "ruined";

/** The row that will be used first for a slot: the player's choice, else the largest eligible stack. */
export function firstUsed(slot: IngredientSlot, preferredId: string | undefined): SlotCandidate | null {
  const eligible = slot.candidates.filter((c) => c.reason === null);
  return eligible.find((c) => c.inv.id === preferredId) ?? eligible[0] ?? null;
}

/**
 * The sprite a slot is drawn with: the item used first; when nothing is held, the slot's
 * tags (a tag slot) or the referenced item (an item slot); else the neutral bundle.
 */
export function slotSprite(
  slot: IngredientSlot,
  preferredId: string | undefined,
  allItems: readonly Item[],
): ResolvedSprite {
  const used = firstUsed(slot, preferredId);
  if (used) return spriteForItem(used.item);
  if (slot.tags) {
    const byTags = spriteForTags(slot.tags);
    if (byTags) return byTags;
  }
  return spriteForItem(slot.ref ? (allItems.find((i) => i.id === slot.ref) ?? null) : null);
}

export function slotState(slot: IngredientSlot, outcome: CraftingAttemptResult["outcome"] | null): SlotState {
  // A success spends every ingredient; a critical failure ruins the primary one and leaves the
  // rest; a plain failure uses nothing up, so its slots read as they did before the roll.
  if (outcome === "success") return "spent";
  if (outcome === "ruin" && slot.index === 0) return "ruined";
  if (slot.met) return "ready";
  return slot.available > 0 ? "short" : "missing";
}

/** How a spent material leaves the bench: lifted into the work, or charred and cracked apart. */
export type MaterialExit = "made" | "destroyed";

/** How this slot's material leaves the bench, or null when it stays in its dish. */
export function exitForSlot(slot: IngredientSlot, outcome: CraftingAttemptResult["outcome"] | null): MaterialExit | null {
  if (outcome === "success") return "made";
  if (outcome === "ruin" && slot.index === 0) return "destroyed";
  return null;
}

export const SLOT_STATE_WORD: Record<SlotState, string> = {
  ready: "Ready",
  missing: "Missing",
  short: "Short",
  spent: "Spent",
  ruined: "Ruined",
};

export interface LostMaterial {
  name: string;
  qty: number;
  sprite: ResolvedSprite;
}

/**
 * What a critical failure actually spent, by name: the primary's consumption plan mapped back to the rows it
 * names, with each row's sprite. Pass the slots the attempt was made with (the frozen ones),
 * since the spent rows have left the inventory by the time anyone asks.
 */
export function lostMaterials(
  slots: readonly IngredientSlot[],
  preferred: Readonly<Record<number, string>>,
  outcome: CraftingAttemptResult["outcome"],
): LostMaterial[] {
  // Only a critical failure loses anything, and only the primary ingredient: a success makes
  // the item (not a loss) and a plain failure keeps everything.
  if (outcome !== "ruin") return [];
  const byId = new Map<string, SlotCandidate>();
  for (const s of slots) for (const c of s.candidates) if (!byId.has(c.inv.id)) byId.set(c.inv.id, c);
  const merged = new Map<string, LostMaterial>();
  for (const { id, qty } of planConsumption(slots, preferred).primaryConsumption) {
    const c = byId.get(id);
    if (!c) continue;
    const seen = merged.get(c.inv.name);
    if (seen) seen.qty += qty;
    else merged.set(c.inv.name, { name: c.inv.name, qty, sprite: spriteForItem(c.item) });
  }
  return [...merged.values()];
}
