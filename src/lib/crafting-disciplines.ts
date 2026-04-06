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
  Wine,
  Layers,
} from "lucide-vue-next";
import type { CraftingDiscipline } from "@/types/crafting.types";
import type { SaveKey } from "@/types/party.types";

export interface DisciplineConfig {
  id: CraftingDiscipline;
  label: string;
  icon: Component;
  /** All accepted tools — first entry is the primary (used for display). Multiple entries
   *  mean the player can use any of them for proficiency/inventory checks. */
  tools: string[];
  ability: SaveKey;      // primary ability for the crafting roll
  description: string;
  workspaceBonus: number;   // standard bonus for having a proper workspace
  workspaceLabel: string;   // label shown in attempt dialog
}

export const CRAFTING_DISCIPLINES: DisciplineConfig[] = [
  {
    id: "alchemy",
    label: "Alchemy",
    icon: FlaskConical,
    tools: ["Alchemist's Supplies"],
    ability: "int",
    description: "Potions, elixirs, acids, and alchemical concoctions.",
    workspaceBonus: 2,
    workspaceLabel: "Proper alchemist's lab available",
  },
  {
    id: "smithing",
    label: "Smithing",
    icon: Hammer,
    tools: ["Smith's Tools"],
    ability: "str",
    description: "Weapons, armour, and metal goods forged at the anvil.",
    workspaceBonus: 3,
    workspaceLabel: "Full forge available",
  },
  {
    id: "leathercraft",
    label: "Leathercraft",
    icon: Scissors,
    tools: ["Leatherworker's Tools", "Cobbler's Tools"],
    ability: "dex",
    description: "Leather armour, saddlery, quivers, pouches, and footwear.",
    workspaceBonus: 2,
    workspaceLabel: "Equipped leatherworking workshop available",
  },
  {
    id: "woodcraft",
    label: "Woodcraft",
    icon: Axe,
    tools: ["Woodcarver's Tools", "Carpenter's Tools", "Shipwright's Tools"],
    ability: "dex",
    description: "Bows, bolts, arrows, staves, furniture, and wooden structures.",
    workspaceBonus: 2,
    workspaceLabel: "Woodworking workshop available",
  },
  {
    id: "jewelcrafting",
    label: "Jewel Crafting",
    icon: Gem,
    tools: ["Jeweler's Tools", "Gemcutter's Tools"],
    ability: "dex",
    description: "Rings, amulets, gem settings, and fine jewellery.",
    workspaceBonus: 2,
    workspaceLabel: "Jeweler's workshop available",
  },
  {
    id: "herbalism",
    label: "Herbalism",
    icon: Leaf,
    tools: ["Herbalism Kit"],
    ability: "wis",
    description: "Healing potions, antitoxins, and natural remedies.",
    workspaceBonus: 2,
    workspaceLabel: "Herb garden or drying room available",
  },
  {
    id: "poisoncraft",
    label: "Poisoncraft",
    icon: Skull,
    tools: ["Poisoner's Kit"],
    ability: "int",
    description: "Contact, ingested, and injury poisons and antidotes.",
    workspaceBonus: 2,
    workspaceLabel: "Equipped poisoner's laboratory available",
  },
  {
    id: "tinkering",
    label: "Tinkering",
    icon: Wrench,
    tools: ["Tinker's Tools", "Glassblower's Tools"],
    ability: "int",
    description: "Clockwork devices, traps, and mechanical gadgets.",
    workspaceBonus: 2,
    workspaceLabel: "Fully equipped workshop available",
  },
  {
    id: "cooking",
    label: "Cooking",
    icon: UtensilsCrossed,
    tools: ["Cook's Utensils"],
    ability: "wis",
    description: "Meals that grant mechanical benefits: temp HP, advantage, and more.",
    workspaceBonus: 2,
    workspaceLabel: "Proper kitchen available",
  },
  {
    id: "scribing",
    label: "Scribing",
    icon: Feather,
    tools: ["Calligrapher's Supplies", "Bookbinder's Tools", "Scribe's Supplies", "Cartographer's Tools"],
    ability: "int",
    description: "Spell scrolls, documents, maps, illuminated texts, and bound books.",
    workspaceBonus: 2,
    workspaceLabel: "Scriptorium or proper writing desk available",
  },
  {
    id: "brewing",
    label: "Brewing",
    icon: Wine,
    tools: ["Brewer's Supplies"],
    ability: "wis",
    description: "Ales, meads, spirits, and tonics that grant temporary benefits.",
    workspaceBonus: 2,
    workspaceLabel: "Brewing facility or equipped tavern available",
  },
  {
    id: "weaving",
    label: "Weaving",
    icon: Layers,
    tools: ["Weaver's Tools", "Tailor's Tools"],
    ability: "dex",
    description: "Cloth armour, cloaks, garments, and woven goods with minor boons.",
    workspaceBonus: 2,
    workspaceLabel: "Equipped loom or tailoring room available",
  },
];

export function getDiscipline(id: CraftingDiscipline): DisciplineConfig {
  return CRAFTING_DISCIPLINES.find((d) => d.id === id) ?? CRAFTING_DISCIPLINES[0];
}
