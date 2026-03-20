import type { Component } from "vue";
import {
  FlaskConical,
  Hammer,
  Scissors,
  Axe,
  Gem,
  Leaf,
  Skull,
  Wrench,
  UtensilsCrossed,
  Feather,
} from "lucide-vue-next";
import type { CraftingDiscipline } from "@/types/crafting.types";
import type { SaveKey } from "@/types/party.types";

export interface DisciplineConfig {
  id: CraftingDiscipline;
  label: string;
  icon: Component;
  tool: string;          // must match item name in inventory for tool check
  ability: SaveKey;      // primary ability for the crafting roll
  description: string;
}

export const CRAFTING_DISCIPLINES: DisciplineConfig[] = [
  {
    id: "alchemy",
    label: "Alchemy",
    icon: FlaskConical,
    tool: "Alchemist's Supplies",
    ability: "int",
    description: "Potions, elixirs, acids, and alchemical concoctions.",
  },
  {
    id: "smithing",
    label: "Smithing",
    icon: Hammer,
    tool: "Smith's Tools",
    ability: "str",
    description: "Weapons, armour, and metal goods forged at the anvil.",
  },
  {
    id: "leatherworking",
    label: "Leatherworking",
    icon: Scissors,
    tool: "Leatherworker's Tools",
    ability: "dex",
    description: "Leather armour, saddlery, quivers, and straps.",
  },
  {
    id: "woodcarving",
    label: "Woodcarving",
    icon: Axe,
    tool: "Woodcarver's Tools",
    ability: "dex",
    description: "Bows, bolts, arrows, staves, and carved wooden items.",
  },
  {
    id: "jewelcrafting",
    label: "Jewel Crafting",
    icon: Gem,
    tool: "Jeweler's Tools",
    ability: "dex",
    description: "Rings, amulets, gem settings, and fine jewellery.",
  },
  {
    id: "herbalism",
    label: "Herbalism",
    icon: Leaf,
    tool: "Herbalism Kit",
    ability: "wis",
    description: "Healing potions, antitoxins, and natural remedies.",
  },
  {
    id: "poisoncraft",
    label: "Poisoncraft",
    icon: Skull,
    tool: "Poisoner's Kit",
    ability: "int",
    description: "Contact, ingested, and injury poisons and antidotes.",
  },
  {
    id: "tinkering",
    label: "Tinkering",
    icon: Wrench,
    tool: "Tinker's Tools",
    ability: "int",
    description: "Clockwork devices, traps, and mechanical gadgets.",
  },
  {
    id: "cooking",
    label: "Cooking",
    icon: UtensilsCrossed,
    tool: "Cook's Utensils",
    ability: "wis",
    description: "Meals that grant mechanical benefits: temp HP, advantage, and more.",
  },
  {
    id: "scribing",
    label: "Scribing",
    icon: Feather,
    tool: "Calligrapher's Supplies",
    ability: "int",
    description: "Spell scrolls, documents, maps, and illuminated texts.",
  },
];

export function getDiscipline(id: CraftingDiscipline): DisciplineConfig {
  return CRAFTING_DISCIPLINES.find((d) => d.id === id) ?? CRAFTING_DISCIPLINES[0];
}
