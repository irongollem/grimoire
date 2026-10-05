import type {
  FeatureChoice,
  FeatureMechanics,
} from "@/rules/features/mechanics.types";
import type { FeatCatalogue, FeatureCatalogue } from "./types";

/**
 * SRD 5.1 (2014): mechanics of the class and subclass features, by Open5e
 * record key. Mechanics only; the rules wording lives on the row. Levels are
 * levels in the granting class. Features that are purely passive (Evasion,
 * Unarmored Defense, Extra Attack) are absent on purpose.
 *
 * Not encoded, because the contract cannot say it: Magical Secrets and Mystic
 * Arcanum (spell choices, handled elsewhere), and Colossus Slayer's "only when
 * the target is below its hit point maximum" (the player ticks the rider).
 * Divine Smite's extra die against undead and fiends is a second rider the
 * player ticks alongside it. The Battle Master is not in the SRD, so
 * Superiority Dice and maneuvers are left to the 2014 PHB import.
 */

const asi: FeatureChoice = {
  key: "ability_score_improvement",
  label: "Ability Score Improvement",
  pick: { kind: "asi_or_feat" },
  count: { kind: "per_grant", amount: 1 },
  replace_on_level_up: false,
};

const asiFeature: FeatureMechanics = { choices: [asi] };

function fightingStyle(): FeatureMechanics {
  return {
    choices: [
      {
        key: "fighting_style",
        label: "Fighting Style",
        pick: { kind: "option", set: "fighting_style" },
        count: { kind: "per_grant", amount: 1 },
        replace_on_level_up: false,
      },
    ],
  };
}

function expertise(thievesTools: boolean): FeatureMechanics {
  return {
    choices: [
      {
        key: "expertise",
        label: "Expertise",
        pick: { kind: "expertise", thieves_tools: thievesTools },
        count: { kind: "per_grant", amount: 2 },
        replace_on_level_up: false,
      },
    ],
  };
}

const KI = { key: "ki_points", amount: 1 };

const DAMAGE_TYPES = [
  "acid",
  "bludgeoning",
  "cold",
  "fire",
  "force",
  "lightning",
  "necrotic",
  "piercing",
  "poison",
  "psychic",
  "radiant",
  "slashing",
  "thunder",
];

function customChoice(key: string, label: string, options: string[]): FeatureMechanics {
  return {
    choices: [
      { key, label, pick: { kind: "custom", options }, count: { kind: "per_grant", amount: 1 }, replace_on_level_up: false },
    ],
  };
}

const sorceryPoints: Record<string, number> = {};
for (let level = 2; level <= 20; level++) sorceryPoints[String(level)] = level;

export const SRD_2014_FEATURES: FeatureCatalogue = {
  // Barbarian
  "srd_barbarian_ability-score-improvement": asiFeature,
  srd_barbarian_rage: {
    activation: "bonus_action",
    uses: {
      key: "rage_uses",
      label: "Rage",
      amount: {
        kind: "unlimited_from",
        level: 20,
        below: {
          kind: "by_level",
          values: { "1": 2, "3": 3, "6": 4, "12": 5, "17": 6 },
        },
      },
      recharge: "long",
      pool: false,
    },
    scaling: {
      label: "Rage Damage",
      values: { "1": "+2", "9": "+3", "16": "+4" },
    },
    toggle: {
      key: "rage",
      label: "Rage",
      spends: { key: "rage_uses", amount: 1 },
      ends_on: "short_rest",
    },
    riders: [
      {
        label: "Rage",
        dice: { kind: "scaling" },
        applies_to: "melee_strength",
        once_per_turn: false,
        requires_toggle: "rage",
      },
    ],
  },
  "srd_barbarian_reckless-attack": { activation: "special" },
  "srd_barbarian_brutal-critical": {
    scaling: {
      label: "Extra Critical Dice",
      values: { "9": "1", "13": "2", "17": "3" },
    },
  },
  "srd_path-of-the-berserker_frenzy": { activation: "bonus_action" },
  "srd_path-of-the-berserker_intimidating-presence": { activation: "action" },
  "srd_path-of-the-berserker_retaliation": { activation: "reaction" },

  // Bard
  "srd_bard_ability-score-improvement": asiFeature,
  "srd_bard_bardic-inspiration": {
    activation: "bonus_action",
    uses: {
      key: "bardic_inspiration",
      label: "Bardic Inspiration",
      amount: { kind: "ability_mod", ability: "cha", min: 1 },
      recharge: "long",
      recharge_from: { level: 5, recharge: "short" },
      pool: false,
    },
    scaling: {
      label: "Inspiration Die",
      values: { "1": "d6", "5": "d8", "10": "d10", "15": "d12" },
    },
  },
  srd_bard_countercharm: { activation: "action" },
  srd_bard_expertise: expertise(false),
  "srd_bard_song-of-rest": {
    scaling: {
      label: "Song of Rest Die",
      values: { "2": "d6", "9": "d8", "13": "d10", "17": "d12" },
    },
  },
  "srd_college-of-lore_bonus-proficiencies": {
    choices: [
      {
        key: "bonus_proficiencies",
        label: "Bonus Proficiencies",
        pick: { kind: "skill", from: [] },
        count: { kind: "per_grant", amount: 3 },
        replace_on_level_up: false,
      },
    ],
  },
  "srd_college-of-lore_cutting-words": {
    activation: "reaction",
    spends: { key: "bardic_inspiration", amount: 1 },
  },
  "srd_college-of-lore_peerless-skill": {
    activation: "special",
    spends: { key: "bardic_inspiration", amount: 1 },
  },

  // Cleric
  "srd_cleric_ability-score-improvement": asiFeature,
  // Turn Undead is the cleric's base Channel Divinity option, so the record's own activation spends one use.
  "srd_cleric_channel-divinity": {
    activation: "action",
    spends: { key: "channel_divinity", amount: 1 },
    uses: {
      key: "channel_divinity",
      label: "Channel Divinity",
      amount: { kind: "by_level", values: { "2": 1, "6": 2, "18": 3 } },
      recharge: "short",
      pool: false,
    },
  },
  "srd_cleric_destroy-undead": {
    scaling: {
      label: "Destroy Undead CR",
      values: { "5": "1/2", "8": "1", "11": "2", "14": "3", "17": "4" },
    },
  },
  "srd_cleric_divine-intervention": {
    activation: "action",
    uses: {
      key: "divine_intervention",
      label: "Divine Intervention",
      amount: { kind: "fixed", value: 1 },
      recharge: "long",
      pool: false,
    },
  },
  "srd_life-domain_channel-divinity-preserve-life": {
    activation: "action",
    spends: { key: "channel_divinity", amount: 1 },
  },
  "srd_life-domain_divine-strike": {
    scaling: { label: "Divine Strike", values: { "8": "1d8", "14": "2d8" } },
    riders: [
      {
        label: "Divine Strike",
        dice: { kind: "scaling" },
        damage_type: "radiant",
        applies_to: "weapon",
        once_per_turn: true,
      },
    ],
  },

  // Druid
  "srd_druid_ability-score-improvement": asiFeature,
  // Wild Shape uses are tracked in the druid's own columns, so no uses here.
  "srd_druid_wild-shape": { activation: "action" },
  "srd_circle-of-the-land_natural-recovery": {
    activation: "special",
    uses: {
      key: "natural_recovery",
      label: "Natural Recovery",
      amount: { kind: "fixed", value: 1 },
      recharge: "long",
      pool: false,
    },
  },

  // Fighter
  "srd_fighter_ability-score-improvement": asiFeature,
  "srd_fighter_action-surge": {
    activation: "special",
    uses: {
      key: "action_surge",
      label: "Action Surge",
      amount: { kind: "by_level", values: { "2": 1, "17": 2 } },
      recharge: "short",
      pool: false,
    },
  },
  "srd_fighter_fighting-style": fightingStyle(),
  srd_fighter_indomitable: {
    activation: "special",
    uses: {
      key: "indomitable",
      label: "Indomitable",
      amount: { kind: "by_level", values: { "9": 1, "13": 2, "17": 3 } },
      recharge: "long",
      pool: false,
    },
  },
  "srd_fighter_second-wind": {
    activation: "bonus_action",
    uses: {
      key: "second_wind",
      label: "Second Wind",
      amount: { kind: "fixed", value: 1 },
      recharge: "short",
      pool: false,
    },
  },
  "srd_champion_additional-fighting-style": fightingStyle(),

  // Monk
  "srd_monk_ability-score-improvement": asiFeature,
  srd_monk_ki: {
    uses: {
      key: "ki_points",
      label: "Ki",
      amount: { kind: "class_level", multiplier: 1 },
      recharge: "short",
      pool: true,
    },
    actions: [
      { name: "Flurry of Blows", activation: "bonus_action", spends: KI },
      { name: "Patient Defense", activation: "bonus_action", spends: KI },
      { name: "Step of the Wind", activation: "bonus_action", spends: KI },
    ],
  },
  "srd_monk_martial-arts": {
    scaling: {
      label: "Martial Arts Die",
      values: { "1": "d4", "5": "d6", "11": "d8", "17": "d10" },
    },
  },
  "srd_monk_unarmored-movement": {
    scaling: {
      label: "Unarmored Movement",
      values: {
        "2": "+10 ft",
        "6": "+15 ft",
        "10": "+20 ft",
        "14": "+25 ft",
        "18": "+30 ft",
      },
    },
  },
  "srd_monk_deflect-missiles": { activation: "reaction" },
  "srd_monk_slow-fall": { activation: "reaction" },
  "srd_monk_stillness-of-mind": { activation: "action" },
  "srd_monk_empty-body": {
    activation: "action",
    spends: { key: "ki_points", amount: 4 },
  },
  "srd_monk_stunning-strike": {
    activation: "special",
    spends: KI,
  },
  "srd_way-of-the-open-hand_wholeness-of-body": {
    activation: "action",
    uses: {
      key: "wholeness_of_body",
      label: "Wholeness of Body",
      amount: { kind: "fixed", value: 1 },
      recharge: "long",
      pool: false,
    },
  },

  // Paladin
  "srd_paladin_ability-score-improvement": asiFeature,
  "srd_paladin_cleansing-touch": {
    activation: "action",
    uses: {
      key: "cleansing_touch",
      label: "Cleansing Touch",
      amount: { kind: "ability_mod", ability: "cha", min: 1 },
      recharge: "long",
      pool: false,
    },
  },
  "srd_paladin_divine-sense": {
    activation: "action",
    uses: {
      key: "divine_sense",
      label: "Divine Sense",
      amount: { kind: "ability_mod", ability: "cha", min: 1, bonus: 1 },
      recharge: "long",
      pool: false,
    },
  },
  "srd_paladin_divine-smite": {
    riders: [
      {
        label: "Divine Smite",
        dice: {
          kind: "slot",
          base: "2d8",
          base_level: 1,
          per_level: "1d8",
          max_dice: 5,
        },
        damage_type: "radiant",
        applies_to: "melee_weapon",
        once_per_turn: false,
        cost: { kind: "spell_slot" },
      },
      // The extra die is ticked together with Divine Smite; it has no cost of its own.
      {
        label: "Divine Smite (undead or fiend)",
        dice: { kind: "fixed", expression: "1d8" },
        damage_type: "radiant",
        applies_to: "melee_weapon",
        once_per_turn: false,
      },
    ],
  },
  "srd_paladin_fighting-style": fightingStyle(),
  "srd_paladin_improved-divine-smite": {
    riders: [
      {
        label: "Improved Divine Smite",
        dice: { kind: "fixed", expression: "1d8" },
        damage_type: "radiant",
        applies_to: "melee_weapon",
        once_per_turn: false,
      },
    ],
  },
  "srd_paladin_lay-on-hands": {
    activation: "action",
    uses: {
      key: "lay_on_hands",
      label: "Lay on Hands",
      amount: { kind: "class_level", multiplier: 5 },
      recharge: "long",
      pool: true,
    },
  },
  // The Paladin's Channel Divinity arrives with the oath (level 3), so the pool is declared here.
  // Sacred Weapon and Turn the Unholy live in this one record; either spends a use.
  "srd_oath-of-devotion_channel-divinity": {
    activation: "action",
    spends: { key: "channel_divinity", amount: 1 },
    uses: {
      key: "channel_divinity",
      label: "Channel Divinity",
      amount: { kind: "by_level", values: { "3": 1 } },
      recharge: "short",
      pool: false,
    },
  },
  "srd_oath-of-devotion_holy-nimbus": {
    activation: "action",
    uses: {
      key: "holy_nimbus",
      label: "Holy Nimbus",
      amount: { kind: "fixed", value: 1 },
      recharge: "long",
      pool: false,
    },
  },

  // Ranger
  "srd_ranger_ability-score-improvement": asiFeature,
  "srd_ranger_favored-enemy": {
    choices: [
      {
        key: "favored_enemy",
        label: "Favored Enemy",
        pick: { kind: "option", set: "favored_enemy" },
        count: { kind: "per_grant", amount: 1 },
        replace_on_level_up: false,
      },
    ],
  },
  "srd_ranger_fighting-style": fightingStyle(),
  "srd_ranger_natural-explorer": {
    choices: [
      {
        key: "favored_terrain",
        label: "Favored Terrain",
        pick: { kind: "option", set: "favored_terrain" },
        count: { kind: "known", values: { "1": 1, "6": 2, "10": 3 } },
        replace_on_level_up: false,
      },
    ],
  },

  // Colossus Slayer is one of Hunter's Prey's options, so its rider sits on the choice's feature for the player to tick.
  "srd_hunter_hunters-prey": {
    ...customChoice("hunters_prey", "Hunter's Prey", ["Colossus Slayer", "Giant Killer", "Horde Breaker"]),
    riders: [
      {
        label: "Colossus Slayer",
        dice: { kind: "fixed", expression: "1d8" },
        applies_to: "weapon",
        once_per_turn: true,
      },
    ],
  },
  "srd_hunter_defensive-tactics": customChoice("defensive_tactics", "Defensive Tactics", [
    "Escape the Horde",
    "Multiattack Defense",
    "Steel Will",
  ]),

  // Rogue
  "srd_rogue_ability-score-improvement": asiFeature,
  "srd_rogue_cunning-action": {
    activation: "bonus_action",
    actions: [
      { name: "Dash", activation: "bonus_action" },
      { name: "Disengage", activation: "bonus_action" },
      { name: "Hide", activation: "bonus_action" },
    ],
  },
  srd_rogue_expertise: expertise(true),
  "srd_rogue_sneak-attack": {
    scaling: {
      label: "Sneak Attack",
      values: {
        "1": "1d6",
        "3": "2d6",
        "5": "3d6",
        "7": "4d6",
        "9": "5d6",
        "11": "6d6",
        "13": "7d6",
        "15": "8d6",
        "17": "9d6",
        "19": "10d6",
      },
    },
    riders: [
      {
        label: "Sneak Attack",
        dice: { kind: "scaling" },
        applies_to: "finesse_or_ranged",
        once_per_turn: true,
      },
    ],
  },
  "srd_rogue_stroke-of-luck": {
    activation: "special",
    uses: {
      key: "stroke_of_luck",
      label: "Stroke of Luck",
      amount: { kind: "fixed", value: 1 },
      recharge: "short",
      pool: false,
    },
  },
  "srd_rogue_uncanny-dodge": { activation: "reaction" },
  "srd_thief_fast-hands": { activation: "bonus_action" },

  // Sorcerer
  "srd_sorcerer_ability-score-improvement": asiFeature,
  "srd_sorcerer_font-of-magic": {
    uses: {
      key: "sorcery_points",
      label: "Sorcery Points",
      amount: { kind: "by_level", values: sorceryPoints },
      recharge: "long",
      pool: true,
    },
  },
  srd_sorcerer_metamagic: {
    choices: [
      {
        key: "metamagic_options",
        label: "Metamagic",
        pick: { kind: "option", set: "metamagic" },
        count: { kind: "known", values: { "3": 2, "10": 3, "17": 4 } },
        replace_on_level_up: false,
      },
    ],
  },
  "srd_draconic-bloodline_dragon-wings": { activation: "bonus_action" },

  // Warlock
  "srd_warlock_ability-score-improvement": asiFeature,
  "srd_warlock_eldritch-invocations": {
    choices: [
      {
        key: "eldritch_invocations",
        label: "Eldritch Invocations",
        pick: { kind: "option", set: "eldritch_invocation" },
        count: {
          kind: "known",
          values: { "2": 2, "5": 3, "7": 4, "9": 5, "12": 6, "15": 7, "18": 8 },
        },
        replace_on_level_up: true,
      },
    ],
  },
  "srd_warlock_pact-boon": {
    choices: [
      {
        key: "pact_boon",
        label: "Pact Boon",
        pick: { kind: "option", set: "pact_boon" },
        count: { kind: "per_grant", amount: 1 },
        replace_on_level_up: false,
      },
    ],
  },
  "srd_warlock_eldritch-master": {
    activation: "special",
    uses: {
      key: "eldritch_master",
      label: "Eldritch Master",
      amount: { kind: "fixed", value: 1 },
      recharge: "long",
      pool: false,
    },
  },
  "srd_the-fiend_dark-ones-own-luck": {
    activation: "special",
    uses: {
      key: "dark_ones_own_luck",
      label: "Dark One's Own Luck",
      amount: { kind: "fixed", value: 1 },
      recharge: "short",
      pool: false,
    },
  },
  "srd_the-fiend_fiendish-resilience": customChoice("fiendish_resilience", "Fiendish Resilience", DAMAGE_TYPES),
  "srd_the-fiend_hurl-through-hell": {
    activation: "special",
    uses: {
      key: "hurl_through_hell",
      label: "Hurl Through Hell",
      amount: { kind: "fixed", value: 1 },
      recharge: "long",
      pool: false,
    },
  },

  // Wizard
  "srd_wizard_ability-score-improvement": asiFeature,
  "srd_wizard_arcane-recovery": {
    activation: "special",
    uses: {
      key: "arcane_recovery",
      label: "Arcane Recovery",
      amount: { kind: "fixed", value: 1 },
      recharge: "long",
      pool: false,
    },
  },
};

/** SRD 5.1 (2014) feats, by Open5e record key. */
export const SRD_2014_FEATS: FeatCatalogue = {
  srd_grappler: {
    category: null,
    prerequisites: { abilities: { any_of: { str: 13 } } },
    repeatable: false,
    ability_increase: null,
    mechanics: {},
  },
};
