// Objects (Dungeon Master's Guide, "Objects" / "Breaking Objects"). Both
// editions share the table: AC by what the object is made of, hit points by
// its size and whether it is fragile or resilient. Anything bigger than Large
// is several Large-or-smaller sections, each with its own hit points.
//
// Every object is immune to poison and psychic damage; that is a rule, so it
// is a constant here rather than a column a DM could forget to tick.

export const OBJECT_MATERIALS = ["cloth", "crystal", "wood", "stone", "iron", "mithral", "adamantine"] as const;
export type ObjectMaterial = (typeof OBJECT_MATERIALS)[number];

export const OBJECT_SIZES = ["tiny", "small", "medium", "large"] as const;
export type ObjectSize = (typeof OBJECT_SIZES)[number];

/** How the book names each material row, for pickers and the sheet. */
export const OBJECT_MATERIAL_LABELS: Record<ObjectMaterial, string> = {
  cloth: "Cloth, paper, rope",
  crystal: "Crystal, glass, ice",
  wood: "Wood, bone",
  stone: "Stone",
  iron: "Iron, steel",
  mithral: "Mithral",
  adamantine: "Adamantine",
};

export const OBJECT_SIZE_LABELS: Record<ObjectSize, string> = {
  tiny: "Tiny",
  small: "Small",
  medium: "Medium",
  large: "Large",
};

const MATERIAL_AC: Record<ObjectMaterial, number> = {
  cloth: 11,
  crystal: 13,
  wood: 15,
  stone: 17,
  iron: 19,
  mithral: 21,
  adamantine: 23,
};

const SIZE_HP: Record<ObjectSize, { fragile: number; resilient: number }> = {
  tiny: { fragile: 2, resilient: 5 },
  small: { fragile: 3, resilient: 10 },
  medium: { fragile: 4, resilient: 18 },
  large: { fragile: 5, resilient: 27 },
};

export const OBJECT_DAMAGE_IMMUNITIES = ["poison", "psychic"] as const;

/** The book's AC for an object of this material. */
export function objectArmorClass(material: ObjectMaterial): number {
  return MATERIAL_AC[material];
}

/** The book's average hit points for an object of this size. */
export function objectHitPoints(size: ObjectSize, build: "fragile" | "resilient"): number {
  return SIZE_HP[size][build];
}
