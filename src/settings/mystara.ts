import type { DndSettingDef } from "./types";

export const mystaraSetting: DndSettingDef = {
  id: "mystara",
  label: "Mystara",

  defaultAiPrompt:
    "Classic adventure fantasy with a bright, culturally varied palette — Thyatian marble white and imperial crimson, Karameikan frontier timber and muddy roads, Glantrian arcane purples and brass, dwarven Rockhome grey granite and forge-orange, elven Alfheim silver-green. " +
    "Each kingdom has a distinct visual identity — lean into historical analogues. Thyatian soldiers wear segmented armour and carry pilums; Karameikan adventurers look like frontier explorers in mismatched practical gear; Glantrian wizards dress for ceremony and status. " +
    "Magic is present but not ubiquitous — a wizard's tower stands out in a village, magical items are notable, and in Glantri specifically, magic is clearly the highest social currency. In Karameikos, the wilderness is more immediate than any spell. " +
    "Dungeons and ruins predate the current kingdoms — show older civilisation in the stonework, Traladan pictographs beneath Thyatian plaster, dwarven mason marks on what is now an elven road. History is physical here. " +
    "Characters should feel like people from specific places — a Thyatian soldier carries Imperial swagger, a Traladan elder carries quiet resentment, a Glantrian noble carries entitlement and a scroll case. " +
    "The overall mood is optimistic and adventurous with real stakes — a good world to explore, full of secrets but not fundamentally broken.",

  calendar: {
    name: "Mystara (Thyatian Calendar)",
    epochName: "AC",
    defaultYear: 1000,
    weekStyle: "weekly",
    dayLabels: ["Lunadain", "Gromdain", "Tserdain", "Moldain", "Nytdain", "Lorelain", "Soladain"],
    months: [
      { name: "Nuwmont",   alias: "New Month",    days: 28 },
      { name: "Vatermont", alias: "Deep Winter",  days: 28 },
      { name: "Thaumont",  alias: "Early Spring", days: 28 },
      { name: "Flaurmont", alias: "Spring Bloom", days: 28 },
      { name: "Yarthmont", alias: "Late Spring",  days: 28 },
      { name: "Klarmont",  alias: "Early Summer", days: 28 },
      { name: "Felmont",   alias: "High Summer",  days: 28 },
      { name: "Fyrmont",   alias: "Late Summer",  days: 28 },
      { name: "Ambyrmont", alias: "Early Autumn", days: 28 },
      { name: "Sviftmont", alias: "Mid Autumn",   days: 28 },
      { name: "Eirmont",   alias: "Late Autumn",  days: 28 },
      { name: "Kaldmont",  alias: "Deep Winter",  days: 28 },
    ],
    intercalaryDays: [
      { name: "Festival of Thaumont", afterMonth: 2,  description: "A spring festival welcoming the new growing season, celebrated with fairs and the blessing of fields by Thyatian priests." },
      { name: "Midsummer Festival",   afterMonth: 6,  description: "The great summer celebration — jousting, bardic competitions, and the renewal of noble oaths across the Known World." },
      { name: "Harvest Festival",     afterMonth: 9,  description: "A four-day harvest celebration observed throughout the Known World. Trade caravans converge on market cities." },
      { name: "Kaldmont Festival",    afterMonth: 12, description: "The midwinter feast and gift-giving tradition that closes the Thyatian year. Nobles open their halls to the poor; temples offer free meals." },
    ],
    leapYearRule: "none",
  },

  locations: [
    { name: "Mystara",                    location_type: "world",    notes: "A hollow world with an inner sun. The outer surface hosts the Known World; the Hollow World inside preserves lost civilisations.", tags: ["hollow world", "inner sun", "known world"] },
    { name: "Known World",                location_type: "continent",parent: "Mystara",            notes: "The primary continent of Mystara's outer surface — a densely packed collection of rival kingdoms drawing on broad historical cultures.", tags: ["outer surface", "known world", "kingdoms"] },
    { name: "Thyatis Empire",             location_type: "country",  parent: "Known World",        notes: "The dominant empire of the Known World, modelled on ancient Rome. Controls much of the eastern sea.", tags: ["empire", "roman", "military", "senate"] },
    { name: "Thyatis City",               location_type: "city",     parent: "Thyatis Empire",     notes: "The capital of the Thyatian Empire — a grand metropolis of coliseums, forums, and marble temples.", tags: ["capital", "coliseum", "politics", "roman"] },
    { name: "Grand Duchy of Karameikos",  location_type: "country",  parent: "Known World",        notes: "A frontier duchy ruled by Duke Stefan Karameikos. Adventurers find opportunity here; the wilderness is full of dungeons and ruins.", tags: ["frontier", "karameikos", "stefan", "traldar"] },
    { name: "Specularum",                 location_type: "city",     parent: "Grand Duchy of Karameikos", notes: "The capital of Karameikos (later renamed Mirros). A busy port where Thyatian colonists and native Traladarans coexist in uneasy proximity.", tags: ["capital", "port", "traldar", "thyatian"] },
    { name: "Glantri",                    location_type: "country",  parent: "Known World",        notes: "A principality ruled by a Council of Princes — all of whom are wizards. Clerics are outlawed here.", tags: ["wizards", "no clerics", "magic", "princes"] },
    { name: "Glantri City",               location_type: "city",     parent: "Glantri",            notes: "The capital of Glantri — built over magical canals, with a grand Wizard's Tower at its heart.", tags: ["wizards", "canals", "great school", "magic"] },
    { name: "Rockhome",                   location_type: "country",  parent: "Known World",        notes: "The dwarven nation — a heavily fortified mountain kingdom of clan halls, forge-temples, and ancient grudges.", tags: ["dwarves", "mountains", "clans", "smithing"] },
    { name: "Alfheim",                    location_type: "country",  parent: "Known World",        notes: "The elven nation — a forested land of ancient trees and elven clans, protected by the Tree of Life.", tags: ["elves", "forest", "tree of life", "clans"] },
    { name: "Ierendi",                    location_type: "country",  parent: "Known World",        notes: "An island nation south of Karameikos — nominally a monarchy where the rulers are chosen by tournament.", tags: ["islands", "tournament", "trade", "adventurers"] },
    { name: "Darokin",                    location_type: "country",  parent: "Known World",        notes: "A merchant republic with no hereditary nobility — wealth is rank. The Darokin Diplomatic Corps maintains relations with every nation.", tags: ["merchants", "republic", "diplomacy", "wealth"] },
    { name: "The Hollow World",           location_type: "plane",    parent: "Mystara",            notes: "The inner surface of Mystara — a vast continent lit by an inner sun, where the Immortals preserve civilisations erased from the outer world.", tags: ["hollow world", "immortals", "preserved civilizations", "inner sun"] },
  ],

  heroes: [
    {
      name: "Duke Stefan Karameikos",
      race: "Human",
      alignment: "Lawful Good",
      occupation: "Duke / Ruler of Karameikos",
      personality: "Idealistic, honourable, and occasionally naive about the entrenched resentments his colonisation of Traladaran lands has created. Stefan genuinely wants to build a just and prosperous duchy — he is simply doing it on top of someone else's home.",
      backstory: "A Thyatian noble who traded his family lands in Thyatis for the territory of Traladara, which he renamed Karameikos. He imported Thyatian colonists and has been trying ever since to build a unified duchy that respects both Thyatian and Traladan cultures — with mixed results.",
      status: "alive",
      relationship: "ally",
      portrait_url: null,
      tags: ["karameikos", "duke", "thyatian", "ruler", "frontier"],
    },
    {
      name: "Aleena",
      race: "Human",
      alignment: "Lawful Good",
      occupation: "Cleric of Halav",
      personality: "Warm, brave, and utterly committed to the wellbeing of those around her. Aleena is the kind of person who runs toward trouble rather than away from it. She has excellent healing spells and a quick laugh.",
      backstory: "A young cleric who adventured alongside a beginning adventurer in the ruins near Threshold. She is patient with newcomers to the adventuring life and has a gift for explaining the basics of dungeon survival without making people feel foolish for not knowing.",
      status: "alive",
      relationship: "ally",
      portrait_url: null,
      tags: ["cleric", "halav", "karameikos", "classic", "threshold"],
    },
    {
      name: "Bargle the Infamous",
      race: "Human",
      alignment: "Chaotic Evil",
      occupation: "Wizard / Outlaw",
      personality: "Clever, vain, and utterly convinced that his intellect entitles him to whatever he wants. Bargle is not stupid — he is dangerous. He is also deeply petty and will pursue a grudge long past the point of reason.",
      backstory: "A renegade wizard who operates out of the Caves of Chaos near Threshold. He is responsible for the death of at least one beloved NPC and has evaded justice for years through a combination of cunning and teleportation. He serves a Thyatian noble faction that finds his chaos useful.",
      status: "alive",
      relationship: "enemy",
      portrait_url: null,
      tags: ["wizard", "outlaw", "karameikos", "villain", "classic"],
    },
    {
      name: "Princess Adriana Karameikos",
      race: "Human",
      alignment: "Neutral Good",
      occupation: "Princess / Adventurer",
      personality: "Sharp, politically aware, and frustrated by the constraints placed on her as a royal woman. Adriana has more military ability than most of her father's knights and is quietly determined to prove it.",
      backstory: "The daughter of Duke Stefan Karameikos, raised between two cultures (Thyatian nobility and Traladan tradition). She secretly admires adventurers and has been known to disguise herself to go on expeditions — a fact that gives the palace guard grey hair.",
      status: "alive",
      relationship: "ally",
      portrait_url: null,
      tags: ["karameikos", "princess", "royal", "adventurer"],
    },
    {
      name: "Retameron Antonic",
      race: "Human",
      alignment: "Lawful Good",
      occupation: "Knight / Caravan Guard Captain",
      personality: "Steady, professional, and deeply loyal to those who have earned his trust. Retameron is not exciting. He is dependable in the way that a good sword or a well-built bridge is dependable. In Karameikos, that is worth more than excitement.",
      backstory: "A veteran Thyatian knight who came to Karameikos in Duke Stefan's first wave of colonists. He has since become a respected caravan guard captain and maintains a fighting school in Specularum. He knows every safe road and every dangerous one.",
      status: "alive",
      relationship: "ally",
      portrait_url: null,
      tags: ["karameikos", "knight", "thyatian", "veteran", "guard captain"],
    },
  ],
};
