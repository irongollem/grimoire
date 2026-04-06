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
  ingredients: { tags: string[]; quantity: number }[];
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
      { tags: ["wood"], quantity: 1 },
      { tags: ["cloth"], quantity: 1 },
      { tags: ["oil"], quantity: 1 },
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
    ingredients: [{ tags: ["meat"], quantity: 1 }],
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
      { tags: ["meat"], quantity: 1 },
      { tags: ["salt"], quantity: 1 },
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
      { tags: ["meat"], quantity: 1 },
      { tags: ["salt"], quantity: 1 },
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
    ingredients: [{ tags: ["fish"], quantity: 1 }],
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
      { tags: ["meat"], quantity: 1 },
      { tags: ["vegetable"], quantity: 1 },
      { tags: ["water"], quantity: 1 },
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
    ingredients: [{ tags: ["ore"], quantity: 2 }],
    outputs: [{ name: "Iron Ingot", quantity: 1 }],
    modifiers: [{ description: "Full forge with bellows available", bonus: 3 }],
  },
  {
    name: "Smelt Silver Ingot",
    description:
      "Carefully roast silver ore to drive off impurities, then melt it in a crucible and pour it into a mould. Silver runs at a lower temperature than iron but demands a steadier hand.",
    discipline: "smithing",
    dc: 14,
    crafting_time: 4,
    crafting_time_unit: "hours",
    requires_proficiency: false,
    requires_tools: true,
    ingredients: [{ tags: ["silver"], quantity: 2 }],
    outputs: [{ name: "Silver Ingot", quantity: 1 }],
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
      { tags: ["healing"], quantity: 2 },
      { tags: ["water"], quantity: 1 },
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
      { tags: ["hide"], quantity: 1 },
      { tags: ["salt"], quantity: 1 },
    ],
    outputs: [{ name: "Tanned Leather", quantity: 2 }],
  },
  // ── Brewing ─────────────────────────────────────────────────────────────────
  {
    name: "Brew Ale",
    description:
      "Mash grain in hot water, let it ferment with a dash of bitters, and rack into mugs after two days. The staple drink of every tavern and campfire.",
    discipline: "brewing",
    dc: 10,
    crafting_time: 2,
    crafting_time_unit: "days",
    requires_proficiency: false,
    requires_tools: true,
    ingredients: [
      { tags: ["grain"], quantity: 2 },
      { tags: ["water"], quantity: 1 },
    ],
    outputs: [{ name: "Ale (mug)", quantity: 4 }],
  },
  {
    name: "Brew Mead",
    description:
      "Dissolve honey in water and allow it to ferment slowly. The result is sweet, warming, and considerably more refined than a common ale.",
    discipline: "brewing",
    dc: 12,
    crafting_time: 3,
    crafting_time_unit: "days",
    requires_proficiency: false,
    requires_tools: true,
    ingredients: [
      { tags: ["honey"], quantity: 2 },
      { tags: ["water"], quantity: 1 },
    ],
    outputs: [{ name: "Mead (bottle)", quantity: 2 }],
  },

  // ── Poisoncraft ──────────────────────────────────────────────────────────────
  {
    name: "Distil Basic Poison",
    description:
      "Extract and concentrate the toxins from poisonous plants through careful boiling and filtration. The resulting vial can coat a blade or be slipped into a drink.",
    discipline: "poisoncraft",
    dc: 14,
    crafting_time: 4,
    crafting_time_unit: "hours",
    requires_proficiency: true,
    requires_tools: true,
    ingredients: [
      { tags: ["poison"], quantity: 2 },
      { tags: ["water"], quantity: 1 },
    ],
    outputs: [{ name: "Poison, Basic (vial)", quantity: 1 }],
  },

  // ── Tinkering ────────────────────────────────────────────────────────────────
  {
    name: "Assemble Tinderbox",
    description:
      "Shape a flint strike-stone, fashion a steel striker, and pack tinder into a small tin. A reliable fire-starting kit that fits in a belt pouch.",
    discipline: "tinkering",
    dc: 10,
    crafting_time: 30,
    crafting_time_unit: "minutes",
    requires_proficiency: false,
    requires_tools: false,
    ingredients: [
      { tags: ["wood"], quantity: 1 },
      { tags: ["flint"], quantity: 1 },
    ],
    outputs: [{ name: "Tinderbox", quantity: 2 }],
  },
  {
    name: "Forge Hunting Trap",
    description:
      "Bend and temper metal into a spring-loaded jaw trap with a pressure plate at the center. Set it on a game trail and check it come morning.",
    discipline: "tinkering",
    dc: 12,
    crafting_time: 2,
    crafting_time_unit: "hours",
    requires_proficiency: false,
    requires_tools: true,
    ingredients: [
      { tags: ["metal"], quantity: 2 },
    ],
    outputs: [{ name: "Hunting Trap", quantity: 1 }],
    modifiers: [{ description: "Full forge available", bonus: 2 }],
  },

  // ── Weaving ──────────────────────────────────────────────────────────────────
  {
    name: "Twist Hempen Rope",
    description:
      "Spin plant fibers into yarn and twist the strands together into sturdy rope. Slow work, but fifty feet of reliable line is worth every hour.",
    discipline: "weaving",
    dc: 8,
    crafting_time: 4,
    crafting_time_unit: "hours",
    requires_proficiency: false,
    requires_tools: false,
    ingredients: [
      { tags: ["fiber"], quantity: 3 },
    ],
    outputs: [{ name: "Rope, Hempen (50 feet)", quantity: 1 }],
  },
  {
    name: "Sew Common Clothes",
    description:
      "Cut cloth into panels and sew them into a serviceable tunic, trousers, and cloak. Nothing fancy, but warm and travel-ready.",
    discipline: "weaving",
    dc: 10,
    crafting_time: 1,
    crafting_time_unit: "days",
    requires_proficiency: false,
    requires_tools: true,
    ingredients: [
      { tags: ["cloth"], quantity: 2 },
    ],
    outputs: [{ name: "Clothes, Common", quantity: 2 }],
  },

  // ── Scribing ─────────────────────────────────────────────────────────────────
  {
    name: "Bind a Spellbook",
    description:
      "Fold and gather parchment into gatherings, stitch them together, and bind them between leather covers. An empty spellbook, ready for a wizard's hand.",
    discipline: "scribing",
    dc: 14,
    crafting_time: 2,
    crafting_time_unit: "days",
    requires_proficiency: true,
    requires_tools: true,
    ingredients: [
      { tags: ["parchment"], quantity: 10 },
      { tags: ["leather"], quantity: 1  },
      { tags: ["ink"], quantity: 1  },
    ],
    outputs: [{ name: "Spellbook", quantity: 1 }],
  },

  // ── Additional Herbalism ─────────────────────────────────────────────────────
  {
    name: "Assemble Healer's Kit",
    description:
      "Dry and bundle healing herbs into poultices, prepare salves, and pack them alongside bandages and splints into a leather pouch.",
    discipline: "herbalism",
    dc: 10,
    crafting_time: 2,
    crafting_time_unit: "hours",
    requires_proficiency: false,
    requires_tools: false,
    ingredients: [
      { tags: ["healing"], quantity: 4 },
      { tags: ["cloth"], quantity: 1 },
    ],
    outputs: [{ name: "Healer's Kit", quantity: 1 }],
  },

  // ── Additional Alchemy ───────────────────────────────────────────────────────
  {
    name: "Brew Alchemist's Fire",
    description:
      "Combine refined oil with powdered brimstone and seal the flask tightly. The mixture ignites violently on contact with air — handle with great care.",
    discipline: "alchemy",
    dc: 14,
    crafting_time: 4,
    crafting_time_unit: "hours",
    requires_proficiency: true,
    requires_tools: true,
    ingredients: [
      { tags: ["oil"], quantity: 1 },
      { tags: ["brimstone"], quantity: 1 },
    ],
    outputs: [{ name: "Alchemist's Fire (flask)", quantity: 1 }],
    modifiers: [{ description: "Proper alchemical laboratory available", bonus: 2 }],
  },

  // ── Additional Smithing ──────────────────────────────────────────────────────
  {
    name: "Cast Iron Pot",
    description:
      "Pour molten iron into a pot mould and work the rim smooth once cooled. A heavy but indestructible cooking vessel.",
    discipline: "smithing",
    dc: 12,
    crafting_time: 4,
    crafting_time_unit: "hours",
    requires_proficiency: false,
    requires_tools: true,
    ingredients: [
      { tags: ["ingot"], quantity: 2 },
    ],
    outputs: [{ name: "Pot, Iron", quantity: 1 }],
    modifiers: [{ description: "Full forge with bellows available", bonus: 3 }],
  },

  // ── Additional Leathercraft ──────────────────────────────────────────────────
  {
    name: "Craft Leather Backpack",
    description:
      "Cut tanned leather into panels, punch eyelets, thread straps, and stitch it all into a sturdy travelling pack that can carry thirty pounds.",
    discipline: "leathercraft",
    dc: 14,
    crafting_time: 2,
    crafting_time_unit: "days",
    requires_proficiency: false,
    requires_tools: true,
    ingredients: [
      { tags: ["leather"], quantity: 3 },
    ],
    outputs: [{ name: "Backpack", quantity: 1 }],
  },

  // ── Additional Woodcraft ─────────────────────────────────────────────────────
  {
    name: "Whittle Walking Pole",
    description:
      "Strip a straight branch, smooth it with a knife, and harden the end in a low fire. Useful as a hiking staff, a makeshift lever, or a tent pole.",
    discipline: "woodcraft",
    dc: 8,
    crafting_time: 30,
    crafting_time_unit: "minutes",
    requires_proficiency: false,
    requires_tools: false,
    ingredients: [
      { tags: ["wood"], quantity: 1 },
    ],
    outputs: [{ name: "Pole (10-foot)", quantity: 2 }],
  },

  // ── Jewelcrafting ────────────────────────────────────────────────────────────
  {
    name: "Cast Signet Ring",
    description:
      "Melt down a silver ingot, pour it into a ring mould, and engrave a simple device on the face. Functional as a seal or a discreet symbol of allegiance.",
    discipline: "jewelcrafting",
    dc: 12,
    crafting_time: 4,
    crafting_time_unit: "hours",
    requires_proficiency: true,
    requires_tools: true,
    ingredients: [
      { tags: ["silver"], quantity: 1 },
    ],
    outputs: [{ name: "Signet Ring", quantity: 1 }],
    modifiers: [{ description: "Proper jeweler's bench with fine tools", bonus: 2 }],
  },

  // ── Additional Cooking ───────────────────────────────────────────────────────
  {
    name: "Bake Trail Rations",
    description:
      "Dry and press smoked meat with baked grain into dense, long-lasting travel cakes. Compact enough for a belt pouch, filling enough for a day on the road.",
    discipline: "cooking",
    dc: 10,
    crafting_time: 2,
    crafting_time_unit: "hours",
    requires_proficiency: false,
    requires_tools: false,
    ingredients: [
      { tags: ["grain"], quantity: 1 },
      { tags: ["meat"], quantity: 1 },
    ],
    outputs: [{ name: "Rations (1 day)", quantity: 3 }],
  },

  // ── Additional Smithing ───────────────────────────────────────────────────────
  {
    name: "Forge Iron Spikes",
    description:
      "Draw hot iron into points and flatten the heads — useful as climbing pitons, door spikes, or plain old nails. Simple work, but always needed.",
    discipline: "smithing",
    dc: 8,
    crafting_time: 1,
    crafting_time_unit: "hours",
    requires_proficiency: false,
    requires_tools: true,
    ingredients: [
      { tags: ["ingot"], quantity: 1 },
    ],
    outputs: [{ name: "Spikes, Iron (10)", quantity: 2 }],
    modifiers: [{ description: "Full forge with bellows available", bonus: 3 }],
  },
  {
    name: "Forge Oil Lamp",
    description:
      "Shape a small iron basin with a wick tube and hanging hook. Once filled with oil it burns for six hours, casting steady light across a wide radius.",
    discipline: "smithing",
    dc: 10,
    crafting_time: 2,
    crafting_time_unit: "hours",
    requires_proficiency: false,
    requires_tools: true,
    ingredients: [
      { tags: ["ingot"], quantity: 1 },
      { tags: ["cloth"], quantity: 1 },
    ],
    outputs: [{ name: "Lamp", quantity: 1 }],
    modifiers: [{ description: "Full forge with bellows available", bonus: 3 }],
  },

  // ── Additional Tinkering ──────────────────────────────────────────────────────
  {
    name: "Blow Glass Vials",
    description:
      "Melt ground stone in a crucible until it runs clear, then blow and shape it into small vials. Invaluable for storing alchemical reagents and potions.",
    discipline: "tinkering",
    dc: 12,
    crafting_time: 2,
    crafting_time_unit: "hours",
    requires_proficiency: true,
    requires_tools: true,
    ingredients: [
      { tags: ["stone"], quantity: 2 },
    ],
    outputs: [{ name: "Vial", quantity: 3 }],
  },
  {
    name: "Cut Whetstone",
    description:
      "Shape a piece of coarse gritstone into a flat rectangle and smooth one face for honing. A whetstone keeps a blade sharp on the road when a proper grindstone isn't available.",
    discipline: "tinkering",
    dc: 8,
    crafting_time: 30,
    crafting_time_unit: "minutes",
    requires_proficiency: false,
    requires_tools: false,
    ingredients: [
      { tags: ["stone"], quantity: 1 },
    ],
    outputs: [{ name: "Whetstone", quantity: 2 }],
  },
  {
    name: "Throw Clay Vessel",
    description:
      "Centre a ball of clay on a wheel, raise the walls, and fire the vessel in a kiln or a bed of hot coals. Makes serviceable mugs, pitchers, or flasks.",
    discipline: "tinkering",
    dc: 10,
    crafting_time: 2,
    crafting_time_unit: "hours",
    requires_proficiency: false,
    requires_tools: false,
    ingredients: [
      { tags: ["clay"], quantity: 1 },
    ],
    outputs: [{ name: "Flask or Tankard", quantity: 2 }],
  },

  // ── Additional Leathercraft ───────────────────────────────────────────────────
  {
    name: "Craft Belt Pouch",
    description:
      "Cut tanned leather into a gusset, punch belt loops, stitch a flap, and add a toggle closure. A simple but essential piece of kit for any adventurer.",
    discipline: "leathercraft",
    dc: 8,
    crafting_time: 1,
    crafting_time_unit: "hours",
    requires_proficiency: false,
    requires_tools: false,
    ingredients: [
      { tags: ["leather"], quantity: 1 },
      { tags: ["fiber"], quantity: 1 },
    ],
    outputs: [{ name: "Pouch", quantity: 2 }],
  },
  {
    name: "Cobble Boots",
    description:
      "Last a pair of uppers from thick leather, nail on hobnailed soles, and finish with waterproof stitching. A pair that will outlast most roads.",
    discipline: "leathercraft",
    dc: 12,
    crafting_time: 1,
    crafting_time_unit: "days",
    requires_proficiency: false,
    requires_tools: true,
    ingredients: [
      { tags: ["leather"], quantity: 2 },
      { tags: ["metal"], quantity: 1 },
    ],
    outputs: [{ name: "Traveler's Boots", quantity: 1 }],
  },

  // ── Additional Woodcraft ─────────────────────────────────────────────────────
  {
    name: "Carve Holy Symbol",
    description:
      "Whittle a block of hardwood into a holy symbol and score the deity's mark into its face. Every cleric and paladin needs one, and any decent woodworker can provide it.",
    discipline: "woodcraft",
    dc: 10,
    crafting_time: 1,
    crafting_time_unit: "hours",
    requires_proficiency: false,
    requires_tools: false,
    ingredients: [
      { tags: ["wood"], quantity: 1 },
    ],
    outputs: [{ name: "Carved Holy Symbol", quantity: 1 }],
  },
  {
    name: "Build Field Chest",
    description:
      "Plane and join hardwood boards into a sturdy chest, hang iron straps as hinges, and drive a hasp for a padlock. Solid enough to take on campaign.",
    discipline: "woodcraft",
    dc: 12,
    crafting_time: 1,
    crafting_time_unit: "days",
    requires_proficiency: false,
    requires_tools: true,
    ingredients: [
      { tags: ["wood"], quantity: 3 },
      { tags: ["metal"], quantity: 1 },
    ],
    outputs: [{ name: "Chest", quantity: 1 }],
  },

  // ── Additional Scribing ───────────────────────────────────────────────────────
  {
    name: "Draw Local Map",
    description:
      "Sketch roads, settlements, rivers, and landmarks onto parchment using ink and charcoal shading. An imperfect but practical guide for the roads ahead.",
    discipline: "scribing",
    dc: 12,
    crafting_time: 2,
    crafting_time_unit: "hours",
    requires_proficiency: false,
    requires_tools: false,
    ingredients: [
      { tags: ["parchment"], quantity: 1 },
      { tags: ["ink"], quantity: 1 },
      { tags: ["charcoal"], quantity: 1 },
    ],
    outputs: [{ name: "Local Area Map", quantity: 1 }],
  },

  // ── Potion of Healing ────────────────────────────────────────────────────────
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
      { tags: ["healing"], quantity: 3 },
      { tags: ["water"], quantity: 1 },
    ],
    outputs: [{ name: "Potion of Healing", quantity: 1 }],
  },
];
