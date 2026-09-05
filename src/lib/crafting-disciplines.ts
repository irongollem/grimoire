import type { Component } from "vue";
import { IconCraftAlchemy, IconCraftBrewing, IconCraftCooking, IconCraftHerbalism, IconCraftJewelcrafting, IconCraftLeathercraft, IconCraftMasonry, IconCraftPainting, IconCraftPoisoncraft, IconCraftScribing, IconCraftSmithing, IconCraftTinkering, IconCraftWeaving, IconCraftWoodcraft } from '@/lib/icons';
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
    icon: IconCraftAlchemy,
    tools: ["Alchemist's Supplies"],
    ability: "int",
    description: "Potions, elixirs, acids, and alchemical concoctions.",
    workspaceBonus: 2,
    workspaceLabel: "Proper alchemist's lab available",
  },
  {
    id: "smithing",
    label: "Smithing",
    icon: IconCraftSmithing,
    tools: ["Smith's Tools"],
    ability: "str",
    description: "Weapons, armour, and metal goods forged at the anvil.",
    workspaceBonus: 3,
    workspaceLabel: "Full forge available",
  },
  {
    id: "leathercraft",
    label: "Leathercraft",
    icon: IconCraftLeathercraft,
    tools: ["Leatherworker's Tools", "Cobbler's Tools"],
    ability: "dex",
    description: "Leather armour, saddlery, quivers, pouches, and footwear.",
    workspaceBonus: 2,
    workspaceLabel: "Equipped leatherworking workshop available",
  },
  {
    id: "woodcraft",
    label: "Woodcraft",
    icon: IconCraftWoodcraft,
    tools: ["Woodcarver's Tools", "Carpenter's Tools", "Shipwright's Tools"],
    ability: "dex",
    description: "Bows, bolts, arrows, staves, furniture, and wooden structures.",
    workspaceBonus: 2,
    workspaceLabel: "Woodworking workshop available",
  },
  {
    id: "jewelcrafting",
    label: "Jewel Crafting",
    icon: IconCraftJewelcrafting,
    tools: ["Jeweler's Tools", "Gemcutter's Tools"],
    ability: "dex",
    description: "Rings, amulets, gem settings, and fine jewellery.",
    workspaceBonus: 2,
    workspaceLabel: "Jeweler's workshop available",
  },
  {
    id: "herbalism",
    label: "Herbalism",
    icon: IconCraftHerbalism,
    tools: ["Herbalism Kit"],
    ability: "wis",
    description: "Healing potions, antitoxins, and natural remedies.",
    workspaceBonus: 2,
    workspaceLabel: "Herb garden or drying room available",
  },
  {
    id: "poisoncraft",
    label: "Poisoncraft",
    icon: IconCraftPoisoncraft,
    tools: ["Poisoner's Kit"],
    ability: "int",
    description: "Contact, ingested, and injury poisons and antidotes.",
    workspaceBonus: 2,
    workspaceLabel: "Equipped poisoner's laboratory available",
  },
  {
    id: "tinkering",
    label: "Tinkering",
    icon: IconCraftTinkering,
    tools: ["Tinker's Tools", "Glassblower's Tools"],
    ability: "int",
    description: "Clockwork devices, traps, and mechanical gadgets.",
    workspaceBonus: 2,
    workspaceLabel: "Fully equipped workshop available",
  },
  {
    id: "cooking",
    label: "Cooking",
    icon: IconCraftCooking,
    tools: ["Cook's Utensils"],
    ability: "wis",
    description: "Meals that grant mechanical benefits: temp HP, advantage, and more.",
    workspaceBonus: 2,
    workspaceLabel: "Proper kitchen available",
  },
  {
    id: "scribing",
    label: "Scribing",
    icon: IconCraftScribing,
    tools: ["Calligrapher's Supplies", "Bookbinder's Tools", "Scribe's Supplies", "Cartographer's Tools"],
    ability: "int",
    description: "Spell scrolls, documents, maps, illuminated texts, and bound books.",
    workspaceBonus: 2,
    workspaceLabel: "Scriptorium or proper writing desk available",
  },
  {
    id: "forgery",
    label: "Forgery",
    // No forgery glyph exists yet in CRAFTING_GLYPHS (generated from a 14-discipline
    // art sheet) — reusing the scribing glyph as a deliberate placeholder until one
    // is generated. Do not hand-edit craftingGlyphs.generated.ts to add one.
    icon: IconCraftScribing,
    tools: ["Forgery Kit"],
    ability: "dex",
    description: "Counterfeit seals, papers, and documents convincing enough to survive casual scrutiny.",
    workspaceBonus: 2,
    workspaceLabel: "Private workroom with good light available",
  },
  {
    id: "brewing",
    label: "Brewing",
    icon: IconCraftBrewing,
    tools: ["Brewer's Supplies"],
    ability: "wis",
    description: "Ales, meads, spirits, and tonics that grant temporary benefits.",
    workspaceBonus: 2,
    workspaceLabel: "Brewing facility or equipped tavern available",
  },
  {
    id: "weaving",
    label: "Weaving",
    icon: IconCraftWeaving,
    tools: ["Weaver's Tools", "Tailor's Tools"],
    ability: "dex",
    description: "Cloth armour, cloaks, garments, and woven goods with minor boons.",
    workspaceBonus: 2,
    workspaceLabel: "Equipped loom or tailoring room available",
  },
  {
    id: "masonry",
    label: "Masonry",
    icon: IconCraftMasonry,
    tools: ["Mason's Tools"],
    ability: "str",
    description: "Stonecutting, construction, runestones, and carved stonework.",
    workspaceBonus: 3,
    workspaceLabel: "Quarry, stoneyard, or mason's workshop available",
  },
  {
    id: "painting",
    label: "Painting",
    icon: IconCraftPainting,
    tools: ["Painter's Supplies"],
    ability: "dex",
    description: "Pigment-work, heraldry, camouflage, warpaint, and visual deception.",
    workspaceBonus: 2,
    workspaceLabel: "Proper studio or scriptorium available",
  },
];

export function getDiscipline(id: CraftingDiscipline): DisciplineConfig {
  return CRAFTING_DISCIPLINES.find((d) => d.id === id) ?? CRAFTING_DISCIPLINES[0];
}
