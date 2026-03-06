import type { MonsterStatBlock, MonsterType, MonsterSize } from '@/types/monster.types'

export interface MonsterTemplate {
  id: string
  name: string
  monster_type: MonsterType
  size: MonsterSize
  alignment: string
  stat_block: MonsterStatBlock
}

export interface MonsterTemplateCategory {
  label: string
  templates: MonsterTemplate[]
}

export const MONSTER_TEMPLATES: MonsterTemplate[] = [
  // ── Humanoids ────────────────────────────────────────────────────────────
  {
    id: 'goblin', name: 'Goblin', monster_type: 'humanoid', size: 'small', alignment: 'neutral evil',
    stat_block: {
      armor_class: 15, hit_points: '7 (2d6)', speed: '30 ft.',
      str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8,
      challenge_rating: '1/4',
      skills: { stealth: '+6' },
      senses: 'darkvision 60 ft., passive Perception 9',
      languages: 'Common, Goblin',
      special_abilities: [
        { name: 'Nimble Escape', description: 'The goblin can take the Disengage or Hide action as a bonus action on each of its turns.' },
      ],
      actions: [
        { name: 'Scimitar', description: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.' },
        { name: 'Shortbow', description: 'Ranged Weapon Attack: +4 to hit, range 80/320 ft., one target. Hit: 5 (1d6 + 2) piercing damage.' },
      ],
    },
  },
  {
    id: 'hobgoblin', name: 'Hobgoblin', monster_type: 'humanoid', size: 'medium', alignment: 'lawful evil',
    stat_block: {
      armor_class: 18, hit_points: '11 (2d8+2)', speed: '30 ft.',
      str: 13, dex: 12, con: 12, int: 10, wis: 10, cha: 9,
      challenge_rating: '1/2',
      saving_throws: '',
      skills: { },
      senses: 'darkvision 60 ft., passive Perception 10',
      languages: 'Common, Goblin',
      special_abilities: [
        { name: 'Martial Advantage', description: 'Once per turn, the hobgoblin can deal an extra 7 (2d6) damage to a creature it hits with a weapon attack if that creature is within 5 feet of an ally of the hobgoblin that isn\'t incapacitated.' },
      ],
      actions: [
        { name: 'Longsword', description: 'Melee Weapon Attack: +3 to hit, reach 5 ft., one target. Hit: 5 (1d8 + 1) slashing damage, or 6 (1d10 + 1) slashing damage if used with two hands.' },
        { name: 'Longbow', description: 'Ranged Weapon Attack: +3 to hit, range 150/600 ft., one target. Hit: 5 (1d8 + 1) piercing damage.' },
      ],
    },
  },
  {
    id: 'orc', name: 'Orc', monster_type: 'humanoid', size: 'medium', alignment: 'chaotic evil',
    stat_block: {
      armor_class: 13, hit_points: '15 (2d8+6)', speed: '30 ft.',
      str: 16, dex: 12, con: 16, int: 7, wis: 11, cha: 10,
      challenge_rating: '1/2',
      skills: { intimidation: '+2' },
      senses: 'darkvision 60 ft., passive Perception 10',
      languages: 'Common, Orc',
      special_abilities: [
        { name: 'Aggressive', description: 'As a bonus action, the orc can move up to its speed toward a hostile creature that it can see.' },
      ],
      actions: [
        { name: 'Greataxe', description: 'Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 9 (1d12 + 3) slashing damage.' },
        { name: 'Javelin', description: 'Melee or Ranged Weapon Attack: +5 to hit, reach 5 ft. or range 30/120 ft., one target. Hit: 6 (1d6 + 3) piercing damage.' },
      ],
    },
  },

  // ── Undead ────────────────────────────────────────────────────────────────
  {
    id: 'skeleton', name: 'Skeleton', monster_type: 'undead', size: 'medium', alignment: 'lawful evil',
    stat_block: {
      armor_class: 13, hit_points: '13 (2d8+4)', speed: '30 ft.',
      str: 10, dex: 14, con: 15, int: 6, wis: 8, cha: 5,
      challenge_rating: '1/4',
      damage_vulnerabilities: 'bludgeoning',
      damage_immunities: 'poison',
      condition_immunities: 'exhaustion, poisoned',
      senses: 'darkvision 60 ft., passive Perception 9',
      languages: 'understands all languages it knew in life but can\'t speak',
      actions: [
        { name: 'Shortsword', description: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) piercing damage.' },
        { name: 'Shortbow', description: 'Ranged Weapon Attack: +4 to hit, range 80/320 ft., one target. Hit: 5 (1d6 + 2) piercing damage.' },
      ],
    },
  },
  {
    id: 'zombie', name: 'Zombie', monster_type: 'undead', size: 'medium', alignment: 'neutral evil',
    stat_block: {
      armor_class: 8, hit_points: '22 (3d8+9)', speed: '20 ft.',
      str: 13, dex: 6, con: 16, int: 3, wis: 6, cha: 5,
      challenge_rating: '1/4',
      saving_throws: 'Wis +0',
      damage_immunities: 'poison',
      condition_immunities: 'poisoned',
      senses: 'darkvision 60 ft., passive Perception 8',
      languages: 'understands the languages it knew in life but can\'t speak',
      special_abilities: [
        { name: 'Undead Fortitude', description: 'If damage reduces the zombie to 0 hit points, it must make a Constitution saving throw with a DC of 5 + the damage taken, unless the damage is radiant or from a critical hit. On a success, the zombie drops to 1 hit point instead.' },
      ],
      actions: [
        { name: 'Slam', description: 'Melee Weapon Attack: +3 to hit, reach 5 ft., one target. Hit: 4 (1d6 + 1) bludgeoning damage.' },
      ],
    },
  },
  {
    id: 'ghoul', name: 'Ghoul', monster_type: 'undead', size: 'medium', alignment: 'chaotic evil',
    stat_block: {
      armor_class: 12, hit_points: '22 (5d8)', speed: '30 ft.',
      str: 13, dex: 15, con: 10, int: 7, wis: 10, cha: 6,
      challenge_rating: '1',
      damage_immunities: 'poison',
      condition_immunities: 'charmed, exhaustion, poisoned',
      senses: 'darkvision 60 ft., passive Perception 10',
      languages: 'Common',
      actions: [
        { name: 'Bite', description: 'Melee Weapon Attack: +2 to hit, reach 5 ft., one creature. Hit: 9 (2d6 + 2) piercing damage.' },
        { name: 'Claws', description: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 7 (2d4 + 2) slashing damage. If the target is a creature other than an elf or undead, it must succeed on a DC 10 Constitution saving throw or be paralyzed for 1 minute.' },
      ],
    },
  },

  // ── Beasts ────────────────────────────────────────────────────────────────
  {
    id: 'wolf', name: 'Wolf', monster_type: 'beast', size: 'medium', alignment: 'unaligned',
    stat_block: {
      armor_class: 13, hit_points: '11 (2d8+2)', speed: '40 ft.',
      str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6,
      challenge_rating: '1/4',
      skills: { perception: '+3', stealth: '+4' },
      senses: 'passive Perception 13',
      languages: '—',
      special_abilities: [
        { name: 'Keen Hearing and Smell', description: 'The wolf has advantage on Wisdom (Perception) checks that rely on hearing or smell.' },
        { name: 'Pack Tactics', description: 'The wolf has advantage on an attack roll against a creature if at least one of the wolf\'s allies is within 5 feet of the creature and the ally isn\'t incapacitated.' },
      ],
      actions: [
        { name: 'Bite', description: 'Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 7 (2d4 + 2) piercing damage. If the target is a creature, it must succeed on a DC 11 Strength saving throw or be knocked prone.' },
      ],
    },
  },
  {
    id: 'giant-spider', name: 'Giant Spider', monster_type: 'beast', size: 'large', alignment: 'unaligned',
    stat_block: {
      armor_class: 14, hit_points: '26 (4d10+4)', speed: '30 ft., climb 30 ft.',
      str: 14, dex: 16, con: 12, int: 2, wis: 11, cha: 4,
      challenge_rating: '1',
      skills: { stealth: '+7' },
      senses: 'blindsight 10 ft., darkvision 60 ft., passive Perception 10',
      languages: '—',
      special_abilities: [
        { name: 'Spider Climb', description: 'The spider can climb difficult surfaces, including upside down on ceilings, without needing to make an ability check.' },
        { name: 'Web Sense', description: 'While in contact with a web, the spider knows the exact location of any other creature in contact with the same web.' },
        { name: 'Web Walker', description: 'The spider ignores movement restrictions caused by webbing.' },
      ],
      actions: [
        { name: 'Bite', description: 'Melee Weapon Attack: +5 to hit, reach 5 ft., one creature. Hit: 7 (1d8 + 3) piercing damage, and the target must make a DC 11 Constitution saving throw, taking 9 (2d8) poison damage on a failed save, or half as much damage on a successful one. If the poison damage reduces the target to 0 hit points, the target is stable but poisoned for 1 hour, even after regaining hit points, and is paralyzed while poisoned in this way.' },
        { name: 'Web (Recharge 5–6)', description: 'Ranged Weapon Attack: +5 to hit, range 30/60 ft., one creature. Hit: The target is restrained by webbing. As an action, the restrained target can make a DC 12 Strength check, bursting the webbing on a success. The webbing can also be attacked and destroyed (AC 10; hp 5; vulnerability to fire damage; immunity to bludgeoning, poison, and psychic damage).' },
      ],
    },
  },
  {
    id: 'brown-bear', name: 'Brown Bear', monster_type: 'beast', size: 'large', alignment: 'unaligned',
    stat_block: {
      armor_class: 11, hit_points: '34 (4d10+12)', speed: '40 ft., climb 30 ft.',
      str: 19, dex: 10, con: 16, int: 2, wis: 13, cha: 7,
      challenge_rating: '1',
      skills: { perception: '+3' },
      senses: 'passive Perception 13',
      languages: '—',
      special_abilities: [
        { name: 'Keen Smell', description: 'The bear has advantage on Wisdom (Perception) checks that rely on smell.' },
      ],
      actions: [
        { name: 'Multiattack', description: 'The bear makes two attacks: one with its bite and one with its claws.' },
        { name: 'Bite', description: 'Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 8 (1d8 + 4) piercing damage.' },
        { name: 'Claws', description: 'Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 11 (2d6 + 4) slashing damage.' },
      ],
    },
  },

  // ── Giants & Monstrosities ────────────────────────────────────────────────
  {
    id: 'ogre', name: 'Ogre', monster_type: 'giant', size: 'large', alignment: 'chaotic evil',
    stat_block: {
      armor_class: 11, hit_points: '59 (7d10+21)', speed: '40 ft.',
      str: 19, dex: 8, con: 16, int: 5, wis: 7, cha: 7,
      challenge_rating: '2',
      senses: 'darkvision 60 ft., passive Perception 8',
      languages: 'Common, Giant',
      actions: [
        { name: 'Greatclub', description: 'Melee Weapon Attack: +6 to hit, reach 5 ft., one target. Hit: 13 (2d8 + 4) bludgeoning damage.' },
        { name: 'Javelin', description: 'Melee or Ranged Weapon Attack: +6 to hit, reach 5 ft. or range 30/120 ft., one target. Hit: 11 (2d6 + 4) piercing damage.' },
      ],
    },
  },
  {
    id: 'owlbear', name: 'Owlbear', monster_type: 'monstrosity', size: 'large', alignment: 'unaligned',
    stat_block: {
      armor_class: 13, hit_points: '59 (7d10+21)', speed: '40 ft.',
      str: 20, dex: 12, con: 17, int: 3, wis: 12, cha: 7,
      challenge_rating: '3',
      skills: { perception: '+3' },
      senses: 'darkvision 60 ft., passive Perception 13',
      languages: '—',
      special_abilities: [
        { name: 'Keen Sight and Smell', description: 'The owlbear has advantage on Wisdom (Perception) checks that rely on sight or smell.' },
      ],
      actions: [
        { name: 'Multiattack', description: 'The owlbear makes two attacks: one with its beak and one with its claws.' },
        { name: 'Beak', description: 'Melee Weapon Attack: +7 to hit, reach 5 ft., one creature. Hit: 10 (1d10 + 5) piercing damage.' },
        { name: 'Claws', description: 'Melee Weapon Attack: +7 to hit, reach 5 ft., one target. Hit: 14 (2d8 + 5) slashing damage.' },
      ],
    },
  },
  {
    id: 'troll', name: 'Troll', monster_type: 'giant', size: 'large', alignment: 'chaotic evil',
    stat_block: {
      armor_class: 15, hit_points: '84 (8d10+40)', speed: '30 ft.',
      str: 18, dex: 13, con: 20, int: 7, wis: 9, cha: 7,
      challenge_rating: '5',
      skills: { perception: '+2' },
      senses: 'darkvision 60 ft., passive Perception 12',
      languages: 'Giant',
      special_abilities: [
        { name: 'Keen Smell', description: 'The troll has advantage on Wisdom (Perception) checks that rely on smell.' },
        { name: 'Regeneration', description: 'The troll regains 10 hit points at the start of its turn. If the troll takes acid or fire damage, this trait doesn\'t function at the start of the troll\'s next turn. The troll dies only if it starts its turn with 0 hit points and doesn\'t regenerate.' },
      ],
      actions: [
        { name: 'Multiattack', description: 'The troll makes three attacks: one with its bite and two with its claws.' },
        { name: 'Bite', description: 'Melee Weapon Attack: +7 to hit, reach 5 ft., one target. Hit: 7 (1d6 + 4) piercing damage.' },
        { name: 'Claw', description: 'Melee Weapon Attack: +7 to hit, reach 5 ft., one target. Hit: 11 (2d6 + 4) slashing damage.' },
      ],
    },
  },
]

export const MONSTER_TEMPLATE_CATEGORIES: MonsterTemplateCategory[] = [
  { label: 'Humanoids', templates: MONSTER_TEMPLATES.filter(t => t.monster_type === 'humanoid') },
  { label: 'Undead', templates: MONSTER_TEMPLATES.filter(t => t.monster_type === 'undead') },
  { label: 'Beasts', templates: MONSTER_TEMPLATES.filter(t => t.monster_type === 'beast') },
  { label: 'Giants & Monstrosities', templates: MONSTER_TEMPLATES.filter(t => t.monster_type === 'giant' || t.monster_type === 'monstrosity') },
]

export function getMonsterTemplate(id: string): MonsterTemplate | undefined {
  return MONSTER_TEMPLATES.find(t => t.id === id)
}
