export interface MetamagicOption {
  name: string
  sp_cost: string
  description: string
}

export const METAMAGIC_OPTIONS: MetamagicOption[] = [
  {
    name: "Careful Spell",
    sp_cost: "1",
    description: "When you cast a spell that forces other creatures to make a saving throw, you can spend 1 Sorcery Point to choose up to your Charisma modifier number of creatures (minimum of one). A chosen creature automatically succeeds on its saving throw against the spell.",
  },
  {
    name: "Distant Spell",
    sp_cost: "1",
    description: "When you cast a spell that has a range of 5 feet or more, you can spend 1 Sorcery Point to double the range of the spell. When you cast a spell that has a range of Touch, you can spend 1 Sorcery Point to make the range 30 feet.",
  },
  {
    name: "Empowered Spell",
    sp_cost: "1",
    description: "When you roll damage for a spell, you can spend 1 Sorcery Point to reroll a number of the damage dice up to your Charisma modifier (minimum of one). You must use the new rolls. You can use Empowered Spell even if you have already used a different Metamagic option during the casting of the spell.",
  },
  {
    name: "Extended Spell",
    sp_cost: "1",
    description: "When you cast a spell that has a duration of 1 minute or longer, you can spend 1 Sorcery Point to double its duration, to a maximum duration of 24 hours.",
  },
  {
    name: "Heightened Spell",
    sp_cost: "2",
    description: "When you cast a spell that forces a creature to make a saving throw to resist its effects, you can spend 2 Sorcery Points to give one target of the spell disadvantage on its first saving throw made against the spell.",
  },
  {
    name: "Quickened Spell",
    sp_cost: "2",
    description: "When you cast a spell that has a casting time of 1 action, you can spend 2 Sorcery Points to change the casting time to 1 bonus action for this casting.",
  },
  {
    name: "Seeking Spell",
    sp_cost: "2",
    description: "If you make an attack roll for a spell and miss, you can spend 2 Sorcery Points to reroll the d20, and you must use the new roll. You can use Seeking Spell even if you have already used a different Metamagic option during the casting of the spell.",
  },
  {
    name: "Subtle Spell",
    sp_cost: "1",
    description: "When you cast a spell, you can spend 1 Sorcery Point to cast it without any somatic or verbal components.",
  },
  {
    name: "Transmuted Spell",
    sp_cost: "1",
    description: "When you cast a spell that deals acid, cold, fire, lightning, poison, or thunder damage, you can spend 1 Sorcery Point to change that damage type to one of the other listed types.",
  },
  {
    name: "Twinned Spell",
    sp_cost: "1+ (spell level)",
    description: "When you cast a spell that targets only one creature and doesn't have a range of Self, you can spend a number of Sorcery Points equal to the spell's level (minimum of 1) to target a second creature in range with the same spell.",
  },
]

export const METAMAGIC_MAP = new Map(METAMAGIC_OPTIONS.map(o => [o.name, o]))
