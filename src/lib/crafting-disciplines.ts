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
  workspaceBonus: number;   // standard bonus for having a proper workspace
  workspaceLabel: string;   // label shown in attempt dialog (e.g. "Proper Kitchen Available")
}

export const CRAFTING_DISCIPLINES: DisciplineConfig[] = [
  {
    id: "alchemy",
    label: "Alchemy",
    icon: FlaskConical,
    tool: "Alchemist's Supplies",
    ability: "int",
    description: "Potions, elixirs, acids, and alchemical concoctions.",
    workspaceBonus: 2,
    workspaceLabel: "Proper alchemist's lab available",
  },
  {
    id: "smithing",
    label: "Smithing",
    icon: Hammer,
    tool: "Smith's Tools",
    ability: "str",
    description: "Weapons, armour, and metal goods forged at the anvil.",
    workspaceBonus: 3,
    workspaceLabel: "Full forge available",
  },
  {
    id: "leatherworking",
    label: "Leatherworking",
    icon: Scissors,
    tool: "Leatherworker's Tools",
    ability: "dex",
    description: "Leather armour, saddlery, quivers, and straps.",
    workspaceBonus: 2,
    workspaceLabel: "Equipped leatherworking workshop available",
  },
  {
    id: "woodcarving",
    label: "Woodcarving",
    icon: Axe,
    tool: "Woodcarver's Tools",
    ability: "dex",
    description: "Bows, bolts, arrows, staves, and carved wooden items.",
    workspaceBonus: 2,
    workspaceLabel: "Woodworking workshop available",
  },
  {
    id: "jewelcrafting",
    label: "Jewel Crafting",
    icon: Gem,
    tool: "Jeweler's Tools",
    ability: "dex",
    description: "Rings, amulets, gem settings, and fine jewellery.",
    workspaceBonus: 2,
    workspaceLabel: "Jeweler's workshop available",
  },
  {
    id: "herbalism",
    label: "Herbalism",
    icon: Leaf,
    tool: "Herbalism Kit",
    ability: "wis",
    description: "Healing potions, antitoxins, and natural remedies.",
    workspaceBonus: 2,
    workspaceLabel: "Herb garden or drying room available",
  },
  {
    id: "poisoncraft",
    label: "Poisoncraft",
    icon: Skull,
    tool: "Poisoner's Kit",
    ability: "int",
    description: "Contact, ingested, and injury poisons and antidotes.",
    workspaceBonus: 2,
    workspaceLabel: "Equipped poisoner's laboratory available",
  },
  {
    id: "tinkering",
    label: "Tinkering",
    icon: Wrench,
    tool: "Tinker's Tools",
    ability: "int",
    description: "Clockwork devices, traps, and mechanical gadgets.",
    workspaceBonus: 2,
    workspaceLabel: "Fully equipped workshop available",
  },
  {
    id: "cooking",
    label: "Cooking",
    icon: UtensilsCrossed,
    tool: "Cook's Utensils",
    ability: "wis",
    description: "Meals that grant mechanical benefits: temp HP, advantage, and more.",
    workspaceBonus: 2,
    workspaceLabel: "Proper kitchen available",
  },
  {
    id: "scribing",
    label: "Scribing",
    icon: Feather,
    tool: "Calligrapher's Supplies",
    ability: "int",
    description: "Spell scrolls, documents, maps, and illuminated texts.",
    workspaceBonus: 2,
    workspaceLabel: "Scriptorium or proper writing desk available",
  },
];

export function getDiscipline(id: CraftingDiscipline): DisciplineConfig {
  return CRAFTING_DISCIPLINES.find((d) => d.id === id) ?? CRAFTING_DISCIPLINES[0];
}
