export interface ArtificerInfusion {
  name: string
  min_level: number
  description: string
}

export const ARTIFICER_INFUSIONS: ArtificerInfusion[] = [
  // ── Core infusions ────────────────────────────────────────────────────────
  {
    name: "Enhanced Arcane Focus",
    min_level: 2,
    description: "A rod, staff, or wand becomes a +1 arcane focus (+2 at Artificer level 10). While holding it, the bearer gains a +1 bonus to spell attack rolls and ignores half cover when making a spell attack.",
  },
  {
    name: "Enhanced Defense",
    min_level: 2,
    description: "A suit of armor or a shield gains a +1 bonus to AC (+2 at Artificer level 10).",
  },
  {
    name: "Enhanced Weapon",
    min_level: 2,
    description: "A simple or martial weapon gains a +1 bonus to attack and damage rolls (+2 at Artificer level 10).",
  },
  {
    name: "Homunculus Servant",
    min_level: 2,
    description: "Using a gem or crystal worth at least 100 gp as the focus, you craft a tiny mechanical construct. It uses the Homunculus Servant stat block and obeys your commands. It is considered a magical object, not a creature, for the purpose of spells and abilities.",
  },
  {
    name: "Repeating Shot",
    min_level: 2,
    description: "A ranged weapon with the ammunition property is infused with magic. It ignores the loading property and conjures one piece of the right ammunition when fired, so you never need to load it.",
  },
  {
    name: "Returning Weapon",
    min_level: 2,
    description: "A thrown weapon gains the thrown property (range 20/60 ft.) and returns to the wielder's hand immediately after being used to make a ranged attack.",
  },
  {
    name: "Armor of Magical Strength",
    min_level: 2,
    description: "A suit of armor grants its wearer a +1 bonus to Strength saving throws (+2 at Artificer level 10). When the wearer would be knocked prone, they can use their reaction to avoid being knocked prone.",
  },
  {
    name: "Mind Sharpener",
    min_level: 2,
    description: "A suit of armor or robes helps its wearer maintain concentration. When the wearer fails a Constitution saving throw to maintain concentration on a spell, the item can use its reaction to turn the failure into a success (4 charges; regains 1d4 daily at dawn).",
  },
  {
    name: "Boots of the Winding Path",
    min_level: 4,
    description: "While wearing these boots, a creature can teleport up to 15 feet as a bonus action to an unoccupied space it occupied since the start of its last turn.",
  },
  {
    name: "Radiant Weapon",
    min_level: 4,
    description: "A simple or martial weapon sheds bright light in a 10-foot radius and dim light for an additional 10 feet. Any creature it hits is blinded until the end of its next turn (Con save DC = 8 + prof + INT modifier). It has 4 charges (1d4 regained daily at dawn) and gains a +1 bonus to attack and damage rolls (+2 at Artificer level 10).",
  },
  {
    name: "Many-Handed Pouch",
    min_level: 6,
    description: "Up to five pouches are magically linked. A creature can reach into any of them and withdraw items stored in any of the others. The linked pouches must all be created at the same time as part of the same infusion.",
  },
  {
    name: "Repulsion Shield",
    min_level: 6,
    description: "A shield gains a +1 bonus to AC and 4 charges (1d4 regained daily at dawn). As a reaction when hit by a melee attack, the wielder can expend a charge to push the attacker up to 15 feet away.",
  },
  {
    name: "Resistant Armor",
    min_level: 6,
    description: "A suit of armor grants resistance to one damage type chosen when infused: acid, cold, fire, force, lightning, necrotic, poison, psychic, radiant, or thunder.",
  },
  {
    name: "Spell-Refueling Ring",
    min_level: 6,
    description: "While wearing this ring, the creature can recover one expended spell slot of 3rd level or lower as an action. Once used, this property can't be used again until the next dawn.",
  },
  {
    name: "Arcane Propulsion Armor",
    min_level: 14,
    description: "The wearer gains +5 feet speed, the armor cannot be removed against their will, missing limbs are replaced with magical prosthetics, and if the armor is destroyed it can be reactivated over a 1-minute ritual.",
  },
  // ── Replicate Magic Item ───────────────────────────────────────────────────
  {
    name: "Replicate Magic Item: Alchemy Jug",
    min_level: 2,
    description: "Replicates an Alchemy Jug. This ceramic jug produces a chosen liquid on command (water, wine, vinegar, oil, honey, aqua regia, acid, or poison) with set quantities per day.",
  },
  {
    name: "Replicate Magic Item: Bag of Holding",
    min_level: 2,
    description: "Replicates a Bag of Holding. This bag has an interior space considerably larger than its outside dimensions (2 ft. diameter opening, 4 ft. deep interior). It can hold up to 500 lbs. without exceeding 64 cubic feet.",
  },
  {
    name: "Replicate Magic Item: Goggles of Night",
    min_level: 2,
    description: "Replicates Goggles of Night. While wearing these dark lenses, the wearer has darkvision out to a range of 60 feet. If the wearer already has darkvision, wearing the goggles increases its range by 60 feet.",
  },
  {
    name: "Replicate Magic Item: Rope of Climbing",
    min_level: 2,
    description: "Replicates a Rope of Climbing. This 60-foot hempen rope obeys spoken commands, can tie and untie itself, and can hold up to 3,000 pounds.",
  },
  {
    name: "Replicate Magic Item: Sending Stones",
    min_level: 2,
    description: "Replicates a pair of Sending Stones. Matching stones allow the holders to communicate via the Sending spell (25 words) once each day as long as they are on the same plane.",
  },
  {
    name: "Replicate Magic Item: Wand of Magic Detection",
    min_level: 2,
    description: "Replicates a Wand of Magic Detection (3 charges; regains 1d3 daily at dawn). While holding it, you can expend 1 charge to cast Detect Magic.",
  },
  {
    name: "Replicate Magic Item: Boots of Elvenkind",
    min_level: 6,
    description: "Replicates Boots of Elvenkind. While wearing these boots, your steps make no sound regardless of the surface you are moving across. You have advantage on Dexterity (Stealth) checks that rely on moving silently.",
  },
  {
    name: "Replicate Magic Item: Cloak of Elvenkind",
    min_level: 6,
    description: "Replicates a Cloak of Elvenkind. While you wear this cloak with its hood up, Wisdom (Perception) checks made to see you have disadvantage. You have advantage on Dexterity (Stealth) checks made to hide.",
  },
  {
    name: "Replicate Magic Item: Cloak of Protection",
    min_level: 6,
    description: "Replicates a Cloak of Protection. While wearing this cloak, you gain a +1 bonus to AC and saving throws.",
  },
  {
    name: "Replicate Magic Item: Gloves of Thievery",
    min_level: 6,
    description: "Replicates Gloves of Thievery. These gloves are invisible while worn. While wearing them, you gain a +5 bonus to Dexterity (Sleight of Hand) checks and Dexterity checks made to pick locks.",
  },
  {
    name: "Replicate Magic Item: Helm of Comprehending Languages",
    min_level: 6,
    description: "Replicates a Helm of Comprehending Languages. While wearing this helm, you can use an action to cast Comprehend Languages from it at will.",
  },
  {
    name: "Replicate Magic Item: Lantern of Revealing",
    min_level: 6,
    description: "Replicates a Lantern of Revealing. While lit, this lantern sheds bright light in a 30-foot radius and dim light for an additional 30 feet. Invisible creatures and objects are visible as long as they are in the lantern's bright light.",
  },
]

export const ARTIFICER_INFUSIONS_MAP = new Map(ARTIFICER_INFUSIONS.map(i => [i.name, i]))
