import type { Item } from "@/types/item.types";

/** Ammunition categories a ranged weapon can draw from. */
export const AMMO_TAGS = ["arrow", "bolt", "bullet", "needle", "dart", "firearm-bullet"] as const;
export type AmmoTag = (typeof AMMO_TAGS)[number];

/**
 * Maps a weapon to the ammunition tag it consumes, or `null` when it needs no
 * external ammo (melee weapons, or self-charged weapons handled via `charges`).
 * Prefers explicit tags, then subtype, then falls back to the weapon's name.
 */
export function weaponAmmoTag(item: Pick<Item, "name" | "subtype" | "tags">): AmmoTag | null {
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
  return null;
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
