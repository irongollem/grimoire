import type { RulesetKey } from "@/types/ruleset.types";

export interface MetamagicOption {
  name: string
  sp_cost: string
  description: string
}

const SHARED_OPTIONS: Record<"Distant Spell" | "Empowered Spell" | "Transmuted Spell", MetamagicOption> = {
  "Distant Spell": {
    name: "Distant Spell",
    sp_cost: "1",
    description: "When you cast a spell that has a range of 5 feet or more, you can spend 1 Sorcery Point to double the range of the spell. When you cast a spell that has a range of Touch, you can spend 1 Sorcery Point to make the range 30 feet.",
  },
  "Empowered Spell": {
    name: "Empowered Spell",
    sp_cost: "1",
    description: "When you roll damage for a spell, you can spend 1 Sorcery Point to reroll a number of the damage dice up to your Charisma modifier (minimum of one). You must use the new rolls. You can use Empowered Spell even if you have already used a different Metamagic option during the casting of the spell.",
  },
  "Transmuted Spell": {
    name: "Transmuted Spell",
    sp_cost: "1",
    description: "When you cast a spell that deals acid, cold, fire, lightning, poison, or thunder damage, you can spend 1 Sorcery Point to change that damage type to one of the other listed types.",
  },
};

export const METAMAGIC_OPTIONS_2014: MetamagicOption[] = [
  {
    name: "Careful Spell",
    sp_cost: "1",
    description: "When you cast a spell that forces other creatures to make a saving throw, you can spend 1 Sorcery Point to choose up to your Charisma modifier number of creatures (minimum of one). A chosen creature automatically succeeds on its saving throw against the spell.",
  },
  SHARED_OPTIONS["Distant Spell"],
  SHARED_OPTIONS["Empowered Spell"],
  {
    name: "Extended Spell",
    sp_cost: "1",
    description: "When you cast a spell that has a duration of 1 minute or longer, you can spend 1 Sorcery Point to double its duration, to a maximum duration of 24 hours.",
  },
  {
    name: "Heightened Spell",
    sp_cost: "3",
    description: "When you cast a spell that forces a creature to make a saving throw to resist its effects, you can spend 3 Sorcery Points to give one target disadvantage on its first saving throw against the spell.",
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
  SHARED_OPTIONS["Transmuted Spell"],
  {
    name: "Twinned Spell",
    sp_cost: "1+ (spell level)",
    description: "When you cast a spell that targets only one creature and doesn't have a range of Self, spend Sorcery Points equal to the spell's level (minimum 1) to target a second creature in range with the same spell.",
  },
];

export const METAMAGIC_OPTIONS_2024: MetamagicOption[] = [
  {
    name: "Careful Spell",
    sp_cost: "1",
    description: "When you cast a spell that forces creatures to make a saving throw, spend 1 Sorcery Point and choose up to your Charisma modifier number of creatures (minimum one). They automatically succeed and take no damage if a successful save would normally halve the damage.",
  },
  SHARED_OPTIONS["Distant Spell"],
  SHARED_OPTIONS["Empowered Spell"],
  {
    name: "Extended Spell",
    sp_cost: "1",
    description: "When you cast a spell with a duration of 1 minute or longer, spend 1 Sorcery Point to double its duration, up to 24 hours. You also have advantage on saves made to maintain concentration on that spell.",
  },
  {
    name: "Heightened Spell",
    sp_cost: "2",
    description: "When you cast a spell that forces a creature to make a saving throw, spend 2 Sorcery Points to give one target disadvantage on its saving throws against the spell.",
  },
  {
    name: "Quickened Spell",
    sp_cost: "2",
    description: "When you cast a spell with a casting time of an action, spend 2 Sorcery Points to make it a bonus action. You can't use this after casting a level 1+ spell this turn, and can't cast another level 1+ spell afterward that turn.",
  },
  {
    name: "Seeking Spell",
    sp_cost: "1",
    description: "If you miss with a spell attack roll, spend 1 Sorcery Point to reroll the d20 and use the new roll. You can use Seeking Spell even if another Metamagic option was used for the spell.",
  },
  {
    name: "Subtle Spell",
    sp_cost: "1",
    description: "When you cast a spell, spend 1 Sorcery Point to cast it without verbal, somatic, or material components, except material components that are consumed or have a cost specified by the spell.",
  },
  SHARED_OPTIONS["Transmuted Spell"],
  {
    name: "Twinned Spell",
    sp_cost: "1",
    description: "When you cast a spell that can be cast with a higher-level slot to target one additional creature, spend 1 Sorcery Point to increase the spell's effective level by 1 for that purpose.",
  },
];

export function getMetamagicOptions(ruleset: RulesetKey): MetamagicOption[] {
  return ruleset === "2024" ? METAMAGIC_OPTIONS_2024 : METAMAGIC_OPTIONS_2014;
}

export function getMetamagicMap(ruleset: RulesetKey): Map<string, MetamagicOption> {
  return new Map(getMetamagicOptions(ruleset).map(option => [option.name, option]));
}

// Existing level-up definitions currently describe the 2014 class progression.
export const METAMAGIC_OPTIONS = METAMAGIC_OPTIONS_2014;
export const METAMAGIC_MAP = getMetamagicMap("2014");
