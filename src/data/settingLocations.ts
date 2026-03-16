import type { LocationType } from "@/types/location.types";

export interface LocationPreset {
  name: string;
  location_type: LocationType;
  notes: string | null;
  tags: string[];
  /** Name of another preset in the same bundle that is this location's parent. */
  parent?: string;
}

// ── Faerûn (Forgotten Realms) ─────────────────────────────────────────────────

const FAERUN_LOCATIONS: LocationPreset[] = [
  // Worlds & outer continents
  { name: "Toril",     location_type: "world",     parent: undefined, notes: "The planet on which Faerûn, Kara-Tur, Maztica, and Zakhara sit. Orbits a yellow sun in the Prime Material Plane.", tags: ["world", "planet", "prime material"] },
  { name: "Maztica",   location_type: "continent", parent: "Toril",   notes: "A continent far to the west of Faerûn, home to the Maztican civilizations — the Nexal, the Payit, and the Kultakan.", tags: ["west", "new world"] },
  { name: "Kara-Tur",  location_type: "continent", parent: "Toril",   notes: "The eastern continent of Toril, home to ancient and powerful human civilizations inspired by the cultures of the Far East.", tags: ["east", "orient"] },

  // Faerûn continent & sub-regions
  { name: "Faerûn",              location_type: "continent", parent: "Toril",              notes: "The main continent of Toril and home to the Forgotten Realms setting.", tags: ["forgotten realms", "toril"] },
  { name: "The Underdark",       location_type: "region",    parent: "Toril",              notes: "A vast subterranean realm beneath the surface of Toril, home to drow, mind flayers, beholders, and other horrors.", tags: ["underdark", "underground"] },
  { name: "Sword Coast",         location_type: "region",    parent: "Faerûn",             notes: "A long stretch of coastline on the western edge of Faerûn, home to great city-states and one of the most heavily traveled trade routes in the world.", tags: ["sword coast", "northwest faerûn"] },
  { name: "The North",           location_type: "region",    parent: "Faerûn",             notes: "A cold and dangerous frontier stretching north of the Sword Coast, land of frontier towns, orcs, and ancient ruins.", tags: ["north", "frontier"] },
  { name: "Western Heartlands",  location_type: "region",    parent: "Faerûn",             notes: "A broad expanse of open land stretching east from the Sword Coast, dotted with trade towns and ruins.", tags: ["heartlands"] },
  { name: "The Dalelands",       location_type: "region",    parent: "Faerûn",             notes: "A collection of loosely allied pastoral communities east of the Cormanthor forest, known for fierce independence and strong ranger traditions.", tags: ["dales", "east", "dalelands"] },
  { name: "Moonsea",             location_type: "region",    parent: "Faerûn",             notes: "A volatile region around the cold inland sea of the same name, dominated by tyrant city-states and the Zhentarim black network.", tags: ["north", "moonsea", "zhentarim"] },
  { name: "The Vilhon Reach",    location_type: "region",    parent: "Faerûn",             notes: "A southern coastal region surrounding the Vilhon Sea, with a long history of lizardfolk empires, yuan-ti cults, and ancient druidic traditions.", tags: ["south", "vilhon"] },
  { name: "Chult",               location_type: "region",    parent: "Faerûn",             notes: "A steaming jungle peninsula in southern Faerûn, home to dinosaurs, yuan-ti, undead, and the ruins of the lost city of Omu.", tags: ["jungle", "south", "dinosaurs"] },
  { name: "The Shaar",           location_type: "region",    parent: "Faerûn",             notes: "A vast, flat grassland in southern Faerûn stretching from the Shining Plains to the Lake of Steam, home to nomadic tribes.", tags: ["south", "grasslands", "plains"] },
  { name: "The Silver Marches",  location_type: "region",    parent: "The North",          notes: "A confederation of northern city-states led by Silverymoon — also called Luruar — acting as a bulwark of civilization against the orc hordes of the North.", tags: ["north", "luruar", "confederation"] },

  // Countries & Kingdoms
  { name: "Cormyr",     location_type: "country", parent: "Faerûn",            notes: "The Forest Kingdom — a prosperous and lawful realm ruled by the Obarskyr dynasty, defended by the Purple Dragon knights and the War Wizards of Cormyr.", tags: ["heartlands", "purple dragons", "war wizards"] },
  { name: "Sembia",     location_type: "country", parent: "Faerûn",            notes: "A wealthy mercantile nation east of Cormyr, ruled by merchant lords rather than a single monarch.", tags: ["heartlands", "merchant", "east"] },
  { name: "Amn",        location_type: "country", parent: "Faerûn",            notes: "A powerful merchant nation south of the Sword Coast, secretly governed by the Council of Six. Magic use is strictly regulated here.", tags: ["south", "merchant", "council of six"] },
  { name: "Tethyr",     location_type: "country", parent: "Faerûn",            notes: "A recovering kingdom south of Amn, long torn apart by civil war and recently reunified under a new ruling dynasty.", tags: ["south", "recovering"] },
  { name: "Calimshan",  location_type: "country", parent: "Faerûn",            notes: "The southernmost great nation of Faerûn — ancient, hot, and steeped in centuries of genie-pact magic and guild-lord intrigue.", tags: ["south", "desert", "genies"] },
  { name: "Thay",       location_type: "country", parent: "Faerûn",            notes: "A theocratic nation in eastern Faerûn ruled by the Zulkir council of Red Wizards. Necromancy is a state art and an export.", tags: ["east", "red wizards", "necromancy", "zulkirs"] },
  { name: "Rashemen",   location_type: "country", parent: "Faerûn",            notes: "A fierce northern nation in the far east, ruled by the secretive Wychlaran witches and protected by legendary Berserker warriors.", tags: ["east", "witches", "wychlaran"] },
  { name: "Aglarond",   location_type: "country", parent: "Faerûn",            notes: "A forested peninsular nation between Thay and Thesk, for centuries ruled by the legendary half-elf sorceress called the Simbul.", tags: ["east", "half-elf", "the simbul"] },
  { name: "Damara",     location_type: "country", parent: "Faerûn",            notes: "A northern kingdom near the Cold Lands, historically afflicted by the Witch-King of Vaasa and powerful demon lords.", tags: ["north", "cold lands", "east"] },
  { name: "Halruaa",    location_type: "country", parent: "Faerûn",            notes: "A secluded southern nation of extraordinarily powerful wizards, known for its flying ships and magical magewalls.", tags: ["south", "wizards", "flying ships"] },
  { name: "Elturgard",  location_type: "country", parent: "Faerûn",            notes: "A paladin-led nation on the River Chionthar, known for the shining city of Elturel and its divine beacon the Companion — until Elturel was dragged to Avernus in 1492 DR.", tags: ["river chionthar", "paladins", "companion"] },

  // Cities
  { name: "Waterdeep",     location_type: "city", parent: "Sword Coast",        notes: "The City of Splendors. The largest and most cosmopolitan city on the Sword Coast, governed by the masked Lords of Waterdeep.", tags: ["city of splendors", "sword coast", "lords of waterdeep"] },
  { name: "Baldur's Gate", location_type: "city", parent: "Sword Coast",        notes: "A powerful merchant city-state on the River Chionthar, known for its wealth, the Flaming Fist mercenaries, and deep political corruption.", tags: ["sword coast", "merchant", "flaming fist"] },
  { name: "Neverwinter",   location_type: "city", parent: "Sword Coast",        notes: "The Jewel of the North. A prosperous city rebuilt after the catastrophic eruption of Mount Hotenow.", tags: ["north", "sword coast", "jewel of the north"] },
  { name: "Luskan",        location_type: "city", parent: "Sword Coast",        notes: "The City of Sails — a lawless port city nominally controlled by five pirate captains, with the Arcane Brotherhood lurking in the Hosttower.", tags: ["north", "pirates", "arcane brotherhood"] },
  { name: "Silverymoon",   location_type: "city", parent: "The Silver Marches", notes: "The Gem of the North. A center of learning, art, and high magic, considered the most enlightened city in Faerûn.", tags: ["north", "magic", "gem of the north"] },
  { name: "Mirabar",       location_type: "city", parent: "The North",          notes: "A wealthy mining city in the North, governed jointly by a dwarven marchion and human council. Exports stone and metal across the Sword Coast.", tags: ["north", "mining", "dwarves"] },
  { name: "Elturel",       location_type: "city", parent: "Elturgard",          notes: "Once the shining jewel of Elturgard, lit by the divine beacon the Companion. In 1492 DR the entire city was dragged by Zariel into Avernus. [Time-sensitive: present pre-1492 DR, absent post-1492 DR]", tags: ["elturgard", "avernus", "river chionthar", "zariel", "time-bound"] },
  { name: "Menzoberranzan", location_type: "city", parent: "The Underdark",     notes: "The City of Spiders — a vast drow metropolis deep in the Underdark, ruled by noble Houses devoted to Lolth. Birthplace of Drizzt Do'Urden.", tags: ["underdark", "drow", "lolth", "drizzt"] },
  { name: "Athkatla",      location_type: "city", parent: "Amn",                notes: "Capital of Amn, called the City of Coin. Commerce, shadow magic, and the Council of Six control everything here.", tags: ["amn", "coin", "south"] },
  { name: "Calimport",     location_type: "city", parent: "Calimshan",          notes: "The great city of Calimshan, one of the oldest continuously inhabited cities in Faerûn. A hub of desert trade, guild wars, and genie-lord politics.", tags: ["calimshan", "south", "ancient"] },
  { name: "Suzail",        location_type: "city", parent: "Cormyr",             notes: "The capital and largest city of Cormyr, seat of the Obarskyr dynasty and mustering ground for the Purple Dragon knights.", tags: ["cormyr", "heartlands", "purple dragons", "capital"] },
  { name: "Mulmaster",     location_type: "city", parent: "Moonsea",            notes: "A city on the eastern Moonsea shore, ruled by a corrupt High Blade, home to both Zhentarim operatives and the local wizard guild called the Cloaks.", tags: ["moonsea", "zhentarim", "corruption"] },
  { name: "Phlan",         location_type: "city", parent: "Moonsea",            notes: "A city on the western Moonsea, repeatedly sacked and rebuilt over the centuries. A classic adventuring hub known for its ruins.", tags: ["moonsea", "classic", "ruins"] },
  { name: "Zhentil Keep",  location_type: "city", parent: "Moonsea",            notes: "The primary stronghold of the Zhentarim on the Moonsea — a city of merchants, mercenaries, and assassins, razed and rebuilt multiple times.", tags: ["zhentarim", "moonsea", "black network"] },
  { name: "Hillsfar",      location_type: "city", parent: "Moonsea",            notes: "A powerful and deeply xenophobic Moonsea city ruled by a tyrannical First Lord. Non-humans are forbidden entry, and the Great Arena sees daily blood sport.", tags: ["moonsea", "xenophobic", "great arena"] },
  { name: "Westgate",      location_type: "city", parent: "Sea of Fallen Stars", notes: "A corrupt port city on the western Sea of Fallen Stars, historically dominated by the Night Masks thieves' guild and vampire crime lords.", tags: ["sea of fallen stars", "night masks", "corruption"] },
  { name: "Selgaunt",      location_type: "city", parent: "Sembia",             notes: "The largest port city in Sembia, home to powerful merchant families, political intrigue, and the Shadow Thieves.", tags: ["sembia", "port", "merchant"] },
  { name: "Eltabbar",      location_type: "city", parent: "Thay",               notes: "The de-facto capital of Thay, seat of the Zulkir council and administrative heart of the Red Wizards' empire.", tags: ["thay", "red wizards", "zulkirs", "capital"] },
  { name: "Port Nyanzaru", location_type: "city", parent: "Chult",              notes: "The only major settlement in Chult — a vibrant, chaotic port city ruled by seven merchant princes, and the primary gateway to the jungle interior.", tags: ["chult", "port", "merchant princes"] },

  // Towns
  { name: "Phandalin",  location_type: "town", parent: "The North",       notes: "A small but growing frontier town near the Sword Mountains, rebuilt after being burned by the Redbrands, close to Wave Echo Cave.", tags: ["north", "frontier"] },
  { name: "Triboar",    location_type: "town", parent: "The North",       notes: "A prosperous town at the crossroads of the Long Road and the Evermoor Way in the North, a key trading hub.", tags: ["north", "trade route"] },
  { name: "Red Larch",  location_type: "town", parent: "The North",       notes: "A small town along the Long Road at the edge of the Dessarin Valley.", tags: ["north", "dessarin valley"] },
  { name: "Yartar",     location_type: "town", parent: "The North",       notes: "A fortified town on the River Dessarin controlled by the Waterbaron, a key waypoint for river trade flowing south toward Waterdeep.", tags: ["north", "river dessarin", "trade"] },
  { name: "Daggerford", location_type: "town", parent: "Sword Coast",     notes: "A small walled town on the River Delimbiyr, an important waypoint for caravans traveling between Waterdeep and the southern Sword Coast.", tags: ["sword coast", "river delimbiyr"] },
  { name: "Port Llast", location_type: "town", parent: "Sword Coast",     notes: "A small fishing and stone-quarrying port north of Neverwinter, once thriving but since reduced by war and monster raids.", tags: ["north", "sword coast", "fishing"] },
  { name: "Shadowdale", location_type: "town", parent: "The Dalelands",   notes: "A quiet farming community in the Dalelands, made famous as the home of Elminster Aumar, the Sage of Shadowdale.", tags: ["dalelands", "elminster"] },
  { name: "Scornubel",  location_type: "town", parent: "Western Heartlands", notes: "The Caravan City — a rough-and-tumble trading post at the crossing of major trade roads in the Western Heartlands.", tags: ["heartlands", "caravan", "trade"] },

  // Notable buildings & structures
  { name: "Candlekeep",                location_type: "building", parent: "Sword Coast",  notes: "A great fortress-library on the Sword Coast cliffs — one of the greatest repositories of knowledge in all Faerûn. Entry requires a unique book as the admission price.", tags: ["library", "sword coast", "knowledge"] },
  { name: "Elminster's Tower",         location_type: "building", parent: "Shadowdale",   notes: "The modest tower of Elminster Aumar, the Sage of Shadowdale and chosen of Mystra. Home to centuries of magical research and treasures.", tags: ["shadowdale", "elminster", "mystra", "magic"] },
  { name: "Hosttower of the Arcane",   location_type: "building", parent: "Luskan",       notes: "The multi-spired tower of the Arcane Brotherhood in Luskan, shaped like a giant reaching hand. Seat of a powerful, corrupt wizard society.", tags: ["luskan", "arcane brotherhood", "wizards"] },
  { name: "Blackstaff Tower",          location_type: "building", parent: "Waterdeep",    notes: "The residence of the Blackstaff — the official Archmage of Waterdeep — in the Castle Ward. Contains a famous extradimensional vault of magical relics.", tags: ["waterdeep", "blackstaff", "archmage"] },
  { name: "Helm's Hold",               location_type: "building", parent: "Neverwinter",  notes: "A fortified monastery of the god Helm south of Neverwinter, historically a refuge for the mentally afflicted and a way-shrine for travelers.", tags: ["neverwinter", "helm", "monastery"] },
  { name: "The Vault of Dragons",      location_type: "building", parent: "Waterdeep",    notes: "A legendary hoard vault rumoured to be hidden beneath Waterdeep, holding an ancient fortune from the era of dragon lords.", tags: ["waterdeep", "dragons", "treasure"] },

  // Dungeons & ruins
  { name: "Undermountain",         location_type: "dungeon", parent: "Waterdeep",    notes: "A legendary megadungeon carved beneath Waterdeep by the mad wizard Halaster Blackcloak. Dozens of levels descend into the Underdark.", tags: ["waterdeep", "megadungeon", "halaster"] },
  { name: "Mithral Hall",          location_type: "dungeon", parent: "Spine of the World", notes: "A great dwarven fortress in the Spine of the World, stronghold of Clan Battlehammer, famously reclaimed from the shadow dragon Shimmergloom.", tags: ["dwarves", "north", "battlehammer"] },
  { name: "Citadel Adbar",         location_type: "dungeon", parent: "The North",    notes: "A nearly impregnable dwarven citadel in the North, stronghold of King Harbromm and a last bastion of dwarven civilization.", tags: ["dwarves", "north", "citadel"] },
  { name: "Myth Drannor",          location_type: "dungeon", parent: "Cormanthor",   notes: "The City of Song — once the greatest elven city in Faerûn, now a demon-haunted ruin in the heart of the Cormanthor forest.", tags: ["elves", "ruins", "cormanthor", "demons"] },
  { name: "Well of Dragons",       location_type: "dungeon", parent: "Faerûn",       notes: "An extinct volcano used as a lair by the Cult of the Dragon, housing thousands of draconic cultists and undead dracolichs.", tags: ["cult of the dragon", "dragons", "tiamat"] },
  { name: "Wave Echo Cave",        location_type: "dungeon", parent: "Phandalin",    notes: "An ancient mine famed for its magical resonance, site of the legendary Forge of Spells, lost to goblin raids and sought by the Rockseeker clan.", tags: ["phandalin", "mine", "forge of spells"] },
  { name: "Omu",                   location_type: "dungeon", parent: "Chult",        notes: "A ruined city deep in the jungles of Chult, last stronghold of the Omuan civilization, guarded by yuan-ti and haunted by Ras Nsi. Home to the nine puzzle cubes that unlock Acererak's tomb.", tags: ["chult", "ruins", "yuan-ti", "acererak"] },
  { name: "Tomb of Annihilation",  location_type: "dungeon", parent: "Omu",          notes: "The hidden tomb of Acererak the archlich beneath the ruins of Omu. Site of the death curse that threatens all who have been raised from the dead.", tags: ["chult", "acererak", "lich", "death curse"] },

  // Wilderness & geography
  { name: "Icewind Dale",         location_type: "wilderness", parent: "The North",          notes: "A frozen tundra in the far North, home to the Ten-Towns and the Reghed barbarians.", tags: ["north", "frozen", "ten-towns", "reghed"] },
  { name: "High Forest",          location_type: "wilderness", parent: "The North",          notes: "An ancient and vast forest in the North, home to wood elves, treants, the Star Mounts, and powerful ancient magic.", tags: ["north", "forest", "elves"] },
  { name: "Neverwinter Wood",     location_type: "wilderness", parent: "The North",          notes: "A dark and ancient forest east of Neverwinter, full of ruins, fey creatures, and Iliyanbruen elven influence.", tags: ["north", "forest", "fey"] },
  { name: "Anauroch",             location_type: "wilderness", parent: "Faerûn",             notes: "A vast magical desert in central Faerûn built over the ruins of the ancient flying-city empire of Netheril.", tags: ["desert", "netheril", "north", "ancient"] },
  { name: "Spine of the World",   location_type: "wilderness", parent: "The North",          notes: "A colossal mountain range forming the northern boundary of the Sword Coast region, near impassable in winter.", tags: ["mountains", "north", "border"] },
  { name: "Sword Mountains",      location_type: "wilderness", parent: "The North",          notes: "A rugged mountain range near the Sword Coast, riddled with ore mines, orc war-bands, and ancient dwarven ruins.", tags: ["mountains", "sword coast", "north"] },
  { name: "Cormanthor",           location_type: "wilderness", parent: "The Dalelands",      notes: "A vast and ancient forest in the Dalelands, home to elven ruins, the shattered city of Myth Drannor, and dangerous fey crossings.", tags: ["forest", "dalelands", "elves"] },
  { name: "The Evermoors",        location_type: "wilderness", parent: "The North",          notes: "A vast, foggy moorland in the North stretching east of Triboar, home to enormous trolls and ancient ruins.", tags: ["north", "trolls", "moors"] },
  { name: "Thunder Peaks",        location_type: "wilderness", parent: "The Dalelands",      notes: "A mountain range separating Cormyr from the Dalelands and Moonsea region, known for powerful lightning storms.", tags: ["mountains", "cormyr", "dalelands"] },
  { name: "Storm Horns",          location_type: "wilderness", parent: "Cormyr",             notes: "A mountain range forming the western border of Cormyr, riddled with monster lairs and ancient enemies of the Forest Kingdom.", tags: ["mountains", "cormyr"] },
  { name: "Sea of Fallen Stars",  location_type: "wilderness", parent: "Faerûn",             notes: "The great inland sea at the heart of Faerûn — also called the Inner Sea — connecting the Heartlands to the eastern nations.", tags: ["sea", "inner sea", "heartlands"] },
  { name: "Sea of Swords",        location_type: "wilderness", parent: "Faerûn",             notes: "The ocean to the west of the Sword Coast, named for the rocks that sink unwary ships and the pirates who prey upon them.", tags: ["ocean", "west", "sword coast"] },
  { name: "Trackless Sea",        location_type: "wilderness", parent: "Toril",              notes: "The vast, uncharted ocean west of Faerûn, beyond even the Sea of Swords. Few ships venture far into it and fewer return.", tags: ["ocean", "west", "uncharted"] },
];

// ── Greyhawk ──────────────────────────────────────────────────────────────────

const GREYHAWK_LOCATIONS: LocationPreset[] = [
  { name: "Oerth",    location_type: "world",     parent: undefined,  notes: "The world of Greyhawk, an Earth-like planet orbiting a yellow sun in the Prime Material Plane.", tags: ["greyhawk", "world of greyhawk", "planet"] },
  { name: "Oerik",    location_type: "continent", parent: "Oerth",    notes: "The primary continent of Oerth. Most Greyhawk adventures take place in its eastern region, the Flanaess.", tags: ["greyhawk"] },
  { name: "Flanaess", location_type: "region",    parent: "Oerik",    notes: "The eastern portion of the continent of Oerik and the primary setting for Greyhawk adventures.", tags: ["greyhawk"] },

  { name: "City of Greyhawk",                  location_type: "city",    parent: "Flanaess", notes: "The Free City of Greyhawk — a major hub of trade, magic, and political intrigue, named for the ancient castle ruins that loom over it.", tags: ["free city", "greyhawk"] },
  { name: "Dyvers",                            location_type: "city",    parent: "Flanaess", notes: "A prosperous port city on the Nyr Dyv lake, a commercial rival to the Free City.", tags: ["port", "trade", "nyr dyv"] },
  { name: "Verbobonc",                         location_type: "city",    parent: "Flanaess", notes: "A fortified city near the Temple of Elemental Evil, gateway to many classic adventures.", tags: ["temple of elemental evil", "classic"] },
  { name: "Greyhawk City State of Rel Astra",  location_type: "city",    parent: "Flanaess", notes: "A powerful independent city-state on the eastern coast of the Flanaess, home to powerful merchant princes.", tags: ["east", "merchant", "independent"] },

  { name: "Furyondy",      location_type: "country",    parent: "Flanaess", notes: "A powerful and chivalric kingdom in the central Flanaess, long a bulwark against the spreading evil of Iuz the Old.", tags: ["good", "kingdom"] },
  { name: "Veluna",        location_type: "country",    parent: "Flanaess", notes: "A theocratic nation devoted to Rao, god of peace and reason — closely allied with Furyondy.", tags: ["theocracy", "good", "rao"] },
  { name: "Nyrond",        location_type: "country",    parent: "Flanaess", notes: "A large and once-proud kingdom in the eastern Flanaess, frequently beset by wars and internal strife.", tags: ["kingdom", "east"] },
  { name: "Iuz",           location_type: "country",    parent: "Flanaess", notes: "The evil empire of the cambion demigod Iuz the Old, spanning the north-central Flanaess. Built on fear, slavery, and demon-worship.", tags: ["evil", "demigod", "empire"] },
  { name: "The Great Kingdom", location_type: "country", parent: "Flanaess", notes: "A vast and crumbling empire in the east, once the dominant power of Oerth, now corrupt and fractured into tyrant states.", tags: ["empire", "east", "corrupt"] },
  { name: "Keoland",       location_type: "country",    parent: "Flanaess", notes: "A once-great southern kingdom, now content to dominate regional trade rather than military conquest.", tags: ["south", "kingdom", "trade"] },

  { name: "Castle Greyhawk",          location_type: "dungeon",    parent: "City of Greyhawk", notes: "The legendary ruins of the wizard Zagig Yragerne's castle — a classic megadungeon with dozens of levels, filled with humor, death, and impossible architecture.", tags: ["megadungeon", "zagig", "ruins", "classic"] },
  { name: "Temple of Elemental Evil", location_type: "dungeon",    parent: "Verbobonc",        notes: "A notorious dungeon built atop a node of pure elemental chaos, once used to summon Zuggtmoy the Demon Queen of Fungi.", tags: ["classic", "zuggtmoy", "elemental"] },
  { name: "Tomb of Horrors",          location_type: "dungeon",    parent: "Flanaess",         notes: "The near-inescapable death trap dungeon of Acererak the archlich — the original 'killer dungeon', legendary for its lethality.", tags: ["acererak", "lich", "classic", "deathtrap"] },

  { name: "Barrier Peaks",        location_type: "wilderness", parent: "Flanaess", notes: "A mountain range on the western edge of the Flanaess, rumoured to hold the wreck of a star-vessel — a site of bizarre science-fantasy encounters.", tags: ["mountains", "west"] },
  { name: "Crystalmist Mountains", location_type: "wilderness", parent: "Flanaess", notes: "The highest mountain range on the Flanaess, home to cloud giants, fire giants, and the drow-filled Vault of the Drow.", tags: ["mountains", "giants", "drow"] },
  { name: "Nyr Dyv",               location_type: "wilderness", parent: "Flanaess", notes: "The Lake of Unknown Depths — a vast inland lake at the heart of the Flanaess, known for treacherous storms and mysterious depths.", tags: ["lake", "central", "mysterious"] },
];

// ── Eberron ───────────────────────────────────────────────────────────────────

const EBERRON_LOCATIONS: LocationPreset[] = [
  { name: "Eberron",    location_type: "world",     parent: undefined,   notes: "The world itself, formed from the body of the great dragon Eberron, a planet with magic woven into its very physics.", tags: ["planet", "world"] },
  { name: "Khorvaire",  location_type: "continent", parent: "Eberron",   notes: "The primary continent of Eberron, home to the Five Nations, the Mournland, and dozens of diverse peoples.", tags: ["eberron"] },
  { name: "Xen'drik",   location_type: "continent", parent: "Eberron",   notes: "A mysterious southern continent of ancient giant ruins and impenetrable jungles.", tags: ["giants", "ruins", "mysterious", "south"] },
  { name: "Sarlona",    location_type: "continent", parent: "Eberron",   notes: "A distant eastern continent dominated by the Inspired, humanoid thralls of the nightmare Quori spirits from Dal Quor.", tags: ["inspired", "quori", "distant", "east"] },
  { name: "Argonnessen", location_type: "continent", parent: "Eberron",  notes: "The dragon continent to the southeast. Home to the Chamber, the Conclave, and thousands of true dragons.", tags: ["dragons", "chamber", "conclave"] },
  { name: "Khyber",     location_type: "region",    parent: "Eberron",   notes: "The underworld of Eberron, said to be the body of the Dragon Below. A vast subterranean realm of aberrations and bound fiends.", tags: ["underground", "aberrations", "fiends", "dragon below"] },

  { name: "Breland",    location_type: "country", parent: "Khorvaire",   notes: "The largest of the Five Nations, known for industry, relative democracy, and the teeming city of Sharn.", tags: ["five nations"] },
  { name: "Aundair",    location_type: "country", parent: "Khorvaire",   notes: "A nation renowned for its arcane traditions, fertile fields, and the floating Arcanix towers.", tags: ["five nations", "magic", "arcanix"] },
  { name: "Karrnath",   location_type: "country", parent: "Khorvaire",   notes: "A harsh, militaristic nation with a grim history of deploying undead soldiers in the Last War.", tags: ["five nations", "undead", "military"] },
  { name: "Thrane",     location_type: "country", parent: "Khorvaire",   notes: "A theocracy governed by the Church of the Silver Flame, known for its paladins and inquisitors.", tags: ["five nations", "silver flame", "theocracy"] },
  { name: "Darguun",    location_type: "country", parent: "Khorvaire",   notes: "A nation carved out by goblinoid peoples who seized former Cyre territory during the Last War.", tags: ["goblinoids", "hobgoblins", "last war"] },
  { name: "Droaam",     location_type: "country", parent: "Khorvaire",   notes: "A nation of monsters — medusas, gnolls, harpies, and worse — ruled by the three Daughters of Sora Kell.", tags: ["monsters", "daughters of sora kell"] },

  { name: "Sharn",      location_type: "city", parent: "Breland",        notes: "The City of Towers — a massive vertical metropolis built on a manifest zone to Syrania that allows magic to lift buildings miles into the sky.", tags: ["city of towers", "towers", "syrania"] },
  { name: "Wroat",      location_type: "city", parent: "Breland",        notes: "The capital of Breland, seat of King Boranel ir'Wynarn and the Breland Parliament.", tags: ["breland", "capital", "parliament"] },
  { name: "Fairhaven",  location_type: "city", parent: "Aundair",        notes: "The capital of Aundair, a city of wizards built around the floating Arcanix towers. Known for fine wine and arcane academies.", tags: ["aundair", "capital", "wizards", "arcanix"] },
  { name: "Korth",      location_type: "city", parent: "Karrnath",       notes: "The capital of Karrnath, a grim fortress-city on the Karrn River, home to the royal undead soldiers and the Order of the Emerald Claw.", tags: ["karrnath", "capital", "undead", "emerald claw"] },
  { name: "Flamekeep",  location_type: "city", parent: "Thrane",         notes: "The capital of Thrane and seat of the Church of the Silver Flame, built around the pillar of divine fire where Tira Miron made her sacrifice.", tags: ["thrane", "capital", "silver flame"] },

  { name: "The Mournland", location_type: "wilderness", parent: "Khorvaire", notes: "The shattered wasteland where the nation of Cyre once stood. Destroyed in the Day of Mourning in 994 YK. Surrounded by a wall of dead grey mist.", tags: ["cyre", "day of mourning", "ruins", "dead-grey mist"] },
];

// ── Dragonlance ───────────────────────────────────────────────────────────────

const DRAGONLANCE_LOCATIONS: LocationPreset[] = [
  { name: "Krynn",    location_type: "world",     parent: undefined,  notes: "The world of Dragonlance — a planet dominated by the struggle between Paladine, Takhisis, and the balance of Gilean.", tags: ["planet", "world"] },
  { name: "Ansalon",  location_type: "continent", parent: "Krynn",    notes: "The primary continent of Krynn and the main setting for Dragonlance adventures.", tags: ["krynn", "dragonlance"] },

  { name: "Solamnia",    location_type: "country",  parent: "Ansalon",  notes: "A great and ancient kingdom in northwestern Ansalon, home of the Knights of Solamnia — Sword, Rose, and Crown.", tags: ["knights", "northwest", "knights of solamnia"] },
  { name: "Ergoth",      location_type: "country",  parent: "Ansalon",  notes: "A former empire on the western coast of Ansalon, now fragmented into Northern and Southern Ergoth after the Cataclysm.", tags: ["west", "empire"] },
  { name: "Abanasinia",  location_type: "region",   parent: "Ansalon",  notes: "A central region of Ansalon, birthplace of many Heroes of the Lance. Home to Solace and the Que-Shu tribe.", tags: ["heroes of the lance", "central", "war of the lance"] },
  { name: "Silvanesti",  location_type: "region",   parent: "Ansalon",  notes: "The ancient and isolationist homeland of the Silvanesti elves in southeastern Ansalon, twisted by the Silvanesti Shield into a nightmare forest.", tags: ["elves", "silvanesti", "east"] },
  { name: "Qualinesti",  location_type: "region",   parent: "Ansalon",  notes: "The homeland of the Qualinesti elves in southwestern Ansalon, a beautiful forested realm long under threat from the Dragon Highlords.", tags: ["elves", "qualinesti", "southwest"] },
  { name: "Khalkist Mountains", location_type: "wilderness", parent: "Ansalon", notes: "A brutal mountain range in eastern Ansalon, home to Neraka and countless draconian forces during the War of the Lance.", tags: ["mountains", "east", "dragon highlords"] },
  { name: "Blood Sea of Istar", location_type: "wilderness", parent: "Ansalon", notes: "A sea stained crimson by the Cataclysm, churning in a great maelstrom above the sunken ruins of the Kingpriest's empire. Home to the minotaur nation of Mithas.", tags: ["sea", "cataclysm", "istar", "minotaurs"] },
  { name: "Icewall Glacier",    location_type: "wilderness", parent: "Ansalon", notes: "A vast and deadly glacier in the southernmost reaches of Ansalon, home to Icewall Castle and white dragons.", tags: ["ice", "south", "dragons"] },

  { name: "Palanthas",  location_type: "city",    parent: "Solamnia",  notes: "The crown jewel of Solamnia and one of the most beautiful cities on Ansalon. Seat of the High Clerist's Tower and, for a time, the tower of Raistlin Majere.", tags: ["solamnia", "capital", "high clerist", "raistlin"] },
  { name: "Neraka",     location_type: "city",    parent: "Khalkist Mountains", notes: "A dark city in the Khalkist Mountains, seat of the Dragon Highlords during the War of the Lance and home to the great Temple of Takhisis.", tags: ["evil", "takhisis", "dragon highlords"] },
  { name: "Qualinost",  location_type: "city",    parent: "Qualinesti", notes: "The capital of the Qualinesti elves, a city of elegant golden spires grown from living trees — eventually destroyed by the Dragon Overlord Beryllinthranox.", tags: ["elves", "qualinesti", "capital"] },
  { name: "Tarsis",     location_type: "city",    parent: "Ansalon",   notes: "Once a great port city on Ansalon's southern sea. After the Cataclysm the sea vanished, leaving Tarsis stranded inland and haunted by draconians.", tags: ["south", "ruined", "cataclysm"] },
  { name: "Solace",     location_type: "town",    parent: "Abanasinia", notes: "A beloved town built in the branches of massive Vallenwood trees, home of Tanis Half-Elven and the Majere twins.", tags: ["vallenwood", "heroes of the lance", "tanis"] },
  { name: "Haven",      location_type: "town",    parent: "Abanasinia", notes: "A city in Abanasinia that fell under the sway of the Seeker theocracy before the War of the Lance.", tags: ["abanasinia", "seekers", "war of the lance"] },

  { name: "Thorbardin",                    location_type: "dungeon",  parent: "Ansalon",   notes: "The great underground city-fortress of the dwarves of Ansalon, said to be entirely impregnable. Played a decisive role in the War of the Lance.", tags: ["dwarves", "underground", "fortress"] },
  { name: "High Clerist's Tower",          location_type: "building", parent: "Solamnia",  notes: "A great Solamnic fortress in the Vingaard Mountains protecting the pass to Palanthas. Site where Sturm Brightblade fell in the War of the Lance.", tags: ["solamnia", "knights", "war of the lance", "sturm"] },
  { name: "Tower of High Sorcery at Wayreth", location_type: "building", parent: "Ansalon", notes: "The only surviving Tower of High Sorcery, hidden by a magical forest. Home to the Conclave of Wizards and the Test all mages must pass.", tags: ["magic", "conclave", "test", "wayreth"] },

  { name: "Istar",  location_type: "dungeon", parent: "Blood Sea of Istar", notes: "The ruins of a once-great theocratic empire, now resting at the bottom of the Blood Sea after Takhisis hurled a fiery mountain upon it in the Cataclysm.", tags: ["cataclysm", "ruins", "sunken", "kingpriest"] },
];

// ── Planar locations (setting-agnostic) ───────────────────────────────────────
// The D&D multiverse planes that any campaign may visit regardless of setting.

export const PLANAR_LOCATIONS: LocationPreset[] = [
  // Transitive planes
  { name: "The Astral Plane",   location_type: "plane", notes: "A silvery void connecting all planes of existence. Home to githyanki silver cities and the drifting god-isles of long-dead deities.", tags: ["transitive", "astral", "githyanki"] },
  { name: "The Ethereal Plane", location_type: "plane", notes: "A misty borderland coexisting with the Material Plane, used by ghosts and travelers passing between inner and outer planes.", tags: ["transitive", "ethereal", "ghosts"] },
  { name: "The Feywild",        location_type: "plane", notes: "The Plane of Faerie — a mirror of the Material Plane suffused with wild magic, beauty, and danger. Home to the Seelie and Unseelie Courts.", tags: ["feywild", "fey", "archfey", "seelie", "unseelie"] },
  { name: "The Shadowfell",     location_type: "plane", notes: "The Plane of Shadow — a dark reflection of the Material Plane where all color drains to grey. Home to the Shadar-kai and the Raven Queen.", tags: ["shadowfell", "shadow", "raven queen", "shadar-kai"] },
  // Inner planes
  { name: "Elemental Plane of Fire",  location_type: "plane", notes: "A plane of endless conflagration, home to the City of Brass and the efreeti sultans of the Elemental Evil.", tags: ["inner planes", "fire", "efreeti", "city of brass"] },
  { name: "Elemental Plane of Water", location_type: "plane", notes: "A boundless ocean with no surface, home to marids, merfolk, and the coral cities of the Elemental Court of Water.", tags: ["inner planes", "water", "marids"] },
  { name: "Elemental Plane of Earth", location_type: "plane", notes: "An infinite mass of rock and crystal tunnels. Home to dao, xorn, and vast underground kingdoms.", tags: ["inner planes", "earth", "dao"] },
  { name: "Elemental Plane of Air",   location_type: "plane", notes: "A limitless sky with no ground, home to djinn, aarakocra, and the floating cities of the djinn sultans.", tags: ["inner planes", "air", "djinn", "aarakocra"] },
  // Outer planes — upper
  { name: "Mount Celestia",  location_type: "plane", notes: "The Seven Heavens — a shining plane of absolute law and good, home to archons and the souls of the most virtuous.", tags: ["upper planes", "lawful good", "archons"] },
  { name: "Arborea",         location_type: "plane", notes: "The Olympian Glades — a chaotic good plane of wild beauty and passion. Home to elven gods and their divine servants.", tags: ["upper planes", "chaotic good", "elves"] },
  { name: "Elysium",         location_type: "plane", notes: "A neutral good plane of perfect peace and rest. Home of departed good souls and the birthplace of guardinals.", tags: ["upper planes", "neutral good", "guardinals"] },
  { name: "Ysgard",          location_type: "plane", notes: "The Heroic Domains — a plane of eternal battle and glory, home to Norse-inspired gods, giants, and the honored slain.", tags: ["upper planes", "chaotic good", "giants", "norse"] },
  // Outer planes — lower
  { name: "The Nine Hells",  location_type: "plane", notes: "Baator — nine layers of lawful evil dominated by archdevils. Avernus down through Dis, Minauros, Phlegethos, Stygia, Malbolge, Maladomini, Cania, and Nessus (Asmodeus).", tags: ["lower planes", "lawful evil", "devils", "asmodeus"] },
  { name: "Avernus",         location_type: "plane", parent: "The Nine Hells", notes: "The first and most accessible layer of the Nine Hells, ruled by Zariel. A blasted hellscape of endless war between demons and devils. Elturel was dragged here in 1492 DR.", tags: ["nine hells", "zariel", "devils", "war", "elturel"] },
  { name: "The Abyss",       location_type: "plane", notes: "An infinite layered plane of pure chaos and evil, home to the tanar'ri demons. Each layer is the domain of a different demon lord.", tags: ["lower planes", "chaotic evil", "demons", "tanar'ri"] },
  { name: "Gehenna",         location_type: "plane", notes: "The Bleak Eternity — a plane of volcanic mountainsides, where the yugoloths dwell and sell their services to both sides of the Blood War.", tags: ["lower planes", "neutral evil", "yugoloths"] },
  { name: "Hades",           location_type: "plane", notes: "The Gray Waste — three bleak grey layers where all emotion drains away. Home to larvae (the fallen souls of the wicked).", tags: ["lower planes", "neutral evil", "gray waste"] },
  // Outer planes — neutral
  { name: "Mechanus",        location_type: "plane", notes: "Infinite interlocking clockwork gears — a plane of absolute law and order, ruled by the modrons and the god Primus.", tags: ["outer planes", "lawful neutral", "modrons", "clockwork"] },
  { name: "Limbo",           location_type: "plane", notes: "The Ever-Changing Chaos — a roiling soup of unformed matter that slaadi and githzerai monks shape by willpower alone.", tags: ["outer planes", "chaotic neutral", "slaadi", "githzerai"] },
  // Special
  { name: "Sigil",           location_type: "city",  notes: "The City of Doors — a planar metropolis at the top of the Spire in the Outlands, accessible from any plane via portals. Governed by the inscrutable Lady of Pain.", tags: ["outlands", "lady of pain", "portals", "planar hub"] },
];

/** Preset locations keyed by CalendarAdapter ID (matches SETTING_BUNDLES registry). */
export const SETTING_LOCATIONS: Record<string, LocationPreset[]> = {
  faerun:      FAERUN_LOCATIONS,
  greyhawk:    GREYHAWK_LOCATIONS,
  eberron:     EBERRON_LOCATIONS,
  dragonlance: DRAGONLANCE_LOCATIONS,
};
