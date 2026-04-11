import type { DndSettingDef } from "./types";

export const spelljammerSetting: DndSettingDef = {
  id: "spelljammer",
  label: "Spelljammer",

  defaultAiPrompt:
    "Space swashbuckling fantasy where the void is the ocean. The dominant palette is deep void black broken by nebula purples and golds, crystal sphere iridescence, ship-lantern amber, and bioluminescent creature glow. " +
    "Ships are practical and fantastical at once — wood, hemp rope, and brass fittings scaled up to ocean-vessel size, with a spelljammer helm at the heart and siege ballistas on the rails. Show wear: salt-equivalent asteroid dust, scorch marks, patched hull planks. " +
    "Wildspace gravity is personal to each object — show crew walking on hull exteriors, cargo floating between ships on transfer lines, a battle where up and down mean nothing. " +
    "Characters reflect the diversity of a hundred crystal spheres: giff in military surplus with firearms, thri-kreen merchants clicking across asteroid markets, astral elves in silver that never tarnishes, hadozee rigging-runners hanging from everything. " +
    "The Rock of Bral should feel like a port city built on the underside of a mountain — cramped, cosmopolitan, smelling of strange spices and engine oil and ozone. " +
    "The Astral Sea is silver-white infinity with god-isles drifting like continents, githyanki silver citadels visible in the middle distance, and the occasional dead god's corpse large enough to build a city on. " +
    "Keep the mood adventurous, strange, and wide-open — danger is real but the wonder is bigger.",

  calendar: {
    name: "Spelljammer (Bral Standard Year)",
    epochName: "SY",
    defaultYear: 5048,
    weekStyle: "weekly",
    dayLabels: ["Helm", "Keel", "Mast", "Rig", "Void", "Port", "Star"],
    months: [
      { name: "Starrise",   alias: "New Voyage",     days: 30 },
      { name: "Coldvoid",   alias: "The Long Dark",  days: 30 },
      { name: "Windtack",   alias: "Sailing Season", days: 30 },
      { name: "Brightburn", alias: "Sun-Facing",     days: 30 },
      { name: "Spelltide",  alias: "The Convergence",days: 30 },
      { name: "Higharch",   alias: "Midsphere",      days: 30 },
      { name: "Driftmonth", alias: "The Quiet Drift",days: 30 },
      { name: "Emberfall",  alias: "Cooling Season", days: 30 },
      { name: "Stargather", alias: "The Counting",   days: 30 },
      { name: "Grayreach",  alias: "The Long Haul",  days: 30 },
      { name: "Deepvoid",   alias: "Dead Reckoning", days: 30 },
      { name: "Returntide", alias: "Homeport",       days: 30 },
    ],
    intercalaryDays: [
      { name: "Void Day",                afterMonth: 3,  description: "A traditional rest day observed by Spelljammer crews — no navigation, no cargo handling. Ships drift and crews share stories of distant spheres." },
      { name: "Great Market",            afterMonth: 6,  description: "The annual festival on the Rock of Bral. Ships from dozens of crystal spheres gather to trade, race spelljammers, and seek new crew." },
      { name: "Night of Shooting Stars", afterMonth: 9,  description: "A single night when an unusual number of meteors streak across every crystal sphere. Navigators use it to verify star charts." },
    ],
    leapYearRule: "none",
  },

  locations: [
    { name: "Wildspace",            location_type: "plane",    notes: "The void between worlds within a crystal sphere — breathable air, minimal gravity, and the endless dark between planets and moons.", tags: ["void", "crystal sphere", "space"] },
    { name: "The Astral Sea",       location_type: "plane",    notes: "The silvery sea between crystal spheres, navigated by Spelljammer ships. Githyanki patrol these waters from their silver citadels.", tags: ["astral", "githyanki", "between spheres"] },
    { name: "Rock of Bral",         location_type: "city",     parent: "Wildspace",  notes: "The most famous asteroid city in the known spheres — a neutral port city, pirate haven, and great crossroads of Spelljammer trade.", tags: ["asteroid", "port", "pirates", "neutral"] },
    { name: "Spelljammer Academy",  location_type: "building", parent: "Rock of Bral",notes: "The foremost school for spelljammer pilots and crew — recruits are tested in void simulations and live-fire asteroid navigation drills.", tags: ["academy", "training", "pilots"] },
    { name: "Realmspace",           location_type: "plane",    parent: "Wildspace",  notes: "The crystal sphere containing Toril (Forgotten Realms) and several other worlds and moons.", tags: ["crystal sphere", "toril", "forgotten realms"] },
    { name: "Toril",                location_type: "world",    parent: "Realmspace", notes: "The Forgotten Realms world — Faerûn, Kara-Tur, Maztica. A favoured destination for Spelljammer voyagers.", tags: ["forgotten realms", "faerun"] },
    { name: "Greyspace",            location_type: "plane",    parent: "Wildspace",  notes: "The crystal sphere containing Oerth (Greyhawk). Known for its amber sun and many inhabited moons.", tags: ["crystal sphere", "oerth", "greyhawk"] },
    { name: "Oerth",                location_type: "world",    parent: "Greyspace",  notes: "The world of Greyhawk — a world with a rich tradition of arcane magic and a long history of wars.", tags: ["greyhawk", "flanaess", "mordenkainen"] },
    { name: "Krynnspace",           location_type: "plane",    parent: "Wildspace",  notes: "The crystal sphere containing Krynn (Dragonlance). Unusual for its three moons — Solinari, Lunitari, and Nuitari.", tags: ["crystal sphere", "krynn", "dragonlance", "three moons"] },
    { name: "Krynn",                location_type: "world",    parent: "Krynnspace", notes: "The Dragonlance world — Ansalon, the War of the Lance, the Conclave of Wizards. Somewhat suspicious of off-world visitors.", tags: ["dragonlance", "ansalon", "war of the lance"] },
    { name: "Radiant Citadel",      location_type: "city",     parent: "The Astral Sea", notes: "A city built on a shard of a long-dead civilization in the Ethereal Plane — a meeting point for many cultures with no other common ground.", tags: ["radiant citadel", "ethereal plane", "cultures", "neutral"] },
    { name: "The Void",             location_type: "wilderness",parent: "Wildspace", notes: "Open Wildspace between stars and crystal spheres — the breathable-but-cold empty space that Spelljammer vessels sail through.", tags: ["open space", "navigation", "danger"] },
  ],

  heroes: [
    {
      name: "Prince Anton of Bral",
      race: "Human",
      alignment: "Neutral",
      occupation: "Prince / Administrator of the Rock of Bral",
      personality: "Pragmatic, politically savvy, and genuinely committed to the Rock's neutrality. Anton knows everyone who matters in Bral and uses that knowledge to keep the asteroid from becoming a battlefield. He is neither warm nor cold — just practical.",
      backstory: "The ruling prince of the Rock of Bral, the most important port in Wildspace. He has held the city together through pirate attacks, neogi trade wars, and githyanki territorial disputes. He maintains peace through favours owed and promises carefully kept.",
      status: "alive",
      relationship: "neutral",
      portrait_url: null,
      tags: ["rock of bral", "administrator", "prince", "neutral"],
    },
    {
      name: "Aelrindel",
      race: "Astral Elf",
      alignment: "Lawful Neutral",
      occupation: "Navigator / Spelljammer Pilot",
      personality: "Precise, patient, and slightly contemptuous of those who cannot read the stars. Aelrindel has sailed the Astral Sea for centuries and carries himself with the quiet authority of someone who has never been truly lost.",
      backstory: "A veteran astral elf navigator who now hires out her expertise to merchantmen and explorers. She left the Astral Elves' silver citadels after a disagreement about a route that got half a crew killed — an event she has never fully forgiven herself for.",
      status: "alive",
      relationship: "ally",
      portrait_url: null,
      tags: ["astral elf", "navigator", "pilot", "spelljammer"],
    },
    {
      name: "Commodore Kreel",
      race: "Giff",
      alignment: "Lawful Neutral",
      occupation: "Mercenary Captain",
      personality: "Thunderously loud, obsessed with firearms and military protocol, and possessed of an honour code that would shame a paladin. Kreel keeps his word to the letter even when it costs him. He is not subtle. He is extremely effective.",
      backstory: "The commander of a giff mercenary company that takes contracts across Wildspace — escort, security, retrieval, and the occasional 'liberation'. His company has an impeccable record and rates to match. He is distantly searching for the Giff homeworld, which no living giff has ever seen.",
      status: "alive",
      relationship: "neutral",
      portrait_url: null,
      tags: ["giff", "mercenary", "captain", "firearms"],
    },
    {
      name: "Sserket",
      race: "Thri-kreen",
      alignment: "True Neutral",
      occupation: "Merchant / Void Trader",
      personality: "Patient on a scale humans find unsettling. Sserket communicates through clicks, gesture, and a translator-stone; she finds most conversations refreshingly short. She is scrupulously honest in trade and will not tolerate deception from others.",
      backstory: "A thri-kreen merchant who operates a trading vessel called the Carapace between several crystal spheres, specialising in biological curiosities and alchemical supplies. She travels with a small crew of her clutch-kin and has no interest in politics unless they affect trade routes.",
      status: "alive",
      relationship: "neutral",
      portrait_url: null,
      tags: ["thri-kreen", "merchant", "trader", "wildspace"],
    },
    {
      name: "Mirt the Moneylender",
      race: "Human",
      alignment: "Chaotic Good",
      occupation: "Merchant / Harper Agent",
      personality: "Corpulent, jolly, and far more dangerous than he looks. Mirt made his fortune in Waterdeep and now spreads it across the spheres, always keeping one eye out for Harper interests and one eye on the bottom line.",
      backstory: "A legendary figure from Waterdeep who discovered Spelljammer travel late in life and found it to his liking. He operates as a trader and Harper informant across Realmspace and beyond, financing expeditions he considers worthwhile.",
      status: "alive",
      relationship: "ally",
      portrait_url: null,
      tags: ["waterdeep", "harper", "merchant", "realmspace"],
    },
  ],
};
