/**
 * Artificer spell delta — adds "Artificer" to spells not tagged in Open5e's source data.
 *
 * Sources used:
 *  - Official Artificer spell list (TCoE + 2024 PHB) via dnd5e.wikidot.com/spells:artificer
 *  - Thematic additions: device/construct/energy spells fitting the class flavour
 *  - Deep Magic (dmag) gnome/tinker/clockwork/steam spells
 *
 * Applied automatically during the Open5e import — spells in this set that don't
 * already carry "Artificer" in their dnd_class field will have it added.
 */
export const ARTIFICER_SPELL_DELTA = new Set<string>([
  // ── Cantrips ──────────────────────────────────────────────────────────────
  "Acid Splash",
  "Booming Blade",
  "Create Bonfire",
  "Dancing Lights",
  "Fire Bolt",
  "Frostbite",
  "Green-Flame Blade",
  "Guidance",
  "Light",
  "Lightning Lure",
  "Mage Hand",
  "Magic Stone",
  "Mending",
  "Message",
  "Poison Spray",
  "Prestidigitation",
  "Ray of Frost",
  "Resistance",
  "Shocking Grasp",
  "Spare the Dying",
  "Sword Burst",
  "Thorn Whip",
  "Thunderclap",

  // ── 1st Level ─────────────────────────────────────────────────────────────
  "Absorb Elements",
  "Alarm",
  "Catapult",
  "Cure Wounds",
  "Detect Magic",
  "Disguise Self",
  "Expeditious Retreat",
  "Faerie Fire",
  "False Life",
  "Feather Fall",
  "Grease",
  "Identify",
  "Jump",
  "Longstrider",
  "Purify Food and Drink",
  "Sanctuary",
  "Snare",
  "Tasha's Caustic Brew",

  // ── 2nd Level ─────────────────────────────────────────────────────────────
  "Aid",
  "Air Bubble",
  "Alter Self",
  "Arcane Lock",
  "Blur",
  "Continual Flame",
  "Darkvision",
  "Enhance Ability",
  "Enlarge/Reduce",
  "Heat Metal",
  "Invisibility",
  "Kinetic Jaunt",
  "Lesser Restoration",
  "Levitate",
  "Magic Mouth",
  "Magic Weapon",
  "Protection from Poison",
  "Pyrotechnics",
  "Rope Trick",
  "See Invisibility",
  "Skywrite",
  "Spider Climb",
  "Vortex Warp",
  "Web",

  // ── 3rd Level ─────────────────────────────────────────────────────────────
  "Ashardalon's Stride",
  "Blink",
  "Catnap",
  "Create Food and Water",
  "Dispel Magic",
  "Elemental Weapon",
  "Flame Arrows",
  "Fly",
  "Glyph of Warding",
  "Haste",
  "Intellect Fortress",
  "Protection from Energy",
  "Revivify",
  "Tiny Servant",
  "Water Breathing",
  "Water Walk",

  // ── 4th Level ─────────────────────────────────────────────────────────────
  "Arcane Eye",
  "Elemental Bane",
  "Fabricate",
  "Freedom of Movement",
  "Leomund's Secret Chest",
  "Mordenkainen's Faithful Hound",
  "Mordenkainen's Private Sanctum",
  "Otiluke's Resilient Sphere",
  "Stone Shape",
  "Stoneskin",
  "Summon Construct",

  // ── 5th Level ─────────────────────────────────────────────────────────────
  "Animate Objects",
  "Bigby's Hand",
  "Create Spelljamming Helm",
  "Creation",
  "Greater Restoration",
  "Skill Empowerment",
  "Transmute Rock",
  "Wall of Stone",

  // ── Thematic additions ────────────────────────────────────────────────────
  // Device/construct/energy spells that fit the Artificer's flavour even if
  // not on the official class list. Sources: a5e curation + Artillerist subclass spells.

  // Energy weapons (Artillerist)
  "Burning Hands",
  "Fireball",
  "Lightning Bolt",
  "Wall of Fire",
  "Chain Lightning",

  // Sonic / force weapons
  "Shatter",
  "Thunderwave",
  "Thunder Wave",   // some sources spell it as two words
  "Wall of Force",

  // Constructs & animation
  "Unseen Servant",
  "Tenser's Floating Disk",

  // Mobility & transport devices
  "Dimension Door",
  "Misty Step",
  "Teleportation Circle",

  // Surveillance & detection devices
  "Clairvoyance",
  "Comprehend Languages",
  "Detect Poison and Disease",
  "Find Traps",

  // Stealth & countermeasure tech
  "Greater Invisibility",
  "Fog Cloud",
  "Counterspell",

  // Enhancement & support tech
  "Gust of Wind",
  "Hold Person",
  "Polymorph",
  "Produce Flame",

  // High-level crafting / construction
  "Disintegrate",
  "Move Earth",
  "Passwall",
  "Stone to Flesh",

  // ── Deep Magic — gnome / tinker / clockwork / steam themed ────────────────
  // Kobold Press Deep Magic (document slug: dmag)

  // Explicitly device/machine
  "Analyze Device",
  "Clockwork Bolt",
  "Gear Barrage",
  "Steam Blast",
  "Steam Whistle",
  "Create Thunderstaff",
  "Instant Siege Weapon",
  "Instant Fortification",
  "Sand Ship",

  // Constructs & animated objects
  "Awaken Object",
  "Create Ring Servant",
  "Unleash Effigy",
  "Hedren's Birds of Clay",

  // Alchemical
  "Gluey Globule",
  "Quicksilver Mantle",
  "Ray of Alchemical Negation",
  "Life Hack",

  // Communication / security devices
  "Encrypt / Decrypt",
  "Speak with Inanimate Object",
  "Tracer",

  // Resonance / destructive wave tech
  "Destructive Resonance",

  // Mechanical control
  "Reset",

  // Time manipulation (tinker-with-time flavour)
  "Quick Time",
  "Time in a Bottle",
  "Wall of Time",
]);
