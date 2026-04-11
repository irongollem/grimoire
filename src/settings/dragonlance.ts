import type { DndSettingDef } from "./types";

export const dragonlanceSetting: DndSettingDef = {
  id: "dragonlance",
  label: "Dragonlance",

  defaultAiPrompt:
    "Epic fantasy suffused with loss and hard-won hope. Three moons cast overlapping silver, red, and black light — use them to set the mood of any scene: Solinari's silver for holy moments, Lunitari's red for arcane tension, Nuitari's absence-black for dark sorcery. " +
    "Palette splits between warmth and ruin: Solace's amber vallenwood firelight and padded comfort versus the ash-grey devastation of dragonfire, scorched earth, and draconian ranks. " +
    "Knights of Solamnia wear polished plate with rose-and-sword iconography — proud, rigid, slightly archaic. Draconians should feel genuinely monstrous: scaled, acid-smelling, wrong where dragons are majestic. " +
    "Characters carry the weight of the Cataclysm in worn religious tokens, crumbling temple ruins, and the wariness of people who stopped trusting gods. Clerics who have regained their faith should look quietly luminous. " +
    "Dragonlords and their mounts should dominate compositions — scale matters. A blue dragon over a battlefield is not a detail, it is the sky. " +
    "Use environmental storytelling: trampled crops, refugee columns, destroyed shrines, campfires too small against a very dark night. " +
    "Keep the mood epic but earned — triumph costs something, and sorrow is never far.",

  calendar: {
    name: "Dragonlance (Krynn Common Calendar)",
    epochName: "AC",
    defaultYear: 351,
    weekStyle: "weekly",
    dayLabels: ["Linaras", "Palast", "Bakukal", "Bracha", "Misham", "Kirinor", "Majetag"],
    months: [
      { name: "Newkolt",    alias: "New Cold",        days: 28 },
      { name: "Deepkolt",   alias: "Deep Cold",       days: 28 },
      { name: "Brookgreen", alias: "Green Brook",     days: 28 },
      { name: "Yurthgreen", alias: "Spring Green",    days: 28 },
      { name: "Fleurgreen", alias: "Flower Green",    days: 28 },
      { name: "Holden",     alias: "Midsummer Hold",  days: 28 },
      { name: "Fierswelt",  alias: "Fierce Heat",     days: 28 },
      { name: "Reapember",  alias: "Reaping Time",    days: 28 },
      { name: "Paleswelt",  alias: "Pale Heat",       days: 28 },
      { name: "Havesthold", alias: "Harvest Hold",    days: 28 },
      { name: "Frostkolt",  alias: "Frost Cold",      days: 28 },
      { name: "Darkember",  alias: "Dark Ember",      days: 28 },
    ],
    intercalaryDays: [],
    leapYearRule: "none",
  },

  locations: [
    { name: "Krynn",                          location_type: "world",     notes: "The world of Dragonlance — a planet dominated by the struggle between Paladine, Takhisis, and the balance of Gilean.", tags: ["planet", "world"] },
    { name: "Ansalon",                        location_type: "continent", parent: "Krynn",      notes: "The primary continent of Krynn and the main setting for Dragonlance adventures.", tags: ["krynn", "dragonlance"] },
    { name: "Solamnia",                       location_type: "country",   parent: "Ansalon",   notes: "A great and ancient kingdom in northwestern Ansalon, home of the Knights of Solamnia.", tags: ["knights", "northwest", "knights of solamnia"] },
    { name: "Ergoth",                         location_type: "country",   parent: "Ansalon",   notes: "A former empire on the western coast of Ansalon, fragmented into Northern and Southern Ergoth after the Cataclysm.", tags: ["west", "empire"] },
    { name: "Abanasinia",                     location_type: "region",    parent: "Ansalon",   notes: "A central region of Ansalon, birthplace of many Heroes of the Lance. Home to Solace and the Que-Shu tribe.", tags: ["heroes of the lance", "central", "war of the lance"] },
    { name: "Silvanesti",                     location_type: "region",    parent: "Ansalon",   notes: "The ancient homeland of the Silvanesti elves in southeastern Ansalon, twisted into a nightmare forest by the Silvanesti Shield.", tags: ["elves", "silvanesti", "east"] },
    { name: "Qualinesti",                     location_type: "region",    parent: "Ansalon",   notes: "The homeland of the Qualinesti elves in southwestern Ansalon, long under threat from the Dragon Highlords.", tags: ["elves", "qualinesti", "southwest"] },
    { name: "Khalkist Mountains",             location_type: "wilderness",parent: "Ansalon",   notes: "A brutal mountain range in eastern Ansalon, home to Neraka and countless draconian forces.", tags: ["mountains", "east", "dragon highlords"] },
    { name: "Blood Sea of Istar",             location_type: "wilderness",parent: "Ansalon",   notes: "A sea stained crimson by the Cataclysm, churning above the sunken ruins of the Kingpriest's empire.", tags: ["sea", "cataclysm", "istar", "minotaurs"] },
    { name: "Icewall Glacier",                location_type: "wilderness",parent: "Ansalon",   notes: "A vast and deadly glacier in the southernmost reaches of Ansalon, home to white dragons.", tags: ["ice", "south", "dragons"] },
    { name: "Palanthas",                      location_type: "city",      parent: "Solamnia",  notes: "The crown jewel of Solamnia — seat of the High Clerist's Tower and Raistlin Majere's tower.", tags: ["solamnia", "capital", "high clerist", "raistlin"] },
    { name: "Neraka",                         location_type: "city",      parent: "Khalkist Mountains", notes: "A dark city in the Khalkist Mountains, seat of the Dragon Highlords during the War of the Lance.", tags: ["evil", "takhisis", "dragon highlords"] },
    { name: "Qualinost",                      location_type: "city",      parent: "Qualinesti",notes: "The capital of the Qualinesti elves — a city of golden spires grown from living trees.", tags: ["elves", "qualinesti", "capital"] },
    { name: "Solace",                         location_type: "town",      parent: "Abanasinia",notes: "A beloved town built in the branches of massive Vallenwood trees — home of Tanis Half-Elven and the Majere twins.", tags: ["vallenwood", "heroes of the lance", "tanis"] },
    { name: "Tarsis",                         location_type: "city",      parent: "Ansalon",   notes: "Once a great port city. After the Cataclysm the sea vanished, leaving Tarsis stranded inland and haunted by draconians.", tags: ["south", "ruined", "cataclysm"] },
    { name: "Thorbardin",                     location_type: "dungeon",   parent: "Ansalon",   notes: "The great underground city-fortress of the dwarves of Ansalon, said to be entirely impregnable.", tags: ["dwarves", "underground", "fortress"] },
    { name: "High Clerist's Tower",           location_type: "building",  parent: "Solamnia",  notes: "A great Solamnic fortress protecting the pass to Palanthas. Site where Sturm Brightblade fell in the War of the Lance.", tags: ["solamnia", "knights", "war of the lance", "sturm"] },
    { name: "Tower of High Sorcery at Wayreth", location_type: "building", parent: "Ansalon", notes: "The only surviving Tower of High Sorcery, hidden by a magical forest. Home to the Conclave of Wizards.", tags: ["magic", "conclave", "test", "wayreth"] },
    { name: "Istar",                          location_type: "dungeon",   parent: "Blood Sea of Istar", notes: "The ruins of a once-great theocratic empire, now resting at the bottom of the Blood Sea after the Cataclysm.", tags: ["cataclysm", "ruins", "sunken", "kingpriest"] },
  ],

  heroes: [
    {
      name: "Tanis Half-Elven",
      race: "Half-Elf",
      alignment: "Neutral Good",
      occupation: "Fighter / Leader",
      personality: "Reluctant leader, torn between his elven and human natures. Tanis is compassionate and perceptive, but plagued by self-doubt. He is most effective when protecting those he loves, and most vulnerable when asked to choose between them.",
      backstory: "Born of an elven mother and a human father who was killed before his birth, Tanis Half-Elven grew up on the margins of Qualinesti elven society. He formed the Companions of the Lance with his childhood friends and now finds himself at the centre of the war against the Dragon Highlords.",
      status: "alive",
      relationship: "ally",
      portrait_url: null,
      tags: ["heroes of the lance", "companions", "half-elf", "war of the lance"],
    },
    {
      name: "Raistlin Majere",
      race: "Human",
      alignment: "Neutral Evil",
      occupation: "Wizard (Black Robes)",
      personality: "Brilliant, cold, and consumed by ambition. Raistlin has golden skin and hourglass eyes — the price of his Test at the Tower of Wayreth. He views nearly everyone as a fool or a tool, but occasionally shows a complicated tenderness toward his twin brother Caramon.",
      backstory: "The most powerful mage of his age, Raistlin survived the Test at the Tower of High Sorcery by agreeing to serve the gods of magic — at a terrible price. He chose the Black Robes and walks a razor's edge between serving the Companions and serving his own ends.",
      status: "alive",
      relationship: "neutral",
      portrait_url: null,
      tags: ["heroes of the lance", "black robes", "tower of wayreth", "ambitious"],
    },
    {
      name: "Sturm Brightblade",
      race: "Human",
      alignment: "Lawful Good",
      occupation: "Knight of Solamnia",
      personality: "Honourable to a fault, courtly, and possessed of a dignity that shames those around him. Sturm follows the Measure even when it costs him everything. He carries his father's armour and a debt of honour he can never repay.",
      backstory: "A Knight of Solamnia in all but title — he has yet to be formally knighted due to his irregular birth and the Order's disarray. Sturm fights with an ancient two-handed sword and the full weight of the Solamnic code. He will not survive the War of the Lance.",
      status: "alive",
      relationship: "ally",
      portrait_url: null,
      tags: ["heroes of the lance", "knights of solamnia", "honour", "sacrifice"],
    },
    {
      name: "Kitiara uth Matar",
      race: "Human",
      alignment: "Lawful Evil",
      occupation: "Dragon Highlord (Blue Wing) / General",
      personality: "Brilliant, magnetic, and utterly ruthless — Kitiara is everything a Dragon Highlord should be and more. She is also Tanis Half-Elven's former lover, which makes her one of the most dangerous people in the world.",
      backstory: "The half-sister of Raistlin and Caramon Majere, Kitiara chose power over family. She rose through the Dragon Highlord ranks by defeating rivals and has been granted dominion over the Blue Dragonarmies. She rides the blue dragon Skie.",
      status: "alive",
      relationship: "enemy",
      portrait_url: null,
      tags: ["dragon highlord", "blue dragonarmy", "villain", "skie"],
    },
    {
      name: "Fizban the Fabulous",
      race: "Human (disguised)",
      alignment: "Neutral Good",
      occupation: "Wandering Wizard / Ancient",
      personality: "Absent-minded, cheerful, and prone to spectacular magical mishaps — or so he seems. Fizban has a way of appearing exactly when he is needed and vanishing before anyone can ask too many questions. He is very fond of hats.",
      backstory: "A bumbling old wizard who traveled with the Companions for a time, Fizban is secretly far more than he appears. Those who meet him rarely forget him — even if they can't quite explain why.",
      status: "alive",
      relationship: "ally",
      portrait_url: null,
      tags: ["wizard", "mysterious", "divine", "companion"],
    },
  ],
};
