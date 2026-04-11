import type { DndSettingDef } from "./types";

export const eberronSetting: DndSettingDef = {
  id: "eberron",
  label: "Eberron",

  defaultAiPrompt:
    "Magitech noir fantasy with a post-war, rain-slicked mood. Favour amber gaslight, dark polished wood, tarnished brass, wet cobblestone, and industrial grey stone. " +
    "Magic is infrastructure — House seals on crates, lightning rail sparks, the blue-white glow of eberite lanterns, Cannith maker's marks stamped on everything. " +
    "Warforged should look functional and scarred: plated with different metals from field repairs, carvings or sigils added by their own hands, not decorative but personal. " +
    "Characters wear urban practical — long coats, dragonmark tattoos visible at collar or wrist, House insignia, military surplus from the Last War. Show war wounds and exhaustion. " +
    "Architecture mixes grand Galifar-era facades with makeshift post-war additions — scaffolding, boarding, mismatched stone. Sharn layers keep and skytower above fog-choked lower wards. " +
    "The Mournland should feel wrong: grey-white mist, warped terrain, silence, the absence of decay where everything should be rotting. " +
    "Keep the mood tense, morally grey, and urban — glamour exists but it's always covering something.",

  calendar: {
    name: "Eberron (Galifar Calendar)",
    epochName: "YK",
    defaultYear: 998,
    weekStyle: "weekly",
    dayLabels: ["Sul", "Mol", "Zol", "Wir", "Zor", "Far", "Sar"],
    months: [
      { name: "Zarantyr",  alias: "Storm Month",    days: 28 },
      { name: "Olarune",   alias: "Sentinel Month", days: 28 },
      { name: "Therendor", alias: "Healer's Month", days: 28 },
      { name: "Eyre",      alias: "Anvil Month",    days: 28 },
      { name: "Dravago",   alias: "Herder's Month", days: 28 },
      { name: "Nymm",      alias: "Crowns Month",   days: 28 },
      { name: "Lharvion",  alias: "Eye Month",      days: 28 },
      { name: "Barrakas",  alias: "Lantern Month",  days: 28 },
      { name: "Rhaan",     alias: "Book Month",     days: 28 },
      { name: "Sypheros",  alias: "Shadow Month",   days: 28 },
      { name: "Aryth",     alias: "Gateway Month",  days: 28 },
      { name: "Vult",      alias: "Warding Month",  days: 28 },
    ],
    intercalaryDays: [],
    leapYearRule: "none",
  },

  locations: [
    { name: "Eberron",     location_type: "world",     notes: "The world itself, formed from the body of the great dragon Eberron, where magic is woven into its very physics.", tags: ["planet", "world"] },
    { name: "Khorvaire",   location_type: "continent", parent: "Eberron",    notes: "The primary continent of Eberron, home to the Five Nations, the Mournland, and dozens of diverse peoples.", tags: ["eberron"] },
    { name: "Xen'drik",    location_type: "continent", parent: "Eberron",    notes: "A mysterious southern continent of ancient giant ruins and impenetrable jungles.", tags: ["giants", "ruins", "mysterious", "south"] },
    { name: "Sarlona",     location_type: "continent", parent: "Eberron",    notes: "A distant eastern continent dominated by the Inspired, humanoid thralls of the nightmare Quori spirits.", tags: ["inspired", "quori", "distant", "east"] },
    { name: "Argonnessen", location_type: "continent", parent: "Eberron",    notes: "The dragon continent to the southeast. Home to the Chamber, the Conclave, and thousands of true dragons.", tags: ["dragons", "chamber", "conclave"] },
    { name: "Khyber",      location_type: "region",    parent: "Eberron",    notes: "The underworld of Eberron, said to be the body of the Dragon Below. A vast subterranean realm of aberrations and bound fiends.", tags: ["underground", "aberrations", "fiends", "dragon below"] },
    { name: "Breland",     location_type: "country",   parent: "Khorvaire",  notes: "The largest of the Five Nations, known for industry, relative democracy, and the teeming city of Sharn.", tags: ["five nations"] },
    { name: "Aundair",     location_type: "country",   parent: "Khorvaire",  notes: "A nation renowned for its arcane traditions, fertile fields, and the floating Arcanix towers.", tags: ["five nations", "magic", "arcanix"] },
    { name: "Karrnath",    location_type: "country",   parent: "Khorvaire",  notes: "A harsh, militaristic nation with a grim history of deploying undead soldiers in the Last War.", tags: ["five nations", "undead", "military"] },
    { name: "Thrane",      location_type: "country",   parent: "Khorvaire",  notes: "A theocracy governed by the Church of the Silver Flame, known for its paladins and inquisitors.", tags: ["five nations", "silver flame", "theocracy"] },
    { name: "Darguun",     location_type: "country",   parent: "Khorvaire",  notes: "A nation carved out by goblinoid peoples who seized former Cyre territory during the Last War.", tags: ["goblinoids", "hobgoblins", "last war"] },
    { name: "Droaam",      location_type: "country",   parent: "Khorvaire",  notes: "A nation of monsters — medusas, gnolls, harpies, and worse — ruled by the three Daughters of Sora Kell.", tags: ["monsters", "daughters of sora kell"] },
    { name: "Sharn",       location_type: "city",      parent: "Breland",    notes: "The City of Towers — a massive vertical metropolis built on a manifest zone to Syrania that allows magic to lift buildings miles into the sky.", tags: ["city of towers", "towers", "syrania"] },
    { name: "Wroat",       location_type: "city",      parent: "Breland",    notes: "The capital of Breland, seat of King Boranel ir'Wynarn and the Breland Parliament.", tags: ["breland", "capital", "parliament"] },
    { name: "Fairhaven",   location_type: "city",      parent: "Aundair",    notes: "The capital of Aundair — a city of wizards built around the floating Arcanix towers. Known for fine wine and arcane academies.", tags: ["aundair", "capital", "wizards", "arcanix"] },
    { name: "Korth",       location_type: "city",      parent: "Karrnath",   notes: "The capital of Karrnath — a grim fortress-city on the Karrn River, home to the Order of the Emerald Claw.", tags: ["karrnath", "capital", "undead", "emerald claw"] },
    { name: "Flamekeep",   location_type: "city",      parent: "Thrane",     notes: "The capital of Thrane and seat of the Church of the Silver Flame, built around the pillar of divine fire.", tags: ["thrane", "capital", "silver flame"] },
    { name: "The Mournland", location_type: "wilderness", parent: "Khorvaire", notes: "The shattered wasteland where Cyre once stood. Destroyed in the Day of Mourning in 994 YK. Surrounded by a wall of dead grey mist.", tags: ["cyre", "day of mourning", "ruins", "dead-grey mist"] },
  ],

  heroes: [
    {
      name: "Jaela Daran",
      race: "Human",
      alignment: "Lawful Good",
      occupation: "Keeper of the Flame",
      personality: "Serene and wise far beyond her apparent age — Jaela was chosen as the spiritual leader of the Church of the Silver Flame at age six and has served as Keeper ever since. She is compassionate but resolute when the Flame demands difficult decisions.",
      backstory: "The spiritual leader of the Church of the Silver Flame and de facto ruler of Thrane. Though she appears as a young girl, she is centuries older in accumulated spiritual experience. The Silver Flame speaks through her directly.",
      status: "alive",
      relationship: "ally",
      portrait_url: null,
      tags: ["thrane", "silver flame", "keeper", "theocracy"],
    },
    {
      name: "Merrix d'Cannith",
      race: "Human",
      alignment: "Lawful Neutral",
      occupation: "House Cannith Patriarch (South) / Artificer",
      personality: "Cold, brilliant, and utterly pragmatic. Merrix views the world as a problem to be engineered. He created the modern warforged and has plans few others can anticipate. Not evil — but not warm either.",
      backstory: "Head of House Cannith South and grandson of the man who first built the warforged. He secretly continued warforged production after the Treaty of Thronehold banned it, and his interests in the Day of Mourning go deeper than anyone knows.",
      status: "alive",
      relationship: "neutral",
      portrait_url: null,
      tags: ["house cannith", "artificer", "warforged", "dragonmark"],
    },
    {
      name: "Lady Elaydren d'Vown",
      race: "Half-Elf",
      alignment: "Neutral Good",
      occupation: "House Cannith Agent",
      personality: "Charming and genuinely warm, but carrying deep secrets about House Cannith's hidden agenda. She cares about doing the right thing even when her House obligations make that complicated.",
      backstory: "A Cannith agent tasked with recovering schema fragments tied to the Creation Pattern — an ancient Cannith design of unknown but terrifying power. She recruits adventurers when her House's own agents cannot be trusted.",
      status: "alive",
      relationship: "ally",
      portrait_url: null,
      tags: ["house cannith", "eberron", "creation pattern", "schema"],
    },
    {
      name: "The Lord of Blades",
      race: "Warforged",
      alignment: "Lawful Evil",
      occupation: "Warlord / Warforged Separatist",
      personality: "Charismatic, hateful of 'fleshlings', and utterly convinced that warforged are the next stage of civilization. He speaks with cold precision and has never lost a debate with an enemy he later allowed to live.",
      backstory: "An enigmatic warforged warlord who leads a nation of warforged in the Mournland. He rejects the Treaty of Thronehold and seeks to build a warforged homeland — by conquest if necessary. His true name and origins are unknown.",
      status: "alive",
      relationship: "enemy",
      portrait_url: null,
      tags: ["warforged", "mournland", "separatist", "villain"],
    },
    {
      name: "Daine",
      race: "Human",
      alignment: "Chaotic Good",
      occupation: "Veteran Soldier / Mercenary",
      personality: "Gruff, haunted by the Last War, and deeply protective of those he calls his own. Daine distrusts authority but will go to any length for his comrades. He drinks too much and sleeps too little.",
      backstory: "A veteran of the Last War who survived the Day of Mourning by being away from Cyre on a mission. The loss of his nation, his family, and most of his regiment has left him without roots — he wanders, takes mercenary work, and tries not to think about what he lost.",
      status: "alive",
      relationship: "ally",
      portrait_url: null,
      tags: ["cyre", "veteran", "last war", "mercenary"],
    },
  ],
};
