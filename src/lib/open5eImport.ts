import type { ItemInsert, ItemType, ItemRarity, WeaponProperty } from "@/types/item.types";
import { WEAPON_PROPERTIES } from "@/types/item.types";

// ── open5e v1 API shapes ───────────────────────────────────────────────────────

interface Open5eWeapon {
  slug: string;
  name: string;
  category: string;          // e.g. "Martial Melee Weapons"
  cost: string;              // e.g. "25 gp" (already formatted)
  damage_dice: string;       // e.g. "1d8"
  damage_type: string;       // e.g. "slashing"
  weight: string;            // e.g. "8 lb." (already formatted)
  properties: string[];      // e.g. ["two-handed", "heavy"]
  range?: string;            // e.g. "(80/320 ft.)" for ranged weapons
  versatile?: string;        // e.g. "1d10" two-handed damage for versatile weapons
  document__slug: string;
  document__title: string;
  document__url: string;
}

interface Open5eArmor {
  slug: string;
  name: string;
  category: string;          // e.g. "Medium Armor", "Shields"
  base_ac: number;
  plus_dex_mod: boolean;
  plus_max: number | null;
  ac_string: string;         // e.g. "14 + Dex modifier (max 2)" (already formatted)
  strength_requirement: number | null;
  cost: string;
  weight: string;
  stealth_disadvantage: boolean;
  document__slug: string;
  document__title: string;
  document__url: string;
}

interface Open5eMagicItem {
  slug: string;
  name: string;
  type: string;              // e.g. "Wondrous Item", "Armor (plate)"
  rarity: string;            // e.g. "rare", "very rare"
  requires_attunement: string; // "" or "requires attunement by..."
  desc: string;
  document__slug: string;
  document__title: string;
  document__url: string;
}

import { fetchAll } from "@/lib/open5eApi";

// ── Helpers ───────────────────────────────────────────────────────────────────

function armorItemType(category: string): ItemType {
  const c = category.toLowerCase();
  if (c.includes("shield")) return "shield";
  return "armor";
}

function magicItemType(type: string): ItemType {
  const t = type.toLowerCase();
  if (t.startsWith("armor")) return "armor";
  if (t.startsWith("weapon")) return "weapon";
  if (t === "wondrous item") return "wondrous_item";
  if (t === "ring") return "ring";
  if (t === "rod") return "rod";
  if (t === "staff") return "staff";
  if (t === "wand") return "wand";
  if (t === "potion") return "potion";
  if (t === "scroll") return "scroll";
  return "wondrous_item";
}

function mapRarity(raw: string): ItemRarity {
  const r = raw.toLowerCase().trim();
  if (r === "very rare") return "very_rare";
  const valid: ItemRarity[] = ["mundane", "common", "uncommon", "rare", "very_rare", "legendary", "artifact"];
  return valid.includes(r as ItemRarity) ? (r as ItemRarity) : "common";
}

function filterProperties(props: string[] | null | undefined): WeaponProperty[] {
  if (!props) return [];
  const valid = new Set<string>(WEAPON_PROPERTIES);
  return props
    .map((p) => p.toLowerCase().split(" ")[0]) // "two-handed" → keep, "double-headed (1d4)" → "double-headed"
    .filter((n) => valid.has(n)) as WeaponProperty[];
}

// ── Mappers ───────────────────────────────────────────────────────────────────

function weaponTags(category: string): string[] {
  const c = category.toLowerCase();
  if (c.includes("firearm") || c.includes("renaissance") || c.includes("modern") || c.includes("futuristic")) {
    return ["firearm", "black powder", "ranged"];
  }
  return [];
}

function mapWeapon(item: Open5eWeapon): ItemInsert {
  return {
    name: item.name,
    item_type: "weapon",
    subtype: item.category,
    rarity: "mundane",
    requires_attunement: false,
    attunement_requirements: null,
    weight: item.weight ? parseFloat(item.weight) || null : null,
    cost: item.cost || null,
    damage_rolls: item.damage_dice
      ? [{ dice: item.damage_dice, type: item.damage_type }]
      : null,
    armor_class: null,
    properties: filterProperties(item.properties),
    charges: null,
    recharge: null,
    spell_ids: [],
    weapon_range: item.range?.trim() || null,
    versatile_damage: item.versatile?.trim() || null,
    description: "",
    source: item.document__slug || "srd",
    source_title: item.document__title || null,
    source_url: item.document__url || null,
    tags: weaponTags(item.category),
    image_url: null,
    curse_description: null,
    curse_revealed: false,
    is_arcane_focus: false,
  };
}

function mapArmor(item: Open5eArmor): ItemInsert {
  return {
    name: item.name,
    item_type: armorItemType(item.category),
    subtype: item.category,
    rarity: "mundane",
    requires_attunement: false,
    attunement_requirements: null,
    weight: item.weight ? parseFloat(item.weight) || null : null,
    cost: item.cost || null,
    damage_rolls: null,
    armor_class: item.ac_string || null,
    properties: [],
    charges: null,
    recharge: null,
    spell_ids: [],
    description: "",
    source: item.document__slug || "srd",
    source_title: item.document__title || null,
    source_url: item.document__url || null,
    tags: [],
    image_url: null,
    curse_description: null,
    curse_revealed: false,
    is_arcane_focus: false,
  };
}

function mapMagicItem(item: Open5eMagicItem): ItemInsert {
  const attunementStr = item.requires_attunement?.trim() ?? "";
  return {
    name: item.name,
    item_type: magicItemType(item.type),
    subtype: item.type,
    rarity: mapRarity(item.rarity),
    requires_attunement: attunementStr.length > 0,
    attunement_requirements: attunementStr.length > 0 ? attunementStr : null,
    weight: null,
    cost: null,
    damage_rolls: null,
    armor_class: null,
    properties: [],
    charges: null,
    recharge: null,
    spell_ids: [],
    description: item.desc,
    source: item.document__slug || "srd",
    source_title: item.document__title || null,
    source_url: item.document__url || null,
    tags: [],
    image_url: null,
    curse_description: null,
    curse_revealed: false,
    is_arcane_focus: false,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function fetchSrdItems(): Promise<ItemInsert[]> {
  const [weapons, armor, magic] = await Promise.all([
    fetchAll<Open5eWeapon>("https://api.open5e.com/v1/weapons/"),
    fetchAll<Open5eArmor>("https://api.open5e.com/v1/armor/"),
    fetchAll<Open5eMagicItem>("https://api.open5e.com/v1/magicitems/"),
  ]);

  const mapped: ItemInsert[] = [
    ...weapons.map(mapWeapon),
    ...armor.map(mapArmor),
    ...magic.map(mapMagicItem),
  ];

  // Deduplicate by name (keep first occurrence)
  const seen = new Set<string>();
  return mapped.filter((item) => {
    if (seen.has(item.name)) return false;
    seen.add(item.name);
    return true;
  });
}
