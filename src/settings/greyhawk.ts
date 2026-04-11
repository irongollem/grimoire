import type { DndSettingDef } from "./types";

export const greyhawkSetting: DndSettingDef = {
  id: "greyhawk",
  label: "Greyhawk",

  defaultAiPrompt:
    "Gritty sword-and-sorcery fantasy with an earthy, weathered palette — rough-spun wool, worn leather, iron, tallow candles, smoke-stained timber, and river mud. " +
    "Magic is rare and consequential. A wizard should stand out in a crowd — robes mark them as exceptional, their equipment strange and purposeful. Avoid casual magic flourishes. " +
    "Dungeons feel genuinely ancient and lethal: cracked flagstones, thick darkness, rust, bones, the smell of something wrong. Traps look like they were built to last centuries. " +
    "Characters are mercenaries, scholars, priests, and outlaws — dress them in mismatched, repaired gear with regional details. A Velunian knight looks different from a Nyrond footsoldier. " +
    "Cities should feel medieval and layered — guild halls, market chaos, temple banners, the occasional lord's guard moving through a crowd that quietly parts. " +
    "Evil should feel tangible: Iuz's forces are twisted, cruel, and orcish-dark; the Great Kingdom's corruption shows in its finery hiding rot beneath. " +
    "Keep the mood grounded, dangerous, and classically adventurous — this is the world where the genre was forged.",

  calendar: {
    name: "Greyhawk (Oerth Common Year)",
    epochName: "CY",
    defaultYear: 591,
    weekStyle: "weekly",
    dayLabels: ["Starday", "Sunday", "Moonday", "Godsday", "Waterday", "Earthday", "Freeday"],
    months: [
      { name: "Fireseek",   alias: "Deep Winter",   days: 28 },
      { name: "Readying",   alias: "Late Winter",   days: 28 },
      { name: "Coldeven",   alias: "Early Spring",  days: 28 },
      { name: "Planting",   alias: "Mid Spring",    days: 28 },
      { name: "Flocktime",  alias: "Late Spring",   days: 28 },
      { name: "Wealsun",    alias: "Early Summer",  days: 28 },
      { name: "Reaping",    alias: "High Summer",   days: 28 },
      { name: "Goodmonth",  alias: "Late Summer",   days: 28 },
      { name: "Harvester",  alias: "Early Autumn",  days: 28 },
      { name: "Patchwall",  alias: "Mid Autumn",    days: 28 },
      { name: "Ready'reat", alias: "Late Autumn",   days: 28 },
      { name: "Sunsebb",    alias: "Early Winter",  days: 28 },
    ],
    intercalaryDays: [
      { name: "Needfest",  afterMonth: 12, description: "A mid-winter festival of gift-giving and merriment, lasting a full week." },
      { name: "Growfest",  afterMonth: 3,  description: "A spring festival celebrating the return of warmth and the planting season." },
      { name: "Richfest",  afterMonth: 6,  description: "A midsummer celebration of prosperity, games, and revelry." },
      { name: "Brewfest",  afterMonth: 9,  description: "An autumn harvest festival of feasting, drinking, and thanksgiving." },
    ],
    leapYearRule: "none",
  },

  locations: [
    { name: "Oerth",                            location_type: "world",     notes: "The world of Greyhawk — an Earth-like planet orbiting a yellow sun.", tags: ["greyhawk", "world of greyhawk", "planet"] },
    { name: "Oerik",                            location_type: "continent", parent: "Oerth",     notes: "The primary continent of Oerth. Most Greyhawk adventures take place in its eastern region, the Flanaess.", tags: ["greyhawk"] },
    { name: "Flanaess",                         location_type: "region",    parent: "Oerik",     notes: "The eastern portion of Oerik and the primary setting for Greyhawk adventures.", tags: ["greyhawk"] },
    { name: "City of Greyhawk",                 location_type: "city",      parent: "Flanaess",  notes: "The Free City of Greyhawk — a major hub of trade, magic, and political intrigue, named for the ancient castle ruins above it.", tags: ["free city", "greyhawk"] },
    { name: "Dyvers",                           location_type: "city",      parent: "Flanaess",  notes: "A prosperous port city on the Nyr Dyv lake, a commercial rival to the Free City.", tags: ["port", "trade", "nyr dyv"] },
    { name: "Verbobonc",                        location_type: "city",      parent: "Flanaess",  notes: "A fortified city near the Temple of Elemental Evil, gateway to many classic adventures.", tags: ["temple of elemental evil", "classic"] },
    { name: "Furyondy",                         location_type: "country",   parent: "Flanaess",  notes: "A powerful and chivalric kingdom in the central Flanaess, long a bulwark against the spreading evil of Iuz.", tags: ["good", "kingdom"] },
    { name: "Veluna",                           location_type: "country",   parent: "Flanaess",  notes: "A theocratic nation devoted to Rao, god of peace and reason — closely allied with Furyondy.", tags: ["theocracy", "good", "rao"] },
    { name: "Nyrond",                           location_type: "country",   parent: "Flanaess",  notes: "A large and once-proud kingdom in the eastern Flanaess, frequently beset by wars and internal strife.", tags: ["kingdom", "east"] },
    { name: "Iuz",                              location_type: "country",   parent: "Flanaess",  notes: "The evil empire of the cambion demigod Iuz the Old, spanning the north-central Flanaess.", tags: ["evil", "demigod", "empire"] },
    { name: "The Great Kingdom",                location_type: "country",   parent: "Flanaess",  notes: "A vast and crumbling empire in the east, once dominant, now corrupt and fractured into tyrant states.", tags: ["empire", "east", "corrupt"] },
    { name: "Keoland",                          location_type: "country",   parent: "Flanaess",  notes: "A once-great southern kingdom, now content to dominate regional trade.", tags: ["south", "kingdom", "trade"] },
    { name: "Castle Greyhawk",                  location_type: "dungeon",   parent: "City of Greyhawk", notes: "The legendary ruins of the wizard Zagig Yragerne's castle — a classic megadungeon with dozens of levels.", tags: ["megadungeon", "zagig", "ruins", "classic"] },
    { name: "Temple of Elemental Evil",         location_type: "dungeon",   parent: "Verbobonc", notes: "A notorious dungeon built atop a node of pure elemental chaos, once used to summon Zuggtmoy the Demon Queen.", tags: ["classic", "zuggtmoy", "elemental"] },
    { name: "Tomb of Horrors",                  location_type: "dungeon",   parent: "Flanaess",  notes: "The near-inescapable death trap dungeon of Acererak the archlich — the original killer dungeon.", tags: ["acererak", "lich", "classic", "deathtrap"] },
    { name: "Barrier Peaks",                    location_type: "wilderness",parent: "Flanaess",  notes: "A mountain range on the western edge of the Flanaess, rumoured to hold the wreck of a star-vessel.", tags: ["mountains", "west"] },
    { name: "Crystalmist Mountains",            location_type: "wilderness",parent: "Flanaess",  notes: "The highest mountain range on the Flanaess, home to cloud giants, fire giants, and the Vault of the Drow.", tags: ["mountains", "giants", "drow"] },
    { name: "Nyr Dyv",                          location_type: "wilderness",parent: "Flanaess",  notes: "The Lake of Unknown Depths — a vast inland lake at the heart of the Flanaess.", tags: ["lake", "central", "mysterious"] },
  ],

  heroes: [
    {
      name: "Mordenkainen",
      race: "Human",
      alignment: "True Neutral",
      occupation: "Archmage",
      personality: "Aloof, calculating, and utterly devoted to maintaining the balance of power between good and evil — not because he favours goodness, but because he believes imbalance leads to ruin. He is brilliant, condescending, and occasionally more dangerous than the problems he claims to solve.",
      backstory: "The most powerful wizard in the Flanaess and leader of the Circle of Eight — a group of archmages who work behind the scenes to prevent any single power from dominating the world. Mordenkainen's famous spells bear his name across every world.",
      status: "alive",
      relationship: "neutral",
      portrait_url: null,
      tags: ["circle of eight", "archmage", "balance", "city of greyhawk"],
    },
    {
      name: "Bigby",
      race: "Human",
      alignment: "Neutral Good",
      occupation: "Archmage / Circle of Eight",
      personality: "More warmly human than his master Mordenkainen — Bigby genuinely cares about the people affected by the Circle's abstract power games. He is thoughtful and reluctant to use his terrible power, but formidable when pushed.",
      backstory: "Once a thief's apprentice and then a servant of the evil wizard Leomund, Bigby was freed and mentored by Mordenkainen. He created his famous series of hand spells. Now a member of the Circle of Eight, he quietly advocates for more direct action against evil.",
      status: "alive",
      relationship: "ally",
      portrait_url: null,
      tags: ["circle of eight", "archmage", "city of greyhawk", "bigby's hand"],
    },
    {
      name: "Tasha (Iggwilv)",
      race: "Human",
      alignment: "Chaotic Evil",
      occupation: "Archmage / Demonologist / Witch Queen",
      personality: "Brilliant, terrifying, and completely amoral. Iggwilv views everyone as a tool or an obstacle. She has enslaved demon lords, toppled kingdoms, and outlived most of her enemies — and she finds this delightful.",
      backstory: "Known by many names, including Natasha and Tasha. An apprentice of Zagig Yragerne who eventually surpassed her master. Iggwilv conquered Perrenland, authored the Demonomicon, and imprisoned the demon lord Graz'zt — whom she later took as a consort.",
      status: "alive",
      relationship: "enemy",
      portrait_url: null,
      tags: ["witch queen", "demonologist", "demonomicon", "perrenland", "graz'zt"],
    },
    {
      name: "Jallarzi Sallavarian",
      race: "Human",
      alignment: "Neutral Good",
      occupation: "Archmage / Circle of Eight",
      personality: "Warm, principled, and the moral compass of the Circle of Eight. Jallarzi is less interested in abstract balance than in the actual wellbeing of people. She is well-loved and deeply trusted — which makes her a target.",
      backstory: "The newest and most idealistic member of the Circle of Eight, Jallarzi represents a more humane approach to arcane power politics. She works to ensure the Circle's decisions consider the cost to ordinary people.",
      status: "alive",
      relationship: "ally",
      portrait_url: null,
      tags: ["circle of eight", "archmage", "city of greyhawk"],
    },
    {
      name: "Iuz the Old",
      race: "Cambion",
      alignment: "Chaotic Evil",
      occupation: "Demigod / Tyrant",
      personality: "Ancient, sadistic, and possessed of a demigod's patience. Iuz delights in cruelty and instability. He is not merely evil — he is invested in suffering as an art form.",
      backstory: "The half-fiend son of the demon lord Graz'zt and the witch Iggwilv, Iuz built a kingdom through conquest and atrocity. He was once imprisoned by Zagig Yragerne but broke free, and his empire now threatens the peace of the entire Flanaess.",
      status: "alive",
      relationship: "enemy",
      portrait_url: null,
      tags: ["demigod", "tyrant", "cambion", "graz'zt", "iggwilv"],
    },
  ],
};
