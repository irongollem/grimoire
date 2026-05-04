export interface EldritchInvocation {
  name: string
  min_level: number
  prerequisites?: string
  description: string
  /** SRD spell ID to auto-add to character_spells when this invocation is picked. */
  grants_spell?: string
  /** null = at-will; number = uses per long rest */
  spell_uses_per_day?: number | null
}

export const ELDRITCH_INVOCATIONS: EldritchInvocation[] = [
  // ── Level 2 (no prerequisites) ─────────────────────────────────────────────
  {
    name: "Agonizing Blast",
    min_level: 2,
    prerequisites: "Eldritch Blast cantrip",
    description: "When you cast Eldritch Blast, add your Charisma modifier to the damage it deals on a hit.",
  },
  {
    name: "Armor of Shadows",
    min_level: 2,
    description: "You can cast Mage Armor on yourself at will, without expending a spell slot or material components.",
    grants_spell: "srd_mage_armor",
    spell_uses_per_day: null,
  },
  {
    name: "Beast Speech",
    min_level: 2,
    description: "You can cast Speak with Animals at will, without expending a spell slot.",
    grants_spell: "srd_speak_with_animals",
    spell_uses_per_day: null,
  },
  {
    name: "Beguiling Influence",
    min_level: 2,
    description: "You gain proficiency in the Deception and Persuasion skills.",
  },
  {
    name: "Devil's Sight",
    min_level: 2,
    description: "You can see normally in darkness, both magical and nonmagical, to a distance of 120 feet.",
  },
  {
    name: "Eldritch Sight",
    min_level: 2,
    description: "You can cast Detect Magic at will, without expending a spell slot.",
    grants_spell: "srd_detect_magic",
    spell_uses_per_day: null,
  },
  {
    name: "Eldritch Spear",
    min_level: 2,
    prerequisites: "Eldritch Blast cantrip",
    description: "When you cast Eldritch Blast, its range is 300 feet.",
  },
  {
    name: "Eyes of the Rune Keeper",
    min_level: 2,
    description: "You can read all writing.",
  },
  {
    name: "Fiendish Vigor",
    min_level: 2,
    description: "You can cast False Life on yourself at will as a 1st-level spell, without expending a spell slot or material components.",
    grants_spell: "srd_false_life",
    spell_uses_per_day: null,
  },
  {
    name: "Gaze of Two Minds",
    min_level: 2,
    description: "You can use your action to touch a willing humanoid and perceive through its senses until the end of your next turn. As long as the creature is on the same plane of existence as you, you can use your action on subsequent turns to maintain this connection.",
  },
  {
    name: "Mask of Many Faces",
    min_level: 2,
    description: "You can cast Disguise Self at will, without expending a spell slot.",
    grants_spell: "srd_disguise_self",
    spell_uses_per_day: null,
  },
  {
    name: "Misty Visions",
    min_level: 2,
    description: "You can cast Silent Image at will, without expending a spell slot or material components.",
    grants_spell: "srd_silent_image",
    spell_uses_per_day: null,
  },
  {
    name: "Repelling Blast",
    min_level: 2,
    prerequisites: "Eldritch Blast cantrip",
    description: "When you hit a creature with Eldritch Blast, you can push the creature up to 10 feet away from you in a straight line.",
  },
  {
    name: "Thief of Five Fates",
    min_level: 2,
    description: "You can cast Bane once using a Warlock spell slot. You can't do so again until you finish a long rest.",
    grants_spell: "srd_bane",
    spell_uses_per_day: 1,
  },
  // ── Level 5+ ───────────────────────────────────────────────────────────────
  {
    name: "Mire the Mind",
    min_level: 5,
    description: "You can cast Slow once using a Warlock spell slot. You can't do so again until you finish a long rest.",
    grants_spell: "srd_slow",
    spell_uses_per_day: 1,
  },
  {
    name: "One with Shadows",
    min_level: 5,
    description: "When you are in an area of dim light or darkness, you can use your action to become invisible until you move or take an action or reaction.",
  },
  {
    name: "Sign of Ill Omen",
    min_level: 5,
    description: "You can cast Bestow Curse once using a Warlock spell slot. You can't do so again until you finish a long rest.",
    grants_spell: "srd_bestow_curse",
    spell_uses_per_day: 1,
  },
  {
    name: "Thirsting Blade",
    min_level: 5,
    prerequisites: "Pact of the Blade",
    description: "You can attack with your pact weapon twice instead of once when you take the Attack action on your turn.",
  },
  // ── Level 7+ ───────────────────────────────────────────────────────────────
  {
    name: "Bewitching Whispers",
    min_level: 7,
    description: "You can cast Compulsion once using a Warlock spell slot. You can't do so again until you finish a long rest.",
    grants_spell: "srd_compulsion",
    spell_uses_per_day: 1,
  },
  {
    name: "Dreadful Word",
    min_level: 7,
    description: "You can cast Confusion once using a Warlock spell slot. You can't do so again until you finish a long rest.",
    grants_spell: "srd_confusion",
    spell_uses_per_day: 1,
  },
  {
    name: "Sculptor of Flesh",
    min_level: 7,
    description: "You can cast Polymorph once using a Warlock spell slot. You can't do so again until you finish a long rest.",
    grants_spell: "srd_polymorph",
    spell_uses_per_day: 1,
  },
  // ── Level 9+ ───────────────────────────────────────────────────────────────
  {
    name: "Ascendant Step",
    min_level: 9,
    description: "You can cast Levitate on yourself at will, without expending a spell slot or material components.",
    grants_spell: "srd_levitate",
    spell_uses_per_day: null,
  },
  {
    name: "Minions of Chaos",
    min_level: 9,
    description: "You can cast Conjure Elemental once using a Warlock spell slot. You can't do so again until you finish a long rest.",
  },
  {
    name: "Otherworldly Leap",
    min_level: 9,
    description: "You can cast Jump on yourself at will, without expending a spell slot or material components.",
    grants_spell: "srd_jump",
    spell_uses_per_day: null,
  },
  {
    name: "Whispers of the Grave",
    min_level: 9,
    description: "You can cast Speak with Dead at will, without expending a spell slot.",
    grants_spell: "srd_speak_with_dead",
    spell_uses_per_day: null,
  },
  // ── Level 12+ ──────────────────────────────────────────────────────────────
  {
    name: "Lifedrinker",
    min_level: 12,
    prerequisites: "Pact of the Blade",
    description: "When you hit a creature with your pact weapon, the creature takes extra necrotic damage equal to your Charisma modifier (minimum 1).",
  },
  // ── Level 15+ ──────────────────────────────────────────────────────────────
  {
    name: "Master of Myriad Forms",
    min_level: 15,
    description: "You can cast Alter Self at will, without expending a spell slot.",
  },
  {
    name: "Visions of Distant Realms",
    min_level: 15,
    description: "You can cast Arcane Eye at will, without expending a spell slot.",
    grants_spell: "srd_arcane_eye",
    spell_uses_per_day: null,
  },
  {
    name: "Witch Sight",
    min_level: 15,
    description: "You can see the true form of any shapechanger or creature concealed by illusion or transmutation magic while the creature is within 30 feet of you and within line of sight.",
  },
  // ── Level 18+ ──────────────────────────────────────────────────────────────
  {
    name: "Beast Master",
    min_level: 18,
    prerequisites: "Pact of the Chain",
    description: "When you cast Conjure Animals, you can summon one beast of challenge rating 2 or lower that has the Flyby trait. The beast obeys your commands.",
  },
]

export const ELDRITCH_INVOCATIONS_MAP = new Map(ELDRITCH_INVOCATIONS.map(i => [i.name, i]))
