import { fetchAll } from "@/lib/open5eApi";
import type { ItemInsert, ItemType, ItemRarity, WeaponProperty } from "@/types/item.types";
import type { RulesetKey } from "@/types/ruleset.types";
import { WEAPON_PROPERTIES } from "@/types/item.types";

interface DocumentRef {
  key: string;
  name: string;
  display_name?: string;
  permalink?: string | null;
  publisher?: { name: string; key: string };
  gamesystem?: { name: string; key: string };
}

interface Open5eV2Weapon {
  key: string;
  name: string;
  document: DocumentRef;
  properties: Array<{ property: { name: string; type?: string | null }; detail: string | null }>;
  damage_type: { name: string; key: string } | null;
  damage_dice: string;
  range: number;
  long_range: number;
  is_simple: boolean;
  is_improvised: boolean;
}

interface Open5eV2Armor {
  key: string;
  name: string;
  document: DocumentRef;
  ac_display: string;
  category: string;
}

interface Open5eV2MagicItem {
  key: string;
  name: string;
  desc: string;
  category: { name: string; key: string };
  rarity: { name: string; key: string };
  weapon: Open5eV2Weapon | null;
  armor: Open5eV2Armor | null;
  weight: string | null;
  cost: string | null;
  requires_attunement: boolean;
  attunement_detail: string | null;
  document: DocumentRef;
}

function rulesetForDocument(document: DocumentRef): RulesetKey | null {
  if (document.gamesystem?.key === "5e-2024") return "2024";
  if (document.gamesystem?.key === "5e-2014" || document.gamesystem?.key === "5e") return "2014";
  return null;
}

function metadata(record: { key: string; name: string; document: DocumentRef }) {
  return {
    ruleset: rulesetForDocument(record.document),
    conceptual_key: record.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""),
    source_document_key: record.document.key,
    source_record_key: record.key,
    source_revision: record.document.name,
    source_license: null,
    provenance: {
      provider: "open5e-v2",
      document: {
        key: record.document.key,
        publisher: record.document.publisher ?? null,
        gamesystem: record.document.gamesystem ?? null,
        permalink: record.document.permalink ?? null,
      },
    },
  };
}

function mapRarity(raw: string): ItemRarity {
  const value = raw.toLowerCase().trim().replace(/\s+/g, "_");
  const valid: ItemRarity[] = ["mundane", "common", "uncommon", "rare", "very_rare", "legendary", "artifact"];
  return valid.includes(value as ItemRarity) ? value as ItemRarity : "common";
}

function magicItemType(category: string): ItemType {
  const value = category.toLowerCase();
  if (value.includes("armor")) return "armor";
  if (value.includes("weapon")) return "weapon";
  if (value.includes("ring")) return "ring";
  if (value.includes("rod")) return "rod";
  if (value.includes("staff")) return "staff";
  if (value.includes("wand")) return "wand";
  if (value.includes("potion")) return "potion";
  if (value.includes("scroll")) return "scroll";
  return "wondrous_item";
}

function weaponProperties(record: Open5eV2Weapon): WeaponProperty[] {
  const allowed = new Set<string>(WEAPON_PROPERTIES);
  return record.properties.map(entry => entry.property.name.toLowerCase().replace(/\s+/g, "-"))
    .filter(value => allowed.has(value)) as WeaponProperty[];
}

function versatileDamage(record: Open5eV2Weapon): string | null {
  return record.properties.find(entry => entry.property.name.toLowerCase() === "versatile")?.detail ?? null;
}

function baseItem(record: { key: string; name: string; document: DocumentRef }) {
  return {
    ...metadata(record),
    name: record.name,
    source: record.document.key,
    source_title: record.document.display_name || record.document.name,
    source_url: record.document.permalink ?? null,
    tags: [] as string[],
    image_url: null,
    curse_description: null,
    is_arcane_focus: false,
  };
}

export function mapOpen5eV2Weapon(record: Open5eV2Weapon): ItemInsert {
  const ranged = record.range > 0;
  return {
    ...baseItem(record),
    item_type: "weapon",
    subtype: `${record.is_simple ? "Simple" : "Martial"} ${ranged ? "Ranged" : "Melee"} Weapons`,
    rarity: "mundane",
    requires_attunement: false,
    attunement_requirements: null,
    weight: null,
    cost: null,
    damage_rolls: record.damage_dice && record.damage_type
      ? [{ dice: record.damage_dice, type: record.damage_type.name.toLowerCase() }]
      : null,
    armor_class: null,
    properties: weaponProperties(record),
    charges: null,
    recharge: null,
    spell_ids: [],
    weapon_range: ranged ? `${record.range}/${record.long_range} ft.` : null,
    versatile_damage: versatileDamage(record),
    description: "",
  };
}

export function mapOpen5eV2Armor(record: Open5eV2Armor): ItemInsert {
  return {
    ...baseItem(record),
    item_type: record.category.toLowerCase() === "shield" ? "shield" : "armor",
    subtype: record.category,
    rarity: "mundane",
    requires_attunement: false,
    attunement_requirements: null,
    weight: null,
    cost: null,
    damage_rolls: null,
    armor_class: record.ac_display || null,
    properties: [],
    charges: null,
    recharge: null,
    spell_ids: [],
    weapon_range: null,
    versatile_damage: null,
    description: "",
  };
}

export function mapOpen5eV2MagicItem(record: Open5eV2MagicItem): ItemInsert {
  const itemType = record.weapon ? "weapon" : record.armor ? "armor" : magicItemType(record.category.name);
  return {
    ...baseItem(record),
    item_type: itemType,
    subtype: record.category.name,
    rarity: mapRarity(record.rarity.name),
    requires_attunement: record.requires_attunement,
    attunement_requirements: record.attunement_detail?.trim() || null,
    weight: record.weight ? Number(record.weight) : null,
    cost: record.cost || null,
    damage_rolls: record.weapon?.damage_dice && record.weapon.damage_type
      ? [{ dice: record.weapon.damage_dice, type: record.weapon.damage_type.name.toLowerCase() }]
      : null,
    armor_class: record.armor?.ac_display || null,
    properties: record.weapon ? weaponProperties(record.weapon) : [],
    charges: null,
    recharge: null,
    spell_ids: [],
    weapon_range: record.weapon?.range ? `${record.weapon.range}/${record.weapon.long_range} ft.` : null,
    versatile_damage: record.weapon ? versatileDamage(record.weapon) : null,
    description: record.desc,
  };
}

/** All item categories use V2 native keys; no display-name deduplication. */
export async function fetchSrdItems(): Promise<ItemInsert[]> {
  const [weapons, armor, magicItems] = await Promise.all([
    fetchAll<Open5eV2Weapon>("https://api.open5e.com/v2/weapons/"),
    fetchAll<Open5eV2Armor>("https://api.open5e.com/v2/armor/"),
    fetchAll<Open5eV2MagicItem>("https://api.open5e.com/v2/magicitems/"),
  ]);
  return [
    ...weapons.map(mapOpen5eV2Weapon),
    ...armor.map(mapOpen5eV2Armor),
    ...magicItems.map(mapOpen5eV2MagicItem),
  ];
}
