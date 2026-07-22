// Hand-baked from the SRD 5.1 condition text (CC-BY 4.0, Wizards of the Coast),
// matching the shape Open5e exposes at /v1/conditions/. Re-run
// `node scripts/fetch-srd-conditions.mjs -- --edition=2014` to refresh from
// live Open5e if the upstream text ever changes — that script will overwrite
// this file.
//
// This is the 2014 (SRD 5.1) edition of the condition data. See
// `srdConditions2024.ts` for the 2024 (SRD 5.2) edition, and
// `conditionPatches.ts` for the per-edition override/fill-gap layer applied
// on top of both by `src/lib/conditions.ts`'s resolver.
import type { Condition } from "@/types/condition.types";

export const SRD_CONDITIONS_2014: Condition[] = [
  {
    id: "blinded",
    slug: "blinded",
    name: "Blinded",
    description:
      "- A blinded creature can't see and automatically fails any ability check that requires sight.\n" +
      "- Attack rolls against the creature have advantage, and the creature's attack rolls have disadvantage.",
    effects: [
      "A blinded creature can't see and automatically fails any ability check that requires sight.",
      "Attack rolls against the creature have advantage, and the creature's attack rolls have disadvantage.",
    ],
  },
  {
    id: "charmed",
    slug: "charmed",
    name: "Charmed",
    description:
      "- A charmed creature can't attack the charmer or target the charmer with harmful abilities or magical effects.\n" +
      "- The charmer has advantage on any ability check to interact socially with the creature.",
    effects: [
      "A charmed creature can't attack the charmer or target the charmer with harmful abilities or magical effects.",
      "The charmer has advantage on any ability check to interact socially with the creature.",
    ],
  },
  {
    id: "deafened",
    slug: "deafened",
    name: "Deafened",
    description:
      "- A deafened creature can't hear and automatically fails any ability check that requires hearing.",
    effects: [
      "A deafened creature can't hear and automatically fails any ability check that requires hearing.",
    ],
  },
  {
    id: "exhaustion",
    slug: "exhaustion",
    name: "Exhaustion",
    description:
      "Some special abilities and environmental hazards, such as starvation and the long-term effects of freezing or scorching temperatures, can lead to a special condition called exhaustion. Exhaustion is measured in six levels. An effect can give a creature one or more levels of exhaustion, as specified in the effect's description.\n\n" +
      "Level 1 — Disadvantage on ability checks.\n" +
      "Level 2 — Speed halved.\n" +
      "Level 3 — Disadvantage on attack rolls and saving throws.\n" +
      "Level 4 — Hit point maximum halved.\n" +
      "Level 5 — Speed reduced to 0.\n" +
      "Level 6 — Death.\n\n" +
      "If an already exhausted creature suffers another effect that causes exhaustion, its current level of exhaustion increases by the amount specified in the effect's description.\n" +
      "A creature suffers the effect of its current level of exhaustion as well as all lower levels. For example, a creature suffering level 2 exhaustion has its speed halved and has disadvantage on ability checks.\n" +
      "An effect that removes exhaustion reduces its level as specified in the effect's description, with all exhaustion effects ending if a creature's exhaustion level is reduced below 1.\n" +
      "Finishing a long rest reduces a creature's exhaustion level by 1, provided that the creature has also ingested some food and drink.",
    effects: [
      "Level 1 — Disadvantage on ability checks.",
      "Level 2 — Speed halved.",
      "Level 3 — Disadvantage on attack rolls and saving throws.",
      "Level 4 — Hit point maximum halved.",
      "Level 5 — Speed reduced to 0.",
      "Level 6 — Death.",
      "Finishing a long rest reduces a creature's exhaustion level by 1, provided that the creature has also ingested some food and drink.",
    ],
  },
  {
    id: "frightened",
    slug: "frightened",
    name: "Frightened",
    description:
      "- A frightened creature has disadvantage on ability checks and attack rolls while the source of its fear is within line of sight.\n" +
      "- The creature can't willingly move closer to the source of its fear.",
    effects: [
      "A frightened creature has disadvantage on ability checks and attack rolls while the source of its fear is within line of sight.",
      "The creature can't willingly move closer to the source of its fear.",
    ],
  },
  {
    id: "grappled",
    slug: "grappled",
    name: "Grappled",
    description:
      "- A grappled creature's speed becomes 0, and it can't benefit from any bonus to its speed.\n" +
      "- The condition ends if the grappler is incapacitated (see the condition).\n" +
      "- The condition also ends if an effect removes the grappled creature from the reach of the grappler or grappling effect, such as when a creature is hurled away by the thunderwave spell.",
    effects: [
      "A grappled creature's speed becomes 0, and it can't benefit from any bonus to its speed.",
      "The condition ends if the grappler is incapacitated.",
      "The condition also ends if an effect removes the grappled creature from the reach of the grappler or grappling effect.",
    ],
  },
  {
    id: "incapacitated",
    slug: "incapacitated",
    name: "Incapacitated",
    description: "- An incapacitated creature can't take actions or reactions.",
    effects: ["An incapacitated creature can't take actions or reactions."],
  },
  {
    id: "invisible",
    slug: "invisible",
    name: "Invisible",
    description:
      "- An invisible creature is impossible to see without the aid of magic or a special sense. For the purpose of hiding, the creature is heavily obscured. The creature's location can be detected by any noise it makes or any tracks it leaves.\n" +
      "- Attack rolls against the creature have disadvantage, and the creature's attack rolls have advantage.",
    effects: [
      "An invisible creature is impossible to see without the aid of magic or a special sense. For the purpose of hiding, the creature is heavily obscured.",
      "Attack rolls against the creature have disadvantage, and the creature's attack rolls have advantage.",
    ],
  },
  {
    id: "paralyzed",
    slug: "paralyzed",
    name: "Paralyzed",
    description:
      "- A paralyzed creature is incapacitated (see the condition) and can't move or speak.\n" +
      "- The creature automatically fails Strength and Dexterity saving throws.\n" +
      "- Attack rolls against the creature have advantage.\n" +
      "- Any attack that hits the creature is a critical hit if the attacker is within 5 feet of the creature.",
    effects: [
      "A paralyzed creature is incapacitated and can't move or speak.",
      "The creature automatically fails Strength and Dexterity saving throws.",
      "Attack rolls against the creature have advantage.",
      "Any attack that hits the creature is a critical hit if the attacker is within 5 feet of the creature.",
    ],
  },
  {
    id: "petrified",
    slug: "petrified",
    name: "Petrified",
    description:
      "- A petrified creature is transformed, along with any non-magical object it is wearing or carrying, into a solid inanimate substance (usually stone). Its weight increases by a factor of ten, and it ceases aging.\n" +
      "- The creature is incapacitated (see the condition), can't move or speak, and is unaware of its surroundings.\n" +
      "- Attack rolls against the creature have advantage.\n" +
      "- The creature automatically fails Strength and Dexterity saving throws.\n" +
      "- The creature has resistance to all damage.\n" +
      "- The creature is immune to poison and disease, although a poison or disease already in its system is suspended, not neutralized.",
    effects: [
      "A petrified creature is transformed, along with any non-magical object it is wearing or carrying, into a solid inanimate substance (usually stone). Its weight increases by a factor of ten, and it ceases aging.",
      "The creature is incapacitated, can't move or speak, and is unaware of its surroundings.",
      "Attack rolls against the creature have advantage.",
      "The creature automatically fails Strength and Dexterity saving throws.",
      "The creature has resistance to all damage.",
      "The creature is immune to poison and disease, although a poison or disease already in its system is suspended, not neutralized.",
    ],
  },
  {
    id: "poisoned",
    slug: "poisoned",
    name: "Poisoned",
    description:
      "- A poisoned creature has disadvantage on attack rolls and ability checks.",
    effects: [
      "A poisoned creature has disadvantage on attack rolls and ability checks.",
    ],
  },
  {
    id: "prone",
    slug: "prone",
    name: "Prone",
    description:
      "- A prone creature's only movement option is to crawl, unless it stands up and thereby ends the condition.\n" +
      "- The creature has disadvantage on attack rolls.\n" +
      "- An attack roll against the creature has advantage if the attacker is within 5 feet of the creature. Otherwise, the attack roll has disadvantage.",
    effects: [
      "A prone creature's only movement option is to crawl, unless it stands up and thereby ends the condition.",
      "The creature has disadvantage on attack rolls.",
      "An attack roll against the creature has advantage if the attacker is within 5 feet of the creature. Otherwise, the attack roll has disadvantage.",
    ],
  },
  {
    id: "restrained",
    slug: "restrained",
    name: "Restrained",
    description:
      "- A restrained creature's speed becomes 0, and it can't benefit from any bonus to its speed.\n" +
      "- Attack rolls against the creature have advantage, and the creature's attack rolls have disadvantage.\n" +
      "- The creature has disadvantage on Dexterity saving throws.",
    effects: [
      "A restrained creature's speed becomes 0, and it can't benefit from any bonus to its speed.",
      "Attack rolls against the creature have advantage, and the creature's attack rolls have disadvantage.",
      "The creature has disadvantage on Dexterity saving throws.",
    ],
  },
  {
    id: "stunned",
    slug: "stunned",
    name: "Stunned",
    description:
      "- A stunned creature is incapacitated (see the condition), can't move, and can speak only falteringly.\n" +
      "- The creature automatically fails Strength and Dexterity saving throws.\n" +
      "- Attack rolls against the creature have advantage.",
    effects: [
      "A stunned creature is incapacitated, can't move, and can speak only falteringly.",
      "The creature automatically fails Strength and Dexterity saving throws.",
      "Attack rolls against the creature have advantage.",
    ],
  },
  {
    id: "unconscious",
    slug: "unconscious",
    name: "Unconscious",
    description:
      "- An unconscious creature is incapacitated (see the condition), can't move or speak, and is unaware of its surroundings.\n" +
      "- The creature drops whatever it's holding and falls prone.\n" +
      "- The creature automatically fails Strength and Dexterity saving throws.\n" +
      "- Attack rolls against the creature have advantage.\n" +
      "- Any attack that hits the creature is a critical hit if the attacker is within 5 feet of the creature.",
    effects: [
      "An unconscious creature is incapacitated, can't move or speak, and is unaware of its surroundings.",
      "The creature drops whatever it's holding and falls prone.",
      "The creature automatically fails Strength and Dexterity saving throws.",
      "Attack rolls against the creature have advantage.",
      "Any attack that hits the creature is a critical hit if the attacker is within 5 feet of the creature.",
    ],
  },
];
