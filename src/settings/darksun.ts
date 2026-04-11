import type { DndSettingDef } from "./types";

export const darksunSetting: DndSettingDef = {
  id: "darksun",
  label: "Dark Sun",

  defaultAiPrompt:
    "Dying desert world with a brutal, sun-bleached palette — bone white, terracotta orange, ochre, obsidian black, and the sickly crimson of a sun too close and too hot. Cast harsh overhead shadows; midday on Athas has no mercy. " +
    "There is no metal — weapons and armour are stone, bone, chitin, obsidian, and hardened leather. Show this: a sword made of bone with sinew wrapping and a chipped edge, armour of beetle carapace stitched with gut. Everything is maintained, repaired, precious. " +
    "Characters wear minimal cloth against the heat — wrapped linen, open shoulders, tattoos and scarification as cultural markers, psionic focus crystals worn or carried. Gladiators show arena scars and sponsor brands. Slaves show restraint marks. " +
    "Water is the true currency. Show it only where it matters: a waterskin strapped close, a cracked lip, the relief on a face finding a shaded well. Its absence should feel like tension. " +
    "The landscape is actively hostile: silt dust on every surface, heat shimmer distorting the horizon, dead trees bleached to sculpture, carcasses stripped clean by the sun. Vegetation, when it exists, should feel miraculous. " +
    "Sorcerer-kings should look like they have absorbed centuries of power — ancient and terrible, their templars wearing the city's colours like a brand. The Dragon is not a creature. It is a catastrophe. " +
    "Keep the mood brutal, defiant, and survival-driven — beauty exists here, but it is hard-edged and costs something.",

  calendar: {
    name: "Dark Sun (Calendar of Athas)",
    epochName: "FY",
    defaultYear: 190,
    weekStyle: "tenday",
    weekRowNames: ["First Tenday", "Second Tenday", "Third Tenday"],
    months: [
      { name: "Scorch",             alias: "High Sun I",      days: 30 },
      { name: "Morrow",             alias: "High Sun II",     days: 30 },
      { name: "Rest",               alias: "High Sun III",    days: 30 },
      { name: "Gather",             alias: "High Sun IV",     days: 30 },
      { name: "Cooling",            alias: "Low Sun I",       days: 30 },
      { name: "Haze",               alias: "Low Sun II",      days: 30 },
      { name: "Wind",               alias: "Low Sun III",     days: 30 },
      { name: "Sorrow",             alias: "Low Sun IV",      days: 30 },
      { name: "Smolder",            alias: "Wind & Fire I",   days: 30 },
      { name: "Desert's Vengeance", alias: "Wind & Fire II",  days: 30 },
      { name: "Bloom",              alias: "Wind & Fire III", days: 30 },
      { name: "Embers",             alias: "Wind & Fire IV",  days: 30 },
    ],
    intercalaryDays: [
      { name: "Festival of the Highest Sun", afterMonth: 4,  description: "The scorching midpoint of High Sun — a brutal day when even the sorcerer-kings' templars retreat indoors. Gladiatorial games are held in shaded arenas." },
      { name: "Day of Rest",                 afterMonth: 8,  description: "The sole intercalary day all city-states observe. Even slave labour halts. Defilers and preservers alike feel the draw of the dying land on this day." },
      { name: "Storm's Crown",               afterMonth: 11, description: "The peak of Wind & Fire season — violent dust storms sweep the Tablelands. Caravans shelter and psions meditate on the Way amidst the howling dark." },
    ],
    leapYearRule: "none",
  },

  locations: [
    { name: "Athas",               location_type: "world",     notes: "A dying world stripped of life by defiling magic. No gods answer prayers here; psionics and primal power fill the void. The sun burns crimson.", tags: ["dying world", "defiling magic", "dark sun", "crimson sun"] },
    { name: "The Tablelands",      location_type: "region",    parent: "Athas",              notes: "The primary region of Athas — a rocky plateau dominated by seven City-States of the sorcerer-kings, separated by vast desert wastelands.", tags: ["city-states", "sorcerer-kings", "plateau"] },
    { name: "Tyr",                 location_type: "city",      parent: "The Tablelands",     notes: "The City of Freedom — the only city-state where the sorcerer-king Kalak was slain. Tyr struggles to maintain a fragile republic.", tags: ["freedom", "kalak dead", "republic", "gladiators"] },
    { name: "Urik",                location_type: "city",      parent: "The Tablelands",     notes: "The City of Lions — ruled by the calculating sorcerer-king Hamanu. The most militaristic city-state, disciplined and expansionist.", tags: ["hamanu", "military", "lions", "obsidian"] },
    { name: "Nibenay",             location_type: "city",      parent: "The Tablelands",     notes: "The City of Spires — ruled by the enigmatic sorcerer-king Nibenay (the Shadow King). A city of intrigue and strict gender roles.", tags: ["nibenay", "shadow king", "spires", "templars"] },
    { name: "Gulg",                location_type: "city",      parent: "The Tablelands",     notes: "The Forest City — ruled by the primal sorcerer-queen Lalali-Puy (the Oba). One of the most spiritual city-states.", tags: ["lalali-puy", "oba", "forest", "primal"] },
    { name: "Balic",               location_type: "city",      parent: "The Tablelands",     notes: "The City of Sails — a coastal city on the Sea of Silt ruled by Andropinis. Known for its Senate and fleet of silt skimmers.", tags: ["andropinis", "senate", "silt skimmers", "trade"] },
    { name: "Raam",                location_type: "city",      parent: "The Tablelands",     notes: "The City of Unrest — once ruled by Abalach-Re, now in chaos after her death. Gang wars and slave uprisings tear the city apart.", tags: ["abalach-re", "chaos", "raam", "unrest"] },
    { name: "Draj",                location_type: "city",      parent: "The Tablelands",     notes: "The City of the Moons — ruled by Tectuktitlay, who demands blood sacrifice at his twin pyramids to 'feed' the crimson sun.", tags: ["tectuktitlay", "sacrifice", "pyramids", "moons"] },
    { name: "Sea of Silt",         location_type: "wilderness",parent: "Athas",              notes: "An enormous desert of grey powdery silt stretching for hundreds of miles. Silt storms can bury ships whole; strange creatures lurk beneath.", tags: ["silt", "desert sea", "silt skimmers", "hazard"] },
    { name: "Ringing Mountains",   location_type: "wilderness",parent: "Athas",              notes: "A vast mountain range encircling much of the Tablelands, home to rogue tribes and abandoned dwarven fortresses.", tags: ["mountains", "frontier", "dwarves", "dangerous"] },
    { name: "The Obsidian Wastes", location_type: "wilderness",parent: "Athas",              notes: "A vast plain of black volcanic glass beyond the Ringing Mountains. Almost nothing lives here.", tags: ["obsidian", "desolate", "volcanic", "wasteland"] },
    { name: "The Deadlands",       location_type: "wilderness",parent: "Athas",              notes: "A blasted region of utter devastation, believed to be where the Dragon first tested mass defiling. Utterly lifeless.", tags: ["dragon", "defiled", "lifeless", "history"] },
  ],

  heroes: [
    {
      name: "Rikus",
      race: "Mul (Dwarf-Human Half-Breed)",
      alignment: "Chaotic Good",
      occupation: "Gladiator / Hero of Tyr",
      personality: "Explosive, brave to the point of recklessness, and consumed by righteous fury at a world that made him a slave. Rikus leads with his body and rarely pauses to think. When he does think, he surprises people.",
      backstory: "The greatest gladiator in Tyr's arena, Rikus played a central role in killing the sorcerer-king Kalak and freeing the city. He fights for Tyr's republic with the same savage efficiency he once used to survive the arena — and he is deeply uncertain what freedom is supposed to feel like.",
      status: "alive",
      relationship: "ally",
      portrait_url: null,
      tags: ["tyr", "gladiator", "mul", "hero of tyr", "free tyr"],
    },
    {
      name: "Sadira of Tyr",
      race: "Half-Elf",
      alignment: "Neutral Good",
      occupation: "Preserver Wizard / Revolutionary",
      personality: "Principled, intelligent, and carrying the weight of a terrible power she did not ask for. Sadira chose the preserving path when it was dangerous to do so — she refuses to use defiling magic even when it would be easier.",
      backstory: "A preserver wizard from Tyr's underclass who helped bring down Kalak. She later underwent a ritual that granted her the Sun Wizard's power — fuelled by sunlight rather than life, making her the most powerful non-defiling wizard on Athas. The power terrifies her.",
      status: "alive",
      relationship: "ally",
      portrait_url: null,
      tags: ["tyr", "preserver", "wizard", "sun wizard", "revolutionary"],
    },
    {
      name: "Agis of Asticles",
      race: "Human",
      alignment: "Lawful Good",
      occupation: "Senator of Tyr / Psionicist",
      personality: "Thoughtful, idealistic, and genuinely committed to building something good from Tyr's ruins. Agis approaches politics with the same disciplined calm he brings to psionics. He is the conscience of the free city.",
      backstory: "A Tyrian noble and senator who was one of the key figures in the conspiracy against Kalak. Agis uses his psychic gifts and political influence to build Tyr's fragile republic. He believes — perhaps naively — that it can work.",
      status: "alive",
      relationship: "ally",
      portrait_url: null,
      tags: ["tyr", "senator", "psionicist", "noble", "republic"],
    },
    {
      name: "Hamanu",
      race: "Human (Sorcerer-King)",
      alignment: "Lawful Evil",
      occupation: "Sorcerer-King of Urik / Dragon-Metamorph",
      personality: "Cold, calculating, and utterly convinced of his own superiority — because he may well be right. Hamanu views everything and everyone as a resource. He is not capricious like some sorcerer-kings. He is systematic.",
      backstory: "The immortal sorcerer-king of Urik, Hamanu has ruled for thousands of years through discipline and terror. He is secretly a dragon-metamorph in mid-transformation. He watched Kalak fall with contempt — not grief. He does not intend to make the same mistakes.",
      status: "alive",
      relationship: "enemy",
      portrait_url: null,
      tags: ["urik", "sorcerer-king", "dragon metamorph", "villain", "immortal"],
    },
    {
      name: "The Dragon of Athas (Borys)",
      race: "Dragon (formerly Human)",
      alignment: "Neutral Evil",
      occupation: "The Dragon / Enforcer of the Sorcerer-Kings",
      personality: "Ancient beyond measure and alien in his thinking. Borys is no longer fully conscious of his humanity. He communicates in demands and demonstrates power in ways that leave craters. He is the reason the Tablelands has stayed relatively stable — and the reason it continues to die.",
      backstory: "Once a great champion who became the first sorcerer-king to complete the dragon metamorphosis. The other kings made a pact: they feed him a thousand lives each year to keep him docile. In exchange he enforces the status quo. The Dragon is the apex predator of Athas — and also its greatest unsolved problem.",
      status: "alive",
      relationship: "enemy",
      portrait_url: null,
      tags: ["dragon", "borys", "sorcerer-king", "apex predator", "athas"],
    },
  ],
};
