import type { StatBlock } from '@/types/npc.types'

export interface NpcTemplate {
  id: string
  name: string
  category: string
  stat_block: StatBlock
}

// SRD 5.1 stat blocks — open content
export const NPC_TEMPLATES: NpcTemplate[] = [
  // ── Townsfolk ────────────────────────────────────────────────────────────
  {
    id: 'commoner',
    name: 'Commoner',
    category: 'Townsfolk',
    stat_block: {
      armor_class: 10,
      hit_points: '4 (1d8)',
      speed: '30 ft.',
      str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
      challenge_rating: '0',
      languages: 'any one language (usually Common)',
    },
  },
  {
    id: 'noble',
    name: 'Noble',
    category: 'Townsfolk',
    stat_block: {
      armor_class: 15,
      hit_points: '9 (2d8)',
      speed: '30 ft.',
      str: 11, dex: 12, con: 11, int: 12, wis: 14, cha: 16,
      challenge_rating: '1/8',
      skills: { Deception: '+5', Insight: '+4', Persuasion: '+5' },
      languages: 'any two languages',
      actions: [
        { name: 'Rapier', description: 'Melee Weapon Attack: +3 to hit, reach 5 ft., one target. Hit: 5 (1d8 + 1) piercing damage.' },
      ],
    },
  },
  {
    id: 'acolyte',
    name: 'Acolyte',
    category: 'Townsfolk',
    stat_block: {
      armor_class: 10,
      hit_points: '9 (2d8)',
      speed: '30 ft.',
      str: 10, dex: 10, con: 10, int: 10, wis: 14, cha: 11,
      challenge_rating: '1/4',
      skills: { Medicine: '+4', Religion: '+2' },
      languages: 'any one language (usually Common)',
      special_abilities: [
        { name: 'Spellcasting', description: 'The acolyte is a 1st-level spellcaster. Its spellcasting ability is Wisdom (spell save DC 12, +4 to hit with spell attacks). It has the following cleric spells prepared: Cantrips: light, sacred flame, thaumaturgy. 1st level (3 slots): bless, cure wounds, sanctuary.' },
      ],
      actions: [
        { name: 'Club', description: 'Melee Weapon Attack: +2 to hit, reach 5 ft., one target. Hit: 2 (1d4) bludgeoning damage.' },
      ],
    },
  },
  {
    id: 'priest',
    name: 'Priest',
    category: 'Townsfolk',
    stat_block: {
      armor_class: 13,
      hit_points: '27 (5d8 + 5)',
      speed: '30 ft.',
      str: 10, dex: 10, con: 12, int: 13, wis: 16, cha: 13,
      challenge_rating: '2',
      skills: { Medicine: '+7', Persuasion: '+3', Religion: '+5' },
      languages: 'any two languages',
      special_abilities: [
        { name: 'Divine Eminence', description: 'As a bonus action, the priest can expend a spell slot to cause its melee weapon attacks to magically deal an extra 10 (3d6) radiant damage to a target on a hit. This benefit lasts until the end of the turn. If the priest expends a spell slot of 2nd level or higher, the extra damage increases by 1d6 for each level above 1st.' },
        { name: 'Spellcasting', description: '4th-level cleric (DC 13, +5 to hit). Spells: light, sacred flame, thaumaturgy / bless, cure wounds, guiding bolt / hold person, spiritual weapon / dispel magic, spirit guardians.' },
      ],
      actions: [
        { name: 'Mace', description: 'Melee Weapon Attack: +2 to hit, reach 5 ft., one target. Hit: 3 (1d6) bludgeoning damage.' },
      ],
    },
  },
  {
    id: 'mage',
    name: 'Mage',
    category: 'Townsfolk',
    stat_block: {
      armor_class: 12,
      hit_points: '40 (9d8)',
      speed: '30 ft.',
      str: 9, dex: 14, con: 11, int: 17, wis: 12, cha: 11,
      challenge_rating: '6',
      skills: { Arcana: '+7', History: '+7' },
      damage_resistances: 'damage from spells; non-magical bludgeoning, piercing, and slashing (from stoneskin)',
      languages: 'any four languages',
      special_abilities: [
        { name: 'Magic Resistance', description: 'The mage has advantage on saving throws against spells and other magical effects.' },
        { name: 'Spellcasting', description: '9th-level wizard (DC 14, +6 to hit). Spells: fire bolt, light, mage hand, prestidigitation / detect magic, mage armor, magic missile, shield / misty step, suggestion / counterspell, fireball, fly / greater invisibility, ice storm / cone of cold, scrying.' },
      ],
      actions: [
        { name: 'Dagger', description: 'Melee or Ranged Weapon Attack: +4 to hit, reach 5 ft. or range 20/60 ft., one target. Hit: 4 (1d4 + 2) piercing damage.' },
      ],
    },
  },
  // ── Soldiers & Guards ────────────────────────────────────────────────────
  {
    id: 'guard',
    name: 'Guard',
    category: 'Soldiers & Guards',
    stat_block: {
      armor_class: 16,
      hit_points: '11 (2d8 + 2)',
      speed: '30 ft.',
      str: 13, dex: 12, con: 12, int: 10, wis: 11, cha: 10,
      challenge_rating: '1/8',
      skills: { Perception: '+2' },
      languages: 'any one language (usually Common)',
      actions: [
        { name: 'Spear', description: 'Melee or Ranged Weapon Attack: +3 to hit, reach 5 ft. or range 20/60 ft., one target. Hit: 4 (1d6 + 1) piercing damage, or 5 (1d8 + 1) piercing damage if used with two hands to make a melee attack.' },
      ],
    },
  },
  {
    id: 'veteran',
    name: 'Veteran',
    category: 'Soldiers & Guards',
    stat_block: {
      armor_class: 17,
      hit_points: '58 (9d8 + 18)',
      speed: '30 ft.',
      str: 16, dex: 13, con: 14, int: 10, wis: 11, cha: 10,
      challenge_rating: '3',
      skills: { Athletics: '+5', Perception: '+2' },
      languages: 'any one language (usually Common)',
      actions: [
        { name: 'Multiattack', description: 'The veteran makes two longsword attacks. If it has a shortsword drawn, it can also make a shortsword attack.' },
        { name: 'Longsword', description: 'Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 7 (1d8 + 3) slashing damage, or 8 (1d10 + 3) slashing damage if used with two hands.' },
        { name: 'Shortsword', description: 'Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 6 (1d6 + 3) piercing damage.' },
        { name: 'Heavy Crossbow', description: 'Ranged Weapon Attack: +3 to hit, range 100/400 ft., one target. Hit: 6 (1d10 + 1) piercing damage.' },
      ],
    },
  },
  {
    id: 'knight',
    name: 'Knight',
    category: 'Soldiers & Guards',
    stat_block: {
      armor_class: 18,
      hit_points: '52 (8d8 + 16)',
      speed: '30 ft.',
      str: 16, dex: 11, con: 14, int: 11, wis: 11, cha: 15,
      challenge_rating: '3',
      skills: { Athletics: '+5', Perception: '+3' },
      languages: 'any one language (usually Common)',
      special_abilities: [
        { name: 'Brave', description: 'The knight has advantage on saving throws against the frightened condition.' },
      ],
      actions: [
        { name: 'Multiattack', description: 'The knight makes two melee attacks.' },
        { name: 'Greatsword', description: 'Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 10 (2d6 + 3) slashing damage.' },
        { name: 'Heavy Crossbow', description: 'Ranged Weapon Attack: +2 to hit, range 100/400 ft., one target. Hit: 5 (1d10) piercing damage.' },
        { name: 'Leadership (Recharges after a Short or Long Rest)', description: 'For 1 minute, the knight can utter a special command or warning whenever a nonhostile creature it can see within 30 ft. makes an attack roll or a saving throw. That creature can add a d4 to its roll (provided it can hear and understand the knight).' },
      ],
    },
  },
  {
    id: 'gladiator',
    name: 'Gladiator',
    category: 'Soldiers & Guards',
    stat_block: {
      armor_class: 16,
      hit_points: '112 (15d8 + 45)',
      speed: '30 ft.',
      str: 18, dex: 15, con: 16, int: 10, wis: 12, cha: 15,
      challenge_rating: '5',
      skills: { Athletics: '+10', Intimidation: '+5' },
      languages: 'any one language (usually Common)',
      special_abilities: [
        { name: 'Brave', description: 'The gladiator has advantage on saving throws against the frightened condition.' },
        { name: 'Brute', description: 'A melee weapon deals one extra die of its damage when the gladiator hits with it (included in the attack).' },
      ],
      actions: [
        { name: 'Multiattack', description: 'The gladiator makes three melee attacks or two ranged attacks.' },
        { name: 'Spear', description: 'Melee or Ranged Weapon Attack: +7 to hit, reach 5 ft. or range 20/60 ft., one target. Hit: 11 (2d6 + 4) piercing damage, or 13 (2d8 + 4) piercing damage if used with two hands to make a melee attack.' },
        { name: 'Shield Bash', description: 'Melee Weapon Attack: +7 to hit, reach 5 ft., one creature. Hit: 9 (2d4 + 4) bludgeoning damage. If the target is a Medium or smaller creature, it must succeed on a DC 15 Strength saving throw or be knocked prone.' },
      ],
    },
  },
  // ── Criminals & Outlaws ──────────────────────────────────────────────────
  {
    id: 'bandit',
    name: 'Bandit',
    category: 'Criminals & Outlaws',
    stat_block: {
      armor_class: 12,
      hit_points: '11 (2d8 + 2)',
      speed: '30 ft.',
      str: 11, dex: 12, con: 12, int: 10, wis: 10, cha: 10,
      challenge_rating: '1/8',
      languages: 'any one language (usually Common)',
      actions: [
        { name: 'Scimitar', description: 'Melee Weapon Attack: +3 to hit, reach 5 ft., one target. Hit: 4 (1d6 + 1) slashing damage.' },
        { name: 'Light Crossbow', description: 'Ranged Weapon Attack: +3 to hit, range 80/320 ft., one target. Hit: 5 (1d8 + 1) piercing damage.' },
      ],
    },
  },
  {
    id: 'bandit_captain',
    name: 'Bandit Captain',
    category: 'Criminals & Outlaws',
    stat_block: {
      armor_class: 15,
      hit_points: '65 (10d8 + 20)',
      speed: '30 ft.',
      str: 15, dex: 16, con: 14, int: 14, wis: 11, cha: 14,
      challenge_rating: '2',
      skills: { Athletics: '+4', Deception: '+4' },
      languages: 'any two languages',
      special_abilities: [
        { name: 'Pack Tactics', description: 'The captain has advantage on an attack roll against a creature if at least one of the captain\'s allies is adjacent to the creature and the ally isn\'t incapacitated.' },
      ],
      actions: [
        { name: 'Multiattack', description: 'The captain makes three melee attacks: two with its scimitar and one with its dagger. Or the captain makes two ranged attacks with its daggers.' },
        { name: 'Scimitar', description: 'Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 6 (1d6 + 3) slashing damage.' },
        { name: 'Dagger', description: 'Melee or Ranged Weapon Attack: +5 to hit, reach 5 ft. or range 20/60 ft., one target. Hit: 5 (1d4 + 3) piercing damage.' },
      ],
    },
  },
  {
    id: 'thug',
    name: 'Thug',
    category: 'Criminals & Outlaws',
    stat_block: {
      armor_class: 11,
      hit_points: '32 (5d8 + 10)',
      speed: '30 ft.',
      str: 15, dex: 11, con: 14, int: 10, wis: 10, cha: 11,
      challenge_rating: '1/2',
      skills: { Intimidation: '+2' },
      languages: 'any one language (usually Common)',
      special_abilities: [
        { name: 'Pack Tactics', description: 'The thug has advantage on an attack roll against a creature if at least one of the thug\'s allies is adjacent to the creature and the ally isn\'t incapacitated.' },
      ],
      actions: [
        { name: 'Multiattack', description: 'The thug makes two melee attacks.' },
        { name: 'Mace', description: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one creature. Hit: 5 (1d6 + 2) bludgeoning damage.' },
        { name: 'Heavy Crossbow', description: 'Ranged Weapon Attack: +2 to hit, range 100/400 ft., one target. Hit: 5 (1d10) piercing damage.' },
      ],
    },
  },
  {
    id: 'spy',
    name: 'Spy',
    category: 'Criminals & Outlaws',
    stat_block: {
      armor_class: 12,
      hit_points: '27 (6d8)',
      speed: '30 ft.',
      str: 10, dex: 15, con: 10, int: 12, wis: 14, cha: 16,
      challenge_rating: '1',
      skills: { Deception: '+5', Insight: '+4', Investigation: '+5', Perception: '+6', Persuasion: '+5', Sleight_of_Hand: '+4', Stealth: '+4' },
      languages: 'any two languages',
      special_abilities: [
        { name: 'Cunning Action', description: 'On each of its turns, the spy can use a bonus action to take the Dash, Disengage, or Hide action.' },
        { name: 'Sneak Attack (1/Turn)', description: 'The spy deals an extra 7 (2d6) damage when it hits a target with a weapon attack and has advantage on the attack roll, or when the target is within 5 ft. of an ally of the spy that isn\'t incapacitated and the spy doesn\'t have disadvantage on the attack roll.' },
      ],
      actions: [
        { name: 'Multiattack', description: 'The spy makes two melee attacks.' },
        { name: 'Shortsword', description: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) piercing damage.' },
        { name: 'Hand Crossbow', description: 'Ranged Weapon Attack: +4 to hit, range 30/120 ft., one target. Hit: 5 (1d6 + 2) piercing damage.' },
      ],
    },
  },
  {
    id: 'assassin',
    name: 'Assassin',
    category: 'Criminals & Outlaws',
    stat_block: {
      armor_class: 15,
      hit_points: '78 (12d8 + 24)',
      speed: '30 ft.',
      str: 11, dex: 16, con: 14, int: 13, wis: 11, cha: 10,
      challenge_rating: '8',
      skills: { Acrobatics: '+6', Deception: '+3', Perception: '+3', Stealth: '+9' },
      damage_resistances: 'poison',
      condition_immunities: 'poisoned (while Assassinate is active)',
      languages: 'Thieves\' cant plus any two languages',
      special_abilities: [
        { name: 'Assassinate', description: 'During its first turn, the assassin has advantage on attack rolls against any creature that hasn\'t taken a turn. Any hit the assassin scores against a surprised creature is a critical hit.' },
        { name: 'Evasion', description: 'If the assassin is subjected to an effect that allows it to make a Dexterity saving throw to take only half damage, the assassin instead takes no damage if it succeeds on the saving throw, and only half damage if it fails.' },
        { name: 'Sneak Attack (1/Turn)', description: 'The assassin deals an extra 14 (4d6) damage when it hits a target with a weapon attack and has advantage on the attack roll, or when the target is within 5 ft. of an ally of the assassin that isn\'t incapacitated and the assassin doesn\'t have disadvantage on the attack roll.' },
      ],
      actions: [
        { name: 'Multiattack', description: 'The assassin makes two shortsword attacks.' },
        { name: 'Shortsword', description: 'Melee Weapon Attack: +6 to hit, reach 5 ft., one target. Hit: 6 (1d6 + 3) piercing damage, and the target must make a DC 15 Constitution saving throw, taking 24 (7d6) poison damage on a failed save, or half as much damage on a successful one.' },
        { name: 'Light Crossbow', description: 'Ranged Weapon Attack: +6 to hit, range 80/320 ft., one target. Hit: 7 (1d8 + 3) piercing damage, and the target must make a DC 15 Constitution saving throw, taking 24 (7d6) poison damage on a failed save, or half as much damage on a successful one.' },
      ],
    },
  },
  {
    id: 'scout',
    name: 'Scout',
    category: 'Criminals & Outlaws',
    stat_block: {
      armor_class: 13,
      hit_points: '16 (3d8 + 3)',
      speed: '30 ft.',
      str: 11, dex: 14, con: 12, int: 11, wis: 13, cha: 11,
      challenge_rating: '1/2',
      skills: { Nature: '+4', Perception: '+5', Stealth: '+6', Survival: '+5' },
      languages: 'any one language (usually Common)',
      special_abilities: [
        { name: 'Keen Hearing and Sight', description: 'The scout has advantage on Wisdom (Perception) checks that rely on hearing or sight.' },
      ],
      actions: [
        { name: 'Multiattack', description: 'The scout makes two melee attacks or two ranged attacks.' },
        { name: 'Shortsword', description: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) piercing damage.' },
        { name: 'Longbow', description: 'Ranged Weapon Attack: +4 to hit, ranged 150/600 ft., one target. Hit: 6 (1d8 + 2) piercing damage.' },
      ],
    },
  },
  // ── Cultists ─────────────────────────────────────────────────────────────
  {
    id: 'cultist',
    name: 'Cultist',
    category: 'Cultists',
    stat_block: {
      armor_class: 12,
      hit_points: '9 (2d8)',
      speed: '30 ft.',
      str: 11, dex: 12, con: 10, int: 10, wis: 11, cha: 10,
      challenge_rating: '1/8',
      skills: { Deception: '+2', Religion: '+2' },
      languages: 'any one language (usually Common)',
      special_abilities: [
        { name: 'Dark Devotion', description: 'The cultist has advantage on saving throws against being charmed or frightened.' },
      ],
      actions: [
        { name: 'Scimitar', description: 'Melee Weapon Attack: +3 to hit, reach 5 ft., one creature. Hit: 4 (1d6 + 1) slashing damage.' },
      ],
    },
  },
  {
    id: 'cult_fanatic',
    name: 'Cult Fanatic',
    category: 'Cultists',
    stat_block: {
      armor_class: 13,
      hit_points: '33 (6d8 + 6)',
      speed: '30 ft.',
      str: 11, dex: 14, con: 12, int: 10, wis: 13, cha: 14,
      challenge_rating: '2',
      skills: { Deception: '+4', Persuasion: '+4', Religion: '+2' },
      languages: 'any one language (usually Common)',
      special_abilities: [
        { name: 'Dark Devotion', description: 'The fanatic has advantage on saving throws against being charmed or frightened.' },
        { name: 'Spellcasting', description: '4th-level cleric (DC 12, +4 to hit). Cantrips: light, sacred flame, thaumaturgy. 1st level (4 slots): command, inflict wounds, shield of faith. 2nd level (3 slots): hold person, spiritual weapon.' },
      ],
      actions: [
        { name: 'Multiattack', description: 'The fanatic makes two melee attacks.' },
        { name: 'Dagger', description: 'Melee or Ranged Weapon Attack: +4 to hit, reach 5 ft. or range 20/60 ft., one creature. Hit: 4 (1d4 + 2) piercing damage.' },
      ],
    },
  },
  // ── Warriors ─────────────────────────────────────────────────────────────
  {
    id: 'berserker',
    name: 'Berserker',
    category: 'Warriors',
    stat_block: {
      armor_class: 13,
      hit_points: '67 (9d8 + 27)',
      speed: '30 ft.',
      str: 16, dex: 12, con: 17, int: 9, wis: 11, cha: 9,
      challenge_rating: '2',
      languages: 'any one language (usually Common)',
      special_abilities: [
        { name: 'Reckless', description: 'At the start of its turn, the berserker can gain advantage on all melee weapon attack rolls during that turn, but attack rolls against it have advantage until the start of its next turn.' },
      ],
      actions: [
        { name: 'Greataxe', description: 'Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 9 (1d12 + 3) slashing damage.' },
      ],
    },
  },
]

export const NPC_TEMPLATE_CATEGORIES = [
  ...new Set(NPC_TEMPLATES.map(t => t.category)),
]

export function getNpcTemplate(id: string): NpcTemplate | undefined {
  return NPC_TEMPLATES.find(t => t.id === id)
}
