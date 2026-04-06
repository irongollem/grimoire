import type { CraftingDiscipline } from "@/types/crafting.types";

export interface StarterRecipeDef {
  name: string;
  description: string;
  discipline: CraftingDiscipline;
  dc: number;
  crafting_time: number;
  crafting_time_unit: "minutes" | "hours" | "days";
  requires_proficiency: boolean;
  requires_tools: boolean;
  /** All ingredients are tag-based so any tagged item qualifies */
  ingredients: { tag: string; quantity: number }[];
  outputs: { name: string; quantity: number }[];
  modifiers?: { description: string; bonus: number }[];
}

export const STARTER_RECIPES: StarterRecipeDef[] = [
  {
    name: "Improvised Torch",
    description:
      "Wrap a rag around a stick and soak it in oil or tallow. A crude but reliable light source.",
    discipline: "woodcraft",
    dc: 8,
    crafting_time: 10,
    crafting_time_unit: "minutes",
    requires_proficiency: false,
    requires_tools: false,
    ingredients: [
      { tag: "wood",  quantity: 1 },
      { tag: "cloth", quantity: 1 },
      { tag: "oil",   quantity: 1 },
    ],
    outputs: [{ name: "Torch", quantity: 3 }],
  },
  {
    name: "Grilled Meat",
    description:
      "Hold any cut of meat over an open fire until cooked through. Simple, quick, filling.",
    discipline: "cooking",
    dc: 8,
    crafting_time: 30,
    crafting_time_unit: "minutes",
    requires_proficiency: false,
    requires_tools: false,
    ingredients: [{ tag: "meat", quantity: 1 }],
    outputs: [{ name: "Grilled Meat", quantity: 1 }],
  },
  {
    name: "Roast Meat",
    description:
      "Slow-roast a seasoned cut over steady heat. Produces a more satisfying meal — and two servings.",
    discipline: "cooking",
    dc: 10,
    crafting_time: 2,
    crafting_time_unit: "hours",
    requires_proficiency: false,
    requires_tools: false,
    ingredients: [
      { tag: "meat", quantity: 1 },
      { tag: "salt", quantity: 1 },
    ],
    outputs: [{ name: "Roast Meat", quantity: 2 }],
  },
  {
    name: "Smoked Meat (Jerky)",
    description:
      "Salt the meat and smoke it low and slow. The result keeps for weeks — invaluable on long journeys.",
    discipline: "cooking",
    dc: 12,
    crafting_time: 1,
    crafting_time_unit: "days",
    requires_proficiency: false,
    requires_tools: false,
    ingredients: [
      { tag: "meat", quantity: 1 },
      { tag: "salt", quantity: 1 },
    ],
    outputs: [{ name: "Smoked Meat (Jerky)", quantity: 2 }],
  },
  {
    name: "Grilled Fish",
    description:
      "Lay a fresh fish over glowing coals until the flesh flakes cleanly from the bone.",
    discipline: "cooking",
    dc: 8,
    crafting_time: 30,
    crafting_time_unit: "minutes",
    requires_proficiency: false,
    requires_tools: false,
    ingredients: [{ tag: "fish", quantity: 1 }],
    outputs: [{ name: "Grilled Fish", quantity: 1 }],
  },
  {
    name: "Pot of Stew",
    description:
      "Combine meat, vegetables, and water in a pot and simmer until thick and rich. Feeds the whole party.",
    discipline: "cooking",
    dc: 12,
    crafting_time: 2,
    crafting_time_unit: "hours",
    requires_proficiency: false,
    requires_tools: false,
    ingredients: [
      { tag: "meat",      quantity: 1 },
      { tag: "vegetable", quantity: 1 },
      { tag: "water",     quantity: 1 },
    ],
    outputs: [{ name: "Pot of Stew", quantity: 1 }],
  },
  {
    name: "Smelt Iron Ingot",
    description:
      "Feed iron ore into a furnace and work the bellows until the metal runs free. Pour into a mould and allow to cool.",
    discipline: "smithing",
    dc: 12,
    crafting_time: 4,
    crafting_time_unit: "hours",
    requires_proficiency: false,
    requires_tools: true,
    ingredients: [{ tag: "ore", quantity: 2 }],
    outputs: [{ name: "Iron Ingot", quantity: 1 }],
    modifiers: [{ description: "Full forge with bellows available", bonus: 3 }],
  },
  {
    name: "Brew Antitoxin",
    description:
      "Combine specific medicinal herbs with fresh water and reduce slowly. The resulting vial neutralises most common poisons.",
    discipline: "herbalism",
    dc: 12,
    crafting_time: 4,
    crafting_time_unit: "hours",
    requires_proficiency: true,
    requires_tools: true,
    ingredients: [
      { tag: "healing", quantity: 2 },
      { tag: "water",   quantity: 1 },
    ],
    outputs: [{ name: "Antitoxin (vial)", quantity: 1 }],
  },
  {
    name: "Tan Leather",
    description:
      "Work salt into a raw hide and allow it to cure over a full day. The result is supple, durable leather.",
    discipline: "leathercraft",
    dc: 10,
    crafting_time: 1,
    crafting_time_unit: "days",
    requires_proficiency: false,
    requires_tools: true,
    ingredients: [
      { tag: "hide", quantity: 1 },
      { tag: "salt", quantity: 1 },
    ],
    outputs: [{ name: "Tanned Leather", quantity: 2 }],
  },
  {
    name: "Brew Potion of Healing",
    description:
      "Steep healing herbs in purified water, reduce over low heat, and decant into a vial. The draught glimmers faintly red.",
    discipline: "alchemy",
    dc: 14,
    crafting_time: 1,
    crafting_time_unit: "days",
    requires_proficiency: true,
    requires_tools: true,
    ingredients: [
      { tag: "healing", quantity: 3 },
      { tag: "water",   quantity: 1 },
    ],
    outputs: [{ name: "Potion of Healing", quantity: 1 }],
  },
];
