import { ITEM_RARITY_LABELS, ITEM_TYPE_LABELS, MAGIC_ONLY_ITEM_TYPES } from "@/types/item.types";
import type { Item, ItemType } from "@/types/item.types";
import type { InventorySlot } from "@/types/inventory.types";

/**
 * The type a player is allowed to see. An unidentified magic item reads as a
 * mundane stand-in (a potion as a provision, any other magic-only type as an art
 * object) so the type line cannot give the item away. Shared by the stat block
 * and the panel's one-line summary so the two can never disagree about it.
 */
export function visibleTypeLabel(item: Item | null, isIdentified: boolean): string | null {
  if (!item) return !isIdentified ? ITEM_TYPE_LABELS.art_object : null;
  const shouldMask = !isIdentified && item.rarity !== "mundane";
  if (shouldMask && item.item_type === "potion") return ITEM_TYPE_LABELS.provision;
  if (shouldMask && MAGIC_ONLY_ITEM_TYPES.has(item.item_type)) return ITEM_TYPE_LABELS.art_object;
  return ITEM_TYPE_LABELS[item.item_type];
}

/** "Very rare wondrous item", or just "Weapon" for a mundane one. Masked like the stat block. */
export function itemSummaryLine(item: Item | null, isIdentified: boolean): string | null {
  const type = visibleTypeLabel(item, isIdentified)?.toLowerCase() ?? null;
  if (!type) return null;
  const rarity = item && isIdentified && item.rarity !== "mundane" ? ITEM_RARITY_LABELS[item.rarity] : null;
  const line = rarity ? `${rarity} ${type}` : type;
  return line.charAt(0).toUpperCase() + line.slice(1).toLowerCase();
}

export const SLOT_LABELS: Record<InventorySlot, string> = {
  head: "Head",
  neck: "Neck",
  shoulders: "Shoulders",
  body: "Body",
  clothes: "Clothes",
  hands: "Hands",
  ring: "Ring",
  waist: "Waist",
  feet: "Feet",
  main_hand: "Main hand",
  off_hand: "Off hand",
  other: "Other",
};

export interface EquipOption {
  slot: InventorySlot;
  label: string;
  /** False when something already sits there: equipping would silently do nothing. */
  free: boolean;
}

// Wondrous kit with no dedicated slot goes in "other", as the paper doll does.
const OTHER_SLOT_TYPES: ReadonlySet<ItemType> = new Set<ItemType>([
  "wondrous_item", "staff", "rod", "wand", "tool", "gear",
]);

/** Slots that only accept an item when `fitsTagSlot` (candidatesForSlot) says it belongs there. */
const TAG_SLOTS = ["clothes", "neck", "hands", "feet", "head", "shoulders", "waist"] as const satisfies readonly InventorySlot[];

/**
 * Where this item can be equipped, in the order to offer them. Armor goes on the
 * body, a shield in the off hand, a weapon in either hand, a ring on the ring slot;
 * anything else only where its tags place it (`fitsTagSlot` is `candidatesForSlot`
 * from `useInventorySlots`), else "other" for wondrous kit. Returns [] for
 * something that cannot be worn at all (a potion, rations).
 */
export function equipSlotOptions(
  item: Item | null,
  isOccupied: (slot: InventorySlot) => boolean,
  fitsTagSlot: (slot: InventorySlot) => boolean,
): EquipOption[] {
  if (!item) return [];
  let slots: InventorySlot[];
  switch (item.item_type) {
    case "armor": slots = ["body"]; break;
    case "shield": slots = ["off_hand"]; break;
    case "weapon": slots = ["main_hand", "off_hand"]; break;
    case "ring": slots = ["ring"]; break;
    default: {
      slots = TAG_SLOTS.filter((s) => fitsTagSlot(s));
      if (slots.length === 0 && OTHER_SLOT_TYPES.has(item.item_type)) slots = ["other"];
    }
  }
  return slots.map((slot) => ({ slot, label: SLOT_LABELS[slot], free: !isOccupied(slot) }));
}
