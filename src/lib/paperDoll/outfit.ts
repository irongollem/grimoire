import type { DollOutfit } from "@edge-shared/paperDoll/types.ts";
import { armorOfItem, type WornGear } from "@/rules/armorClass";

// Robes are told apart by name, not a field: library items carry a slot tag
// but no "kind of clothing" (see lib/library/slotTags.ts, same approach).
const ROBES = /\b(robes?|vestments?)\b/i;

const inSlot = (gear: WornGear[], slot: WornGear["slot"]) => gear.filter((g) => g.slot === slot);

/**
 * Choose the first recognized body armor's outfit, otherwise robes or clothes
 * from the clothes slot. With neither armor nor clothes, show underclothes.
 */
export function dollOutfitFor(gear: WornGear[]): DollOutfit {
  for (const g of inSlot(gear, "body")) {
    const armour = armorOfItem(g.item);
    if (!armour) continue;
    if (armour.dex === "full") return "armour_light";
    if (armour.dex === "capped") return "armour_medium";
    return "armour_heavy";
  }
  const clothes = inSlot(gear, "clothes");
  if (clothes.length === 0) return "underclothes";
  return clothes.some((g) => ROBES.test(g.item.name)) ? "robes" : "clothes";
}
