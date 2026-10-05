/**
 * Which paper-doll slot a library item is worn in, read from its name.
 *
 * Open5e files every worn wondrous item as "Wondrous Item" with no tags, so the
 * doll's slot matcher (useInventorySlots) never found a cloak, a pair of boots
 * or a belt. The names say it plainly ("Cloak of Protection", "Boots of
 * Speed"), so the seed tags them from the name and the doll reads the tag.
 *
 * The tag is the slot id itself ("neck", "shoulders"...), so a tag means
 * exactly one doll slot. Rings and body armour are already covered by their
 * item_type and are not tagged here.
 *
 * `slotTagPatterns()` is the one list both this module and the SQL that tags
 * rows already in the database are built from.
 */
import type { InventorySlot } from "@/types/inventory.types";

export type WornSlotTag = Extract<
  InventorySlot,
  "neck" | "shoulders" | "feet" | "hands" | "waist" | "head" | "clothes"
>;

/** Whole words (or word starts via an explicit plural), matched case-insensitively. */
const SLOT_TERMS: Record<WornSlotTag, readonly string[]> = {
  neck: ["amulets?", "necklaces?", "periapts?", "medallions?", "pendants?", "talismans?", "scarabs?", "brooch(?:es)?"],
  shoulders: ["cloaks?", "capes?", "mantles?", "wings of flying"],
  feet: ["boots", "slippers?"],
  hands: ["gloves", "gauntlets", "bracers"],
  waist: ["belts?", "girdles?"],
  head: ["helms?", "hats?", "circlets?", "headbands?", "crowns?", "diadems?", "goggles", "eyes of", "lenses"],
  clothes: ["robes?", "vestments?", "clothes"],
} as const;

/** Only these kinds of item are worn by name; a "Belt Pouch" weapon or a "Boots" potion label never is. */
const WORN_BY_NAME_TYPES: ReadonlySet<string> = new Set(["wondrous_item", "gear"]);

export const SLOT_TAG_ORDER = Object.keys(SLOT_TERMS) as WornSlotTag[];

/** The slot terms as one alternation per slot, for building the SQL twin. */
export function slotTagPatterns(): Record<WornSlotTag, string> {
  const out = {} as Record<WornSlotTag, string>;
  for (const slot of SLOT_TAG_ORDER) out[slot] = `(${SLOT_TERMS[slot].join("|")})`;
  return out;
}

const COMPILED = SLOT_TAG_ORDER.map((slot) => ({
  slot,
  re: new RegExp(`\\b${slotTagPatterns()[slot]}\\b`, "i"),
}));

/** Slot tags for an item, by name and type. Empty for anything not worn by name. */
export function deriveSlotTags(name: string, itemType: string): WornSlotTag[] {
  if (!WORN_BY_NAME_TYPES.has(itemType)) return [];
  return COMPILED.filter(({ re }) => re.test(name)).map(({ slot }) => slot);
}

/** Adds the derived slot tags to an existing tag list, keeping the order and never duplicating. */
export function withSlotTags(tags: readonly string[], name: string, itemType: string): string[] {
  const out = [...tags];
  for (const slot of deriveSlotTags(name, itemType)) if (!out.includes(slot)) out.push(slot);
  return out;
}
