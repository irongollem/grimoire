import type { Item } from "@/types/item.types";

/**
 * Names treated as thrown weapons when the inventory row has no vault item to
 * read `properties` from (Javelin/Spear/etc. are commonly seeded as item-less
 * custom stacks). When a vault item IS present its `properties` is authoritative
 * and this list is not consulted.
 */
const THROWN_WEAPON_NAMES = [
  "javelin", "spear", "dagger", "handaxe", "light hammer", "throwing hammer", "trident", "net", "dart",
] as const;

/**
 * Whether an equipped weapon can be thrown. Trusts a vault item's `thrown`
 * property when we have one; falls back to the weapon's name for item-less
 * custom stacks (mirroring how `weaponAmmoTag` name-matches ammunition).
 */
export function isThrownWeapon(name: string, item: Pick<Item, "properties"> | null): boolean {
  if (item) return item.properties.includes("thrown");
  const lower = name.toLowerCase();
  return THROWN_WEAPON_NAMES.some((n) => lower.includes(n));
}
