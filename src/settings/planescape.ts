import type { DndSettingDef } from "./types";

export const planescapeSetting: DndSettingDef = {
  id: "planescape",
  label: "Planescape",

  defaultAiPrompt:
    "Strange, layered, cosmopolitan fantasy where nothing is normal and everything has a philosophy behind it. Sigil's palette is smoked stone, faction colours, portal-shimmer, and the glow of a thousand exotic light sources — no two blocks look the same. " +
    "Characters are radically diverse: tieflings with every horn shape imaginable, githzerai in wrapped linen and discipline, bariaur, modrons on errands, a dabus floating silently past trailing rebuses. Faction insignia should be visible and meaningful. " +
    "Architecture is impossible gothic — buttresses that support nothing, stairs that change direction mid-flight, buildings that share a wall with a portal to Mechanus. Everything has been repaired, modified, and graffitied by a thousand tenants. " +
    "The planes bleed through: the floor near an Abyss portal smells of sulphur and feels slightly wrong underfoot; a Celestia-aligned district has cleaner air and uncomfortably earnest locals. Use these details. " +
    "Portals should be visually distinct — not generic glowing circles but unique: a particular door at a particular angle, a specific window at noon, a crack in a certain wall. " +
    "Creatures from lower planes should feel genuinely malevolent and alien; upper-plane beings should feel uncomfortably perfect. Yugoloths look like they're calculating the cost of your soul. " +
    "Keep the mood weird, street-level, and philosophically loaded — even a simple alley has an argument happening in it.",

  calendar: {
    name: "Planescape (Planar Common Reckoning)",
    epochName: "PCR",
    defaultYear: 570,
    weekStyle: "weekly",
    dayLabels: ["Prime", "Bleaker", "Guvner", "Cipher", "Signer", "Sensate", "Deadday"],
    months: [
      { name: "Primum",     alias: "The Opening",     days: 30 },
      { name: "Internum",   alias: "The Seeking",     days: 30 },
      { name: "Tertium",    alias: "The Debating",    days: 30 },
      { name: "Quartum",    alias: "The Arguing",     days: 30 },
      { name: "Quintum",    alias: "The Reckoning",   days: 30 },
      { name: "Sextum",     alias: "The Convergence", days: 30 },
      { name: "Septimum",   alias: "The Midtide",     days: 30 },
      { name: "Octavum",    alias: "The Wandering",   days: 30 },
      { name: "Nonum",      alias: "The Returning",   days: 30 },
      { name: "Decimum",    alias: "The Closing",     days: 30 },
      { name: "Undecimum",  alias: "The Silence",     days: 30 },
      { name: "Duodecimum", alias: "The Reckoning",   days: 30 },
    ],
    intercalaryDays: [
      { name: "Day of Factions",   afterMonth: 3,  description: "A day when the great factions of Sigil hold open debates in the Hall of Speakers. Recruitment is aggressive; newcomers are wise to choose a side." },
      { name: "Great Bazaar Day",  afterMonth: 6,  description: "A planar market day when portals to every known trading plane cycle open in the Great Bazaar. The most exotic goods in the multiverse change hands." },
      { name: "Day of the Lady",   afterMonth: 9,  description: "A day of enforced quiet in Sigil. No faction meetings. No public violence. The Lady of Pain's dabus scrub the streets. No one asks why." },
      { name: "Convergence",       afterMonth: 12, description: "The year's end festival, when planar travellers across the multiverse gather debts, settle old scores, and begin new ventures." },
    ],
    leapYearRule: "none",
  },

  locations: [
    { name: "The Outlands",      location_type: "plane",    notes: "The Great Wheel's hub — a ring-shaped outer plane of perfect neutral balance, with the Spire rising from its centre.", tags: ["outer planes", "true neutral", "the spire"] },
    { name: "Sigil",             location_type: "city",     parent: "The Outlands",   notes: "The City of Doors — a torus-shaped city atop the Spire, accessible from any plane via portals. Governed by the Lady of Pain.", tags: ["city of doors", "lady of pain", "portals", "factions"] },
    { name: "The Great Bazaar",  location_type: "district", parent: "Sigil",          notes: "Sigil's largest market, where merchants from across the multiverse buy and sell everything from spell components to bottled demons.", tags: ["market", "trade", "merchants"] },
    { name: "The Cage",          location_type: "district", parent: "Sigil",          notes: "Street slang for Sigil itself — the city that traps even gods. No deity can enter; the Lady keeps them out.", tags: ["sigil", "slang", "no gods"] },
    { name: "The Spire",         location_type: "wilderness",parent: "The Outlands",  notes: "An impossibly tall pillar rising from the centre of the Outlands, atop which sits Sigil. Magic weakens the closer one climbs.", tags: ["spire", "antimagic", "outlands"] },
    { name: "Tradegate",         location_type: "city",     parent: "The Outlands",   notes: "A gate-town to Mechanus, known for its honest merchants and the Great Wheel trading guilds headquartered here.", tags: ["gate-town", "mechanus", "trade"] },
    { name: "Plague-Mort",       location_type: "town",     parent: "The Outlands",   notes: "The gate-town to the Abyss — a chaotic, violent settlement constantly on the verge of being pulled into the lower planes.", tags: ["gate-town", "abyss", "chaotic evil"] },
    { name: "Ribcage",           location_type: "city",     parent: "The Outlands",   notes: "The gate-town to Baator (Nine Hells) — a heavily fortified city-state ruled by iron-fisted lawful-evil overlords.", tags: ["gate-town", "nine hells", "lawful evil"] },
    // Transitive planes
    { name: "The Astral Plane",   location_type: "plane",   notes: "A silvery void connecting all planes. Home to githyanki silver cities and the drifting god-isles of long-dead deities.", tags: ["transitive", "astral", "githyanki"] },
    { name: "The Ethereal Plane", location_type: "plane",   notes: "A misty borderland coexisting with the Material Plane, used by ghosts and travelers passing between inner and outer planes.", tags: ["transitive", "ethereal", "ghosts"] },
    { name: "The Feywild",        location_type: "plane",   notes: "The Plane of Faerie — a mirror of the Material Plane suffused with wild magic, beauty, and danger. Home to the Seelie and Unseelie Courts.", tags: ["feywild", "fey", "archfey", "seelie", "unseelie"] },
    { name: "The Shadowfell",     location_type: "plane",   notes: "The Plane of Shadow — a dark reflection of the Material Plane where all colour drains to grey.", tags: ["shadowfell", "shadow", "raven queen", "shadar-kai"] },
    // Inner planes
    { name: "Elemental Plane of Fire",  location_type: "plane", notes: "A plane of endless conflagration, home to the City of Brass and the efreeti sultans.", tags: ["inner planes", "fire", "efreeti", "city of brass"] },
    { name: "Elemental Plane of Water", location_type: "plane", notes: "A boundless ocean with no surface, home to marids and the coral cities of the Elemental Court of Water.", tags: ["inner planes", "water", "marids"] },
    { name: "Elemental Plane of Earth", location_type: "plane", notes: "An infinite mass of rock and crystal tunnels. Home to dao, xorn, and vast underground kingdoms.", tags: ["inner planes", "earth", "dao"] },
    { name: "Elemental Plane of Air",   location_type: "plane", notes: "A limitless sky with no ground, home to djinn, aarakocra, and the floating cities of the djinn sultans.", tags: ["inner planes", "air", "djinn", "aarakocra"] },
    // Outer planes — upper
    { name: "Mount Celestia",  location_type: "plane", notes: "The Seven Heavens — a shining plane of absolute law and good, home to archons and the souls of the most virtuous.", tags: ["upper planes", "lawful good", "archons"] },
    { name: "Arborea",         location_type: "plane", notes: "The Olympian Glades — a chaotic good plane of wild beauty and passion. Home to elven gods and their divine servants.", tags: ["upper planes", "chaotic good", "elves"] },
    { name: "Elysium",         location_type: "plane", notes: "A neutral good plane of perfect peace and rest. Home of departed good souls and the birthplace of guardinals.", tags: ["upper planes", "neutral good", "guardinals"] },
    { name: "Ysgard",          location_type: "plane", notes: "The Heroic Domains — a plane of eternal battle and glory, home to Norse-inspired gods, giants, and the honored slain.", tags: ["upper planes", "chaotic good", "giants", "norse"] },
    // Outer planes — lower
    { name: "The Nine Hells",  location_type: "plane", notes: "Baator — nine layers of lawful evil dominated by archdevils. Avernus down through Nessus (Asmodeus).", tags: ["lower planes", "lawful evil", "devils", "asmodeus"] },
    { name: "Avernus",         location_type: "plane", parent: "The Nine Hells", notes: "The first layer of the Nine Hells, ruled by Zariel. A blasted hellscape of endless war between demons and devils.", tags: ["nine hells", "zariel", "devils", "war"] },
    { name: "The Abyss",       location_type: "plane", notes: "An infinite layered plane of pure chaos and evil, home to the tanar'ri demons. Each layer is a different demon lord's domain.", tags: ["lower planes", "chaotic evil", "demons", "tanar'ri"] },
    { name: "Gehenna",         location_type: "plane", notes: "The Bleak Eternity — a plane of volcanic mountainsides, where yugoloths sell their services to both sides of the Blood War.", tags: ["lower planes", "neutral evil", "yugoloths"] },
    { name: "Hades",           location_type: "plane", notes: "The Gray Waste — three bleak grey layers where all emotion drains away. Home to larvae.", tags: ["lower planes", "neutral evil", "gray waste"] },
    { name: "Mechanus",        location_type: "plane", notes: "Infinite interlocking clockwork gears — a plane of absolute law and order, ruled by modrons and the god Primus.", tags: ["outer planes", "lawful neutral", "modrons", "clockwork"] },
    { name: "Limbo",           location_type: "plane", notes: "The Ever-Changing Chaos — a roiling soup of unformed matter that slaadi and githzerai monks shape by willpower alone.", tags: ["outer planes", "chaotic neutral", "slaadi", "githzerai"] },
  ],

  heroes: [
    {
      name: "The Lady of Pain",
      race: "Unknown",
      alignment: "True Neutral",
      occupation: "Ruler of Sigil",
      personality: "The Lady does not speak. She floats silently through Sigil's streets on her dabus. Those who displease her are mazed — imprisoned in a pocket dimension — or flayed alive where they stand. Her motivations are completely unknowable. Do not pray to her. Do not make eye contact.",
      backstory: "The absolute ruler of Sigil and the most powerful entity in the city. She keeps all gods out of Sigil and maintains the city's neutrality through sheer terror. Her origins are unknown. Her purpose is unknown. She has existed for as long as Sigil itself.",
      status: "alive",
      relationship: "neutral",
      portrait_url: null,
      tags: ["sigil", "ruler", "mysterious", "unknowable", "dabus"],
    },
    {
      name: "Fall-from-Grace",
      race: "Tiefling (Succubus)",
      alignment: "Neutral Good",
      occupation: "Proprietor of the Brothel for Slaking Intellectual Lusts",
      personality: "Serene, philosophical, and possessing a rare quality in Sigil — genuine kindness. Grace has renounced her fiendish nature and found that wisdom and compassion are more interesting than temptation. She is soft-spoken and absolutely deadly in combat.",
      backstory: "A succubus who rejected the Abyss and took paladin vows — or something close to them. She runs an establishment in Sigil dedicated to satisfying the mind rather than the body. She is a member of the Society of Sensation and a genuine moral force in the city.",
      status: "alive",
      relationship: "ally",
      portrait_url: null,
      tags: ["sigil", "succubus", "paladin", "sensates", "tiefling"],
    },
    {
      name: "Shemeshka the Marauder",
      race: "Arcanaloth",
      alignment: "Neutral Evil",
      occupation: "Information Broker / Crime Lord",
      personality: "Theatrical, vain, and extraordinarily dangerous. Shemeshka presents herself as a gracious and sophisticated merchant of secrets — which she is — while concealing a predator's patience and a yugoloth's utter lack of conscience. She knows everyone's price.",
      backstory: "The most powerful information broker in Sigil, Shemeshka has her fingers in every pie and her claws around every throat. She is old, rich, and paranoid in equal measure. Dealing with her is profitable and extremely risky.",
      status: "alive",
      relationship: "neutral",
      portrait_url: null,
      tags: ["sigil", "arcanaloth", "information broker", "yugoloth", "villain"],
    },
    {
      name: "Factol Rhys of the Transcendent Order",
      race: "Human (Tiefling heritage)",
      alignment: "True Neutral",
      occupation: "Factol of the Transcendent Order (Ciphers)",
      personality: "Swift, decisive, and utterly present — Rhys embodies the Cipher philosophy that thought and action are one. She rarely explains her decisions because her body has already made them. She is not unkind; she simply doesn't have time for hesitation.",
      backstory: "The leader of the Transcendent Order — Ciphers — who believe that acting without thought is the highest form of consciousness. Rhys reached this enlightenment through decades of rigorous training. She remains one of the deadliest fighters in Sigil.",
      status: "alive",
      relationship: "neutral",
      portrait_url: null,
      tags: ["sigil", "ciphers", "transcendent order", "factol", "martial"],
    },
    {
      name: "Morte",
      race: "Undead (Floating Skull)",
      alignment: "Chaotic Neutral",
      occupation: "Companion / Insult Artist",
      personality: "Wisecracking, cowardly, fiercely loyal, and possessed of an extraordinary vocabulary of barbs. Morte pretends everything is a joke because admitting anything matters is more frightening than the Abyss.",
      backstory: "A floating talking skull of unknown origin who has served as a companion to countless amnesiac travellers through the planes. His true history is darker than his patter suggests. He knows more than he lets on — about everything.",
      status: "alive",
      relationship: "ally",
      portrait_url: null,
      tags: ["sigil", "skull", "companion", "undead", "nameless one"],
    },
  ],
};
