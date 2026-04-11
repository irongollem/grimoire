import type { DndSettingDef } from "./types";

export const ravenloftSetting: DndSettingDef = {
  id: "ravenloft",
  label: "Ravenloft",

  defaultAiPrompt:
    "Gothic horror with a desaturated, fog-drenched palette — bone white, slate grey, deep shadow black, and crimson used sparingly and with intent. Candlelight and firelight should feel inadequate against the dark. " +
    "The Mists are always present: at treeline, between buildings, curling under doors. Let them obscure as much as they reveal. " +
    "Architecture is crumbling grandeur — castle stone slick with damp, iron gates rusted open or shut, manor houses with boards on the upper windows, graveyards with tilted stones and fresh turned earth. " +
    "Characters should look haunted: sunken eyes, tattered finery over survival practicality, religious symbols clutched or hidden, faces that have seen too much. Show fear as the reasonable response. " +
    "Creatures should feel wrong — vampires are beautiful and repellent at once, werewolves are mid-transformation agony, ghosts are the shape of grief given form. Anatomy should disturb without being gratuitous. " +
    "Use environmental horror: the torch that keeps almost going out, the dog that won't stop barking, the wagon wheel stuck in mud at the worst moment, the window with something behind it. " +
    "Keep the mood oppressive, dread-soaked, and intimate — the horror is personal, not spectacle.",

  calendar: {
    name: "Ravenloft (Barovian Calendar)",
    epochName: "BC",
    defaultYear: 735,
    weekStyle: "weekly",
    dayLabels: ["Moonday", "Grimday", "Ashenday", "Bleakday", "Dreadday", "Wailday", "Darkday"],
    months: [
      { name: "Deadwinter",  alias: "The Long Dark",  days: 30 },
      { name: "Witchblight", alias: "The Rime",        days: 30 },
      { name: "Thawing",     alias: "False Spring",    days: 30 },
      { name: "Bloodrose",   alias: "Blooming",        days: 30 },
      { name: "Mourning",    alias: "The Weeping",     days: 30 },
      { name: "Mistmonth",   alias: "High Summer",     days: 30 },
      { name: "Swelter",     alias: "The Fever",       days: 30 },
      { name: "Duskfall",    alias: "The Turning",     days: 30 },
      { name: "Darkening",   alias: "The Long Dusk",   days: 30 },
      { name: "Harvestwane", alias: "Last Harvest",    days: 30 },
      { name: "Grimtide",    alias: "The Reckoning",   days: 30 },
      { name: "Deepmist",    alias: "The Vanishing",   days: 30 },
    ],
    intercalaryDays: [
      {
        name: "Mistsday",
        afterMonth: 6,
        description: "The longest night of summer. The Mists draw close and the boundary between life and death blurs. Darklords are said to be at their most powerful.",
      },
      {
        name: "Night of the Walking Dead",
        afterMonth: 12,
        description: "The most dreaded night in Ravenloft — the dead rise from their graves and the Mists swallow entire villages. No one ventures out alone.",
      },
    ],
    leapYearRule: "none",
  },

  locations: [
    { name: "The Mists",              location_type: "plane",   notes: "The supernatural fog that surrounds and separates the Domains of Dread. Travellers who enter without invitation rarely find their way out.", tags: ["mists", "demiplane", "prison"] },
    { name: "Demiplane of Dread",     location_type: "plane",   parent: "The Mists",           notes: "The patchwork pocket dimension created by the Dark Powers — a collection of domains, each a perfect prison for its Darklord.", tags: ["dark powers", "prison plane", "domains"] },
    { name: "Barovia",                location_type: "region",  parent: "Demiplane of Dread",  notes: "The oldest and most famous Domain of Dread. A gloomy valley of superstitious villages, dark forests, and Castle Ravenloft. Darklord: Strahd von Zarovich.", tags: ["strahd", "curse of strahd", "gothic", "vampires"] },
    { name: "Castle Ravenloft",       location_type: "dungeon", parent: "Barovia",             notes: "The ancestral home of Strahd von Zarovich, perched on a basalt crag above the village of Barovia. A maze of crypts, towers, and dark magic.", tags: ["strahd", "castle", "dungeon", "vampires"] },
    { name: "Village of Barovia",     location_type: "village", parent: "Barovia",             notes: "A desolate, fog-choked village of frightened peasants, cowering beneath Castle Ravenloft's shadow.", tags: ["strahd", "ireena", "ismark"] },
    { name: "Vallaki",                location_type: "town",    parent: "Barovia",             notes: "A walled town ruled by Baron Vargas Vallakovich, who forces citizens to attend mandatory 'festivals' to maintain an illusion of happiness.", tags: ["vallakovich", "festivals", "walled town"] },
    { name: "Krezk",                  location_type: "town",    parent: "Barovia",             notes: "A small fortified village at the edge of Barovia, ruled by the Krezkov family. Its holy pool is said to grant visions.", tags: ["krezkov", "holy pool", "abbey"] },
    { name: "Darkon",                 location_type: "region",  parent: "Demiplane of Dread",  notes: "Once one of the largest domains in the Demiplane, ruled by the lich Azalin Rex. Its capital became the Necropolis — a city of the undead.", tags: ["azalin rex", "lich", "necropolis", "undead"] },
    { name: "Necropolis of Il Aluk",  location_type: "city",    parent: "Darkon",              notes: "Once a living city, now populated entirely by the undead after Azalin's ill-fated ritual.", tags: ["undead", "azalin rex", "city of death"] },
    { name: "Falkovnia",              location_type: "region",  parent: "Demiplane of Dread",  notes: "A militaristic, tyrannical domain ruled by the brutal warlord Vlad Drakov. Citizens live in constant fear.", tags: ["vlad drakov", "military", "tyranny"] },
    { name: "Lamordia",               location_type: "region",  parent: "Demiplane of Dread",  notes: "A cold, industrialised domain of gothic science-horror. Darklord: Dr. Viktra Mordenheim, creator of the Flesh Golem Adam.", tags: ["mordenheim", "flesh golem", "gothic science", "cold"] },
    { name: "Mordent",                location_type: "region",  parent: "Demiplane of Dread",  notes: "A fog-drenched coastal domain of haunted manor houses and restless spirits.", tags: ["ghosts", "haunted", "fog", "manor houses"] },
    { name: "Borca",                  location_type: "region",  parent: "Demiplane of Dread",  notes: "A wealthy domain of political intrigue and poison. Darklords: siblings Ivana Boritsi and Ivan Dilisnya.", tags: ["poison", "intrigue", "boritsi", "wealth"] },
    { name: "The Shadowfell",         location_type: "plane",   notes: "The Plane of Shadow — a dark reflection of the Material Plane. Many Domains of Dread are believed to float in or near the Shadowfell.", tags: ["shadowfell", "shadow", "raven queen"] },
  ],

  heroes: [
    {
      name: "Strahd von Zarovich",
      race: "Vampire",
      alignment: "Lawful Evil",
      occupation: "Darklord of Barovia / Count",
      personality: "Ancient, imperious, and consumed by a love he can never fulfil. Strahd is not a simple monster — he is a brilliant general and ruler who has lived with his curse for centuries. He is capable of charm, generosity, and terrible violence, often in the same conversation.",
      backstory: "Once a great conqueror and warlord, Strahd made a pact with Death to claim his brother Sergei's bride Tatyana. He murdered his brother on Sergei's wedding day, became the first vampire, and has been imprisoned in Barovia ever since — watching Tatyana's soul reincarnate again and again, forever out of reach.",
      status: "alive",
      relationship: "enemy",
      portrait_url: null,
      tags: ["darklord", "vampire", "barovia", "strahd", "curse of strahd"],
    },
    {
      name: "Madam Eva",
      race: "Vistani",
      alignment: "True Neutral",
      occupation: "Seer / Vistani Elder",
      personality: "Ancient, inscrutable, and radiating an unsettling sense of purpose. Madam Eva does not explain herself. She reads the Tarokka cards, delivers her prophecies, and watches — always watches — to see which fate the players choose.",
      backstory: "The eldest and most powerful Vistani seer in Barovia, Madam Eva has guided countless adventurers to their doom or salvation. Her true nature is debated — some say she is a fragment of the Dark Powers themselves.",
      status: "alive",
      relationship: "neutral",
      portrait_url: null,
      tags: ["vistani", "seer", "tarokka", "barovia", "mysterious"],
    },
    {
      name: "Rudolph van Richten",
      race: "Human",
      alignment: "Lawful Good",
      occupation: "Monster Hunter / Scholar",
      personality: "Methodical, haunted, and driven by grief transformed into purpose. Van Richten lost his son to vampires and has spent decades building the knowledge to destroy them. He is brilliantly capable and deeply tragic — a man who has become the thing he hunts in terms of ruthlessness.",
      backstory: "The foremost monster hunter in the Demiplane of Dread, author of the Van Richten's Guides to various horrors. He travels under assumed identities because his enemies are numerous and his allies few. He carries tremendous guilt.",
      status: "alive",
      relationship: "ally",
      portrait_url: null,
      tags: ["van richten", "monster hunter", "scholar", "barovia", "tragic"],
    },
    {
      name: "Ireena Kolyana",
      race: "Human",
      alignment: "Neutral Good",
      occupation: "Nobleman's Daughter / Fighter",
      personality: "Brave and self-possessed despite living her entire life in the shadow of Castle Ravenloft. Ireena refuses to be a victim. She is stubborn, warm, and somewhat bewildered that anyone has come to help her.",
      backstory: "The adopted daughter of the Burgomaster of the Village of Barovia, Ireena bears the face of Tatyana — the woman Strahd has loved and lost across centuries. She has been bitten twice. The party's job is to get her somewhere safe before the third bite.",
      status: "alive",
      relationship: "ally",
      portrait_url: null,
      tags: ["barovia", "tatyana", "strahd", "protected"],
    },
    {
      name: "Ismark the Lesser",
      race: "Human",
      alignment: "Neutral Good",
      occupation: "Fighter / Burgomaster's Son",
      personality: "Earnest, brave, and desperately aware that his nickname 'the Lesser' is probably accurate. Ismark is trying to do right by his sister and his village without the power or resources to succeed alone. He will accept any help offered.",
      backstory: "Son of the Burgomaster of the Village of Barovia, Ismark has watched his father die and his sister become Strahd's obsession. He reached out to adventurers because he has no other options. He is ordinary — and the world needs ordinary people to be brave.",
      status: "alive",
      relationship: "ally",
      portrait_url: null,
      tags: ["barovia", "village", "ireena", "burgomaster"],
    },
  ],
};
