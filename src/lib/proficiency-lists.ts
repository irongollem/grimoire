export interface ProficiencyGroup {
  name: string;
  items: string[];
}

export const TOOL_PROFICIENCY_GROUPS: ProficiencyGroup[] = [
  {
    name: "Artisan's Tools",
    items: [
      "Alchemist's Supplies",
      "Brewer's Supplies",
      "Calligrapher's Supplies",
      "Carpenter's Tools",
      "Cartographer's Tools",
      "Cobbler's Tools",
      "Cook's Utensils",
      "Glassblower's Tools",
      "Jeweler's Tools",
      "Leatherworker's Tools",
      "Mason's Tools",
      "Painter's Supplies",
      "Potter's Tools",
      "Smith's Tools",
      "Tinker's Tools",
      "Weaver's Tools",
      "Woodcarver's Tools",
    ],
  },
  {
    name: "Musical Instruments",
    items: [
      "Bagpipes",
      "Drum",
      "Dulcimer",
      "Flute",
      "Hand Drum",
      "Horn",
      "Lute",
      "Lyre",
      "Pan Flute",
      "Shawm",
      "Viol",
    ],
  },
  {
    name: "Gaming Sets",
    items: [
      "Dice Set",
      "Dragonchess Set",
      "Playing Card Set",
      "Three-Dragon Ante Set",
    ],
  },
  {
    name: "Kits & Other",
    items: [
      "Disguise Kit",
      "Forgery Kit",
      "Herbalism Kit",
      "Navigator's Tools",
      "Poisoner's Kit",
      "Thieves' Tools",
    ],
  },
  {
    name: "Vehicles",
    items: ["Vehicles (Land)", "Vehicles (Water)", "Vehicles (Air)"],
  },
];

export const LANGUAGE_GROUPS: ProficiencyGroup[] = [
  {
    name: "Standard",
    items: [
      "Common",
      "Dwarvish",
      "Elvish",
      "Giant",
      "Gnomish",
      "Goblin",
      "Halfling",
      "Orc",
    ],
  },
  {
    name: "Exotic",
    items: [
      "Abyssal",
      "Celestial",
      "Draconic",
      "Deep Speech",
      "Infernal",
      "Primordial",
      "Sylvan",
      "Undercommon",
    ],
  },
  {
    name: "Elemental Dialects",
    items: ["Aquan", "Auran", "Ignan", "Terran"],
  },
  {
    name: "Other",
    items: [
      "Aarakocra",
      "Druidic",
      "Giant Eagle",
      "Giant Elk",
      "Giant Owl",
      "Gnoll",
      "Modron",
      "Sahuagin",
      "Slaad",
      "Sphinx",
      "Thri-kreen",
      "Thieves' Cant",
      "Worg",
    ],
  },
];
