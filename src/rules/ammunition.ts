import type { Item } from "@/types/item.types";

/** Ammunition categories a ranged weapon can draw from. */
export const AMMO_TAGS = ["arrow", "bolt", "bullet", "needle", "dart", "firearm-bullet"] as const;
export type AmmoTag = (typeof AMMO_TAGS)[number];

/**
 * Sentinel tag for a weapon we can positively identify as needing ammo (it
 * carries the "ammunition" property) but whose specific kind we can't infer
 * from tags/subtype/name — e.g. a renamed or homebrew bow. Matches any
 * recognized ammo stack rather than no ammo at all.
 */
export const ANY_AMMO_TAG = "any" as const;
export type WeaponAmmoTag = AmmoTag | typeof ANY_AMMO_TAG;

type AmmoClassifiableItem = Pick<Item, "name" | "subtype" | "tags" | "properties">;

/**
 * Maps a weapon to the ammunition tag it consumes, or `null` when it needs no
 * external ammo (melee weapons, or self-charged weapons handled via `charges`).
 * Prefers explicit tags, then subtype, then the weapon's name, then falls back
 * to the generic `"any"` tag when the "ammunition" property tells us it needs
 * *some* ammo but we can't tell which kind.
 */
export function weaponAmmoTag(item: AmmoClassifiableItem): WeaponAmmoTag | null {
  const explicitTag = AMMO_TAGS.find((t) => item.tags.includes(t));
  if (explicitTag) return explicitTag;
  if (item.tags.includes("firearm")) return "firearm-bullet";
  const sub = (item.subtype ?? "").toLowerCase();
  if (sub.includes("shortbow") || sub.includes("longbow") || (sub.includes("bow") && !sub.includes("crossbow"))) return "arrow";
  if (sub.includes("crossbow")) return "bolt";
  if (sub === "sling") return "bullet";
  if (sub.includes("blowgun")) return "needle";
  if (sub.includes("dart")) return "dart";
  const name = item.name.toLowerCase();
  if (name.includes("longbow") || name.includes("shortbow") || (name.includes("bow") && !name.includes("crossbow"))) return "arrow";
  if (name.includes("crossbow")) return "bolt";
  if (name.includes("sling")) return "bullet";
  if (name.includes("blowgun")) return "needle";
  if (item.properties.includes("ammunition")) return ANY_AMMO_TAG;
  return null;
}

/**
 * True when an item is a ranged weapon — the 5e "ammunition" property, an
 * imported subtype naming a ranged category (e.g. "Martial Ranged Weapons"),
 * or a name/tag/subtype match via `weaponAmmoTag`. Used to gate whether a
 * weapon's `charges` represent ammo (ranged) vs. an unrelated self-charge
 * (a melee weapon like a staff of power, whose charges basic attacks must
 * never burn).
 */
export function isRangedWeaponItem(item: AmmoClassifiableItem): boolean {
  return (
    item.properties.includes("ammunition") ||
    (item.subtype ?? "").toLowerCase().includes("ranged") ||
    weaponAmmoTag(item) !== null
  );
}

/**
 * True when a weapon's `charges` represent its ammo supply (an internal
 * magazine / laser-rifle style ranged weapon) rather than an unrelated
 * self-charge pool. A charged melee weapon (e.g. a staff of power wielded
 * in melee) must return `false` so basic weapon attacks never burn it.
 */
export function weaponUsesChargesAsAmmo(item: AmmoClassifiableItem & Pick<Item, "charges">): boolean {
  return item.charges !== null && isRangedWeaponItem(item);
}

/** Classifies a plain inventory stack (no vault item) by its name into an ammo tag. */
export function ammoTagFromName(name: string): AmmoTag | null {
  const lower = name.toLowerCase();
  if (lower.includes("arrow")) return "arrow";
  if (lower.includes("bolt")) return "bolt";
  if ((lower.includes("bullet") || lower.includes("shot")) && (lower.includes("firearm") || lower.includes("black powder") || lower.includes("pistol") || lower.includes("musket"))) return "firearm-bullet";
  if (lower.includes("bullet")) return "bullet";
  if (lower.includes("needle")) return "needle";
  if (lower.includes("dart")) return "dart";
  return null;
}
