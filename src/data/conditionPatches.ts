// Per-edition override/fill-gap layer applied last by the resolver in
// `src/lib/conditions.ts` (`getConditions()` / `getCondition()`), on top of
// the base `SRD_CONDITIONS_2014` / `SRD_CONDITIONS_2024` arrays.
//
// Open5e has no structured 2024 condition data yet (open5e-api#793) — see
// the header comment in `srdConditions2024.ts` for what was actually
// checked and when. Until upstream data exists, this file is where 2024
// condition text lives; once open5e-api#793 ships, a regeneration script
// (`scripts/fetch-srd-conditions.mjs --edition=2024`) can replace
// `srdConditions2024.ts` wholesale, and this map should shrink back down to
// just genuine overrides/gaps rather than carrying full entries.
//
// Every 2024 entry below was verified line-by-line against the official
// 2024 rules glossary (D&D Beyond free rules, which carries the same
// condition text as SRD 5.2, CC-BY-4.0) on 2026-07-22. The glossary is
// written in second person ("you"); it is kept verbatim rather than
// restyled to the 2014 file's third person so future diffs against the
// source stay trivial.
import type { Condition } from "@/types/condition.types";
import type { RulesetKey } from "@/types/ruleset.types";

/**
 * Patch map for a single edition: condition id -> complete replacement
 * `Condition` record. An entry here fully replaces the base condition —
 * there is no field-level merge with `SRD_CONDITIONS_2014`/`2024` — so
 * every field (name, description, effects) must be filled in, not just the
 * ones that differ.
 */
export type ConditionPatchMap = Record<string, Condition>;

export const CONDITION_PATCHES: Record<RulesetKey, ConditionPatchMap> = {
  // 2014 (SRD 5.1) text is already complete and accurate in
  // `srdConditions2014.ts` — no patches needed.
  "2014": {},

  // 2024 (SRD 5.2) — see file header above.
  "2024": {
    blinded: {
      id: "blinded",
      slug: "blinded",
      name: "Blinded",
      description:
        "- Can't See. You can't see and automatically fail any ability check that requires sight.\n" +
        "- Attacks Affected. Attack rolls against you have Advantage, and your attack rolls have Disadvantage.",
      effects: [
        "Can't See. You can't see and automatically fail any ability check that requires sight.",
        "Attacks Affected. Attack rolls against you have Advantage, and your attack rolls have Disadvantage.",
      ],
    },
    charmed: {
      id: "charmed",
      slug: "charmed",
      name: "Charmed",
      description:
        "- Can't Harm the Charmer. You can't attack the charmer or target the charmer with damaging abilities or magical effects.\n" +
        "- Social Advantage. The charmer has Advantage on any ability check to interact with you socially.",
      effects: [
        "Can't Harm the Charmer. You can't attack the charmer or target the charmer with damaging abilities or magical effects.",
        "Social Advantage. The charmer has Advantage on any ability check to interact with you socially.",
      ],
    },
    deafened: {
      id: "deafened",
      slug: "deafened",
      name: "Deafened",
      description:
        "- Can't Hear. You can't hear and automatically fail any ability check that requires hearing.",
      effects: [
        "Can't Hear. You can't hear and automatically fail any ability check that requires hearing.",
      ],
    },
    exhaustion: {
      id: "exhaustion",
      slug: "exhaustion",
      name: "Exhaustion",
      description:
        "- Exhaustion Levels. This condition is cumulative. Each time you receive it, you gain 1 Exhaustion level. You die if your Exhaustion level is 6.\n" +
        "- D20 Tests Affected. When you make a D20 Test, the roll is reduced by 2 times your Exhaustion level.\n" +
        "- Speed Reduced. Your Speed is reduced by a number of feet equal to 5 times your Exhaustion level.\n" +
        "- Removing Exhaustion Levels. Finishing a Long Rest removes 1 of your Exhaustion levels. When your Exhaustion level reaches 0, the condition ends.",
      effects: [
        "Exhaustion Levels. This condition is cumulative. Each time you receive it, you gain 1 Exhaustion level. You die if your Exhaustion level is 6.",
        "D20 Tests Affected. When you make a D20 Test, the roll is reduced by 2 times your Exhaustion level.",
        "Speed Reduced. Your Speed is reduced by a number of feet equal to 5 times your Exhaustion level.",
        "Removing Exhaustion Levels. Finishing a Long Rest removes 1 of your Exhaustion levels. When your Exhaustion level reaches 0, the condition ends.",
      ],
    },
    frightened: {
      id: "frightened",
      slug: "frightened",
      name: "Frightened",
      description:
        "- Ability Checks and Attacks Affected. You have Disadvantage on ability checks and attack rolls while the source of fear is within line of sight.\n" +
        "- Can't Approach. You can't willingly move closer to the source of fear.",
      effects: [
        "Ability Checks and Attacks Affected. You have Disadvantage on ability checks and attack rolls while the source of fear is within line of sight.",
        "Can't Approach. You can't willingly move closer to the source of fear.",
      ],
    },
    grappled: {
      id: "grappled",
      slug: "grappled",
      name: "Grappled",
      description:
        "- Speed 0. Your Speed is 0 and can't increase.\n" +
        "- Attacks Affected. You have Disadvantage on attack rolls against any target other than the grappler.\n" +
        "- Movable. The grappler can drag or carry you when it moves, but every foot of movement costs it 1 extra foot unless you are Tiny or two or more sizes smaller than it.",
      effects: [
        "Speed 0. Your Speed is 0 and can't increase.",
        "Attacks Affected. You have Disadvantage on attack rolls against any target other than the grappler.",
        "Movable. The grappler can drag or carry you when it moves, but every foot of movement costs it 1 extra foot unless you are Tiny or two or more sizes smaller than it.",
      ],
    },
    incapacitated: {
      id: "incapacitated",
      slug: "incapacitated",
      name: "Incapacitated",
      description:
        "- Inactive. You can't take any action, Bonus Action, or Reaction.\n" +
        "- No Concentration. Your Concentration is broken.\n" +
        "- Speechless. You can't speak.\n" +
        "- Surprised. If you're Incapacitated when you roll Initiative, you have Disadvantage on the roll.",
      effects: [
        "Inactive. You can't take any action, Bonus Action, or Reaction.",
        "No Concentration. Your Concentration is broken.",
        "Speechless. You can't speak.",
        "Surprised. If you're Incapacitated when you roll Initiative, you have Disadvantage on the roll.",
      ],
    },
    invisible: {
      id: "invisible",
      slug: "invisible",
      name: "Invisible",
      description:
        "- Surprise. If you're Invisible when you roll Initiative, you have Advantage on the roll.\n" +
        "- Concealed. You aren't affected by any effect that requires its target to be seen unless the effect's creator can somehow see you. Any equipment you are wearing or carrying is also concealed.\n" +
        "- Attacks Affected. Attack rolls against you have Disadvantage, and your attack rolls have Advantage. If a creature can somehow see you, you don't gain this benefit against that creature.",
      effects: [
        "Surprise. If you're Invisible when you roll Initiative, you have Advantage on the roll.",
        "Concealed. You aren't affected by any effect that requires its target to be seen unless the effect's creator can somehow see you. Any equipment you are wearing or carrying is also concealed.",
        "Attacks Affected. Attack rolls against you have Disadvantage, and your attack rolls have Advantage. If a creature can somehow see you, you don't gain this benefit against that creature.",
      ],
    },
    paralyzed: {
      id: "paralyzed",
      slug: "paralyzed",
      name: "Paralyzed",
      description:
        "- Incapacitated. You have the Incapacitated condition.\n" +
        "- Speed 0. Your Speed is 0 and can't increase.\n" +
        "- Saving Throws Affected. You automatically fail Strength and Dexterity saving throws.\n" +
        "- Attacks Affected. Attack rolls against you have Advantage.\n" +
        "- Automatic Critical Hits. Any attack roll that hits you is a Critical Hit if the attacker is within 5 feet of you.",
      effects: [
        "Incapacitated. You have the Incapacitated condition.",
        "Speed 0. Your Speed is 0 and can't increase.",
        "Saving Throws Affected. You automatically fail Strength and Dexterity saving throws.",
        "Attacks Affected. Attack rolls against you have Advantage.",
        "Automatic Critical Hits. Any attack roll that hits you is a Critical Hit if the attacker is within 5 feet of you.",
      ],
    },
    petrified: {
      id: "petrified",
      slug: "petrified",
      name: "Petrified",
      description:
        "- Turned to Inanimate Substance. You are transformed, along with any nonmagical objects you are wearing and carrying, into a solid inanimate substance (usually stone). Your weight increases by a factor of ten, and you cease aging.\n" +
        "- Incapacitated. You have the Incapacitated condition.\n" +
        "- Speed 0. Your Speed is 0 and can't increase.\n" +
        "- Attacks Affected. Attack rolls against you have Advantage.\n" +
        "- Saving Throws Affected. You automatically fail Strength and Dexterity saving throws.\n" +
        "- Resist Damage. You have Resistance to all damage.\n" +
        "- Poison Immunity. You have Immunity to the Poisoned condition.",
      effects: [
        "Turned to Inanimate Substance. You are transformed, along with any nonmagical objects you are wearing and carrying, into a solid inanimate substance (usually stone). Your weight increases by a factor of ten, and you cease aging.",
        "Incapacitated. You have the Incapacitated condition.",
        "Speed 0. Your Speed is 0 and can't increase.",
        "Attacks Affected. Attack rolls against you have Advantage.",
        "Saving Throws Affected. You automatically fail Strength and Dexterity saving throws.",
        "Resist Damage. You have Resistance to all damage.",
        "Poison Immunity. You have Immunity to the Poisoned condition.",
      ],
    },
    poisoned: {
      id: "poisoned",
      slug: "poisoned",
      name: "Poisoned",
      description:
        "- Ability Checks and Attacks Affected. You have Disadvantage on attack rolls and ability checks.",
      effects: [
        "Ability Checks and Attacks Affected. You have Disadvantage on attack rolls and ability checks.",
      ],
    },
    prone: {
      id: "prone",
      slug: "prone",
      name: "Prone",
      description:
        "- Restricted Movement. Your only movement options are to crawl or to spend an amount of movement equal to half your Speed (round down) to right yourself and thereby end the condition. If your Speed is 0, you can't right yourself.\n" +
        "- Attacks Affected. You have Disadvantage on attack rolls. An attack roll against you has Advantage if the attacker is within 5 feet of you. Otherwise, that attack roll has Disadvantage.",
      effects: [
        "Restricted Movement. Your only movement options are to crawl or to spend an amount of movement equal to half your Speed (round down) to right yourself and thereby end the condition. If your Speed is 0, you can't right yourself.",
        "Attacks Affected. You have Disadvantage on attack rolls. An attack roll against you has Advantage if the attacker is within 5 feet of you. Otherwise, that attack roll has Disadvantage.",
      ],
    },
    restrained: {
      id: "restrained",
      slug: "restrained",
      name: "Restrained",
      description:
        "- Speed 0. Your Speed is 0 and can't increase.\n" +
        "- Attacks Affected. Attack rolls against you have Advantage, and your attack rolls have Disadvantage.\n" +
        "- Saving Throws Affected. You have Disadvantage on Dexterity saving throws.",
      effects: [
        "Speed 0. Your Speed is 0 and can't increase.",
        "Attacks Affected. Attack rolls against you have Advantage, and your attack rolls have Disadvantage.",
        "Saving Throws Affected. You have Disadvantage on Dexterity saving throws.",
      ],
    },
    stunned: {
      id: "stunned",
      slug: "stunned",
      name: "Stunned",
      description:
        "- Incapacitated. You have the Incapacitated condition.\n" +
        "- Saving Throws Affected. You automatically fail Strength and Dexterity saving throws.\n" +
        "- Attacks Affected. Attack rolls against you have Advantage.",
      effects: [
        "Incapacitated. You have the Incapacitated condition.",
        "Saving Throws Affected. You automatically fail Strength and Dexterity saving throws.",
        "Attacks Affected. Attack rolls against you have Advantage.",
      ],
    },
    unconscious: {
      id: "unconscious",
      slug: "unconscious",
      name: "Unconscious",
      description:
        "- Inert. You have the Incapacitated and Prone conditions, and you drop whatever you're holding. When this condition ends, you remain Prone.\n" +
        "- Speed 0. Your Speed is 0 and can't increase.\n" +
        "- Attacks Affected. Attack rolls against you have Advantage.\n" +
        "- Saving Throws Affected. You automatically fail Strength and Dexterity saving throws.\n" +
        "- Automatic Critical Hits. Any attack roll that hits you is a Critical Hit if the attacker is within 5 feet of you.\n" +
        "- Unaware. You're unaware of your surroundings.",
      effects: [
        "Inert. You have the Incapacitated and Prone conditions, and you drop whatever you're holding. When this condition ends, you remain Prone.",
        "Speed 0. Your Speed is 0 and can't increase.",
        "Attacks Affected. Attack rolls against you have Advantage.",
        "Saving Throws Affected. You automatically fail Strength and Dexterity saving throws.",
        "Automatic Critical Hits. Any attack roll that hits you is a Critical Hit if the attacker is within 5 feet of you.",
        "Unaware. You're unaware of your surroundings.",
      ],
    },
  },
};
