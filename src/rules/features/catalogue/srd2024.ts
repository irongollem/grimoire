import type { FeatCatalogue, FeatCatalogueEntry, FeatureCatalogue } from "./types";
import type { FeatureChoice, FeatureMechanics } from "@/rules/features/mechanics.types";

// Mechanics only, never rules text. Keys are Open5e v2 record keys of the
// srd-2024 document. Levels are levels in the granting class. Not expressible
// in the contract, so left out: Brutal Strike and Cunning Strike options (per
// attack, not choices), Frenzy's extra dice equal to the Rage Damage, Skilled's
// tool choice, Rage's link to Intimidating Presence (its alternative Rage
// cost), spell-granting features (spell lists, Mystic Arcanum).

/** In 2024 the Ability Score Improvement is itself the General feat of that name. */
const ASI: FeatureChoice = {
  key: "ability_score_improvement",
  label: "Ability Score Improvement",
  pick: { kind: "feat", categories: ["general"] },
  count: { kind: "per_grant", amount: 1 },
  replace_on_level_up: false,
};
const EPIC_BOON: FeatureChoice = {
  key: "epic_boon",
  label: "Epic Boon",
  pick: { kind: "feat", categories: ["epic_boon"] },
  count: { kind: "per_grant", amount: 1 },
  replace_on_level_up: false,
};
const FIGHTING_STYLE: FeatureChoice = {
  key: "fighting_style",
  label: "Fighting Style",
  pick: { kind: "feat", categories: ["fighting_style"] },
  count: { kind: "per_grant", amount: 1 },
  replace_on_level_up: false,
};

const withChoice = (choice: FeatureChoice): FeatureMechanics => ({ choices: [choice] });
const asi = (): FeatureMechanics => withChoice(ASI);
const epicBoon = (): FeatureMechanics => withChoice(EPIC_BOON);

const weaponMastery = (values: Record<string, number>): FeatureMechanics =>
  withChoice({
    key: "weapon_masteries",
    label: "Weapon Mastery",
    pick: { kind: "option", set: "weapon_mastery" },
    count: { kind: "known", values },
    replace_on_level_up: true,
  });

const expertise = (amount: number): FeatureMechanics =>
  withChoice({
    key: "expertise",
    label: "Expertise",
    pick: { kind: "expertise", thieves_tools: false },
    count: { kind: "per_grant", amount },
    replace_on_level_up: false,
  });

const customChoice = (key: string, label: string, options: string[]): FeatureMechanics =>
  withChoice({
    key,
    label,
    pick: { kind: "custom", options },
    count: { kind: "per_grant", amount: 1 },
    replace_on_level_up: false,
  });

const FOCUS = { key: "ki_points", amount: 1 };
const CHANNEL = { key: "channel_divinity", amount: 1 };
const BARDIC = { key: "bardic_inspiration", amount: 1 };

/** A once-per-long-rest feature with a single use. */
const oncePerLongRest = (key: string, label: string): FeatureMechanics["uses"] => ({
  key,
  label,
  amount: { kind: "fixed", value: 1 },
  recharge: "long",
  pool: false,
});

const wisModUses = (key: string, label: string): FeatureMechanics["uses"] => ({
  key,
  label,
  amount: { kind: "ability_mod", ability: "wis", min: 1 },
  recharge: "long",
  pool: false,
});

/** SRD 5.2 (2024): mechanics of the class and subclass features, by Open5e record key. */
export const SRD_2024_FEATURES: FeatureCatalogue = {
  // Barbarian
  "srd-2024_barbarian_rage": {
    activation: "bonus_action",
    uses: {
      key: "rage_uses",
      label: "Rage",
      amount: { kind: "by_level", values: { "1": 2, "3": 3, "6": 4, "12": 5, "17": 6 } },
      recharge: "long",
      short_rest_regain: 1,
      pool: false,
    },
    scaling: { label: "Rage Damage", values: { "1": "+2", "9": "+3", "16": "+4" } },
    // 2024 Rage damage applies to a Strength attack with a weapon or an Unarmed Strike, so it rides both.
    riders: [
      { label: "Rage", dice: { kind: "scaling" }, applies_to: "melee_strength", once_per_turn: false, requires_toggle: "rage" },
      { label: "Rage", dice: { kind: "scaling" }, applies_to: "unarmed", once_per_turn: false, requires_toggle: "rage" },
    ],
    toggle: { key: "rage", label: "Rage", spends: { key: "rage_uses", amount: 1 }, ends_on: "short_rest" },
  },
  "srd-2024_barbarian_weapon-mastery": weaponMastery({ "1": 2, "4": 3, "10": 4 }),
  "srd-2024_barbarian_primal-knowledge": withChoice({
    key: "primal_knowledge_skill",
    label: "Primal Knowledge",
    pick: { kind: "skill", from: ["animal_handling", "athletics", "intimidation", "nature", "perception", "survival"] },
    count: { kind: "per_grant", amount: 1 },
    replace_on_level_up: false,
  }),
  "srd-2024_barbarian_ability-score-improvement": asi(),
  "srd-2024_barbarian_epic-boon": epicBoon(),
  "srd-2024_path-of-the-berserker_intimidating-presence": {
    activation: "bonus_action",
    uses: oncePerLongRest("intimidating_presence", "Intimidating Presence"),
  },
  "srd-2024_path-of-the-berserker_retaliation": { activation: "reaction" },

  // Bard
  "srd-2024_bard_bardic-inspiration": {
    activation: "bonus_action",
    uses: {
      key: "bardic_inspiration",
      label: "Bardic Inspiration",
      amount: { kind: "ability_mod", ability: "cha", min: 1 },
      recharge: "long",
      recharge_from: { level: 5, recharge: "short" },
      pool: false,
    },
    scaling: { label: "Bardic Die", values: { "1": "d6", "5": "d8", "10": "d10", "15": "d12" } },
  },
  // The record lists only level 2 as its grant, but Bard Expertise is also taken at 9, so the total is what counts.
  "srd-2024_bard_expertise": withChoice({
    key: "expertise",
    label: "Expertise",
    pick: { kind: "expertise", thieves_tools: false },
    count: { kind: "known", values: { "2": 2, "9": 4 } },
    replace_on_level_up: false,
  }),
  "srd-2024_bard_countercharm": { activation: "reaction" },
  "srd-2024_bard_ability-score-improvement": asi(),
  "srd-2024_bard_epic-boon": epicBoon(),
  "srd-2024_college-of-lore_bonus-proficiencies": withChoice({
    key: "lore_bonus_proficiencies",
    label: "Bonus Proficiencies",
    pick: { kind: "skill", from: [] },
    count: { kind: "per_grant", amount: 3 },
    replace_on_level_up: false,
  }),
  "srd-2024_college-of-lore_cutting-words": { activation: "reaction", spends: BARDIC },
  "srd-2024_college-of-lore_peerless-skill": { activation: "special", spends: BARDIC },

  // Cleric
  "srd-2024_cleric_divine-order": customChoice("divine_order", "Divine Order", ["Protector", "Thaumaturge"]),
  // Turn Undead and Divine Spark are both actions that spend one use.
  "srd-2024_cleric_channel-divinity": {
    activation: "action",
    spends: CHANNEL,
    uses: {
      key: "channel_divinity",
      label: "Channel Divinity",
      amount: { kind: "by_level", values: { "2": 2, "6": 3, "18": 4 } },
      recharge: "long",
      short_rest_regain: 1,
      pool: false,
    },
  },
  "srd-2024_cleric_blessed-strikes": customChoice("blessed_strikes", "Blessed Strikes", ["Divine Strike", "Potent Spellcasting"]),
  "srd-2024_cleric_divine-intervention": { activation: "action", uses: oncePerLongRest("divine_intervention", "Divine Intervention") },
  "srd-2024_cleric_ability-score-improvement": asi(),
  "srd-2024_cleric_epic-boon": epicBoon(),
  "srd-2024_cleric_life-domain_preserve-life": { activation: "action", spends: CHANNEL },

  // Druid
  "srd-2024_druid_primal-order": customChoice("primal_order", "Primal Order", ["Magician", "Warden"]),
  // Wild Shape's uses are a column of the druid's own table, not a feature-level amount, so none are encoded here.
  "srd-2024_druid_wild-shape": {
    activation: "bonus_action",
    choices: [
      {
        key: "wild_shape_known_forms",
        label: "Known Forms",
        pick: { kind: "option", set: "wild_shape_form" },
        count: { kind: "known", values: { "2": 4, "4": 6, "8": 8 } },
        replace_on_level_up: true,
      },
    ],
  },
  "srd-2024_druid_ability-score-improvement": asi(),
  "srd-2024_druid_epic-boon": epicBoon(),
  "srd-2024_druid_circle-of-the-land_lands-aid": { activation: "action" },
  "srd-2024_druid_circle-of-the-land_natural-recovery": { uses: oncePerLongRest("natural_recovery", "Natural Recovery") },

  // Fighter
  "srd-2024_fighter_fighting-style": withChoice(FIGHTING_STYLE),
  "srd-2024_fighter_weapon-mastery": weaponMastery({ "1": 3, "4": 4, "10": 5, "16": 6 }),
  "srd-2024_fighter_second-wind": {
    activation: "bonus_action",
    uses: {
      key: "second_wind",
      label: "Second Wind",
      amount: { kind: "by_level", values: { "1": 2, "4": 3, "10": 4 } },
      recharge: "long",
      short_rest_regain: 1,
      pool: false,
    },
  },
  "srd-2024_fighter_action-surge": {
    activation: "special",
    uses: {
      key: "action_surge",
      label: "Action Surge",
      amount: { kind: "by_level", values: { "2": 1, "17": 2 } },
      recharge: "short",
      pool: false,
    },
  },
  "srd-2024_fighter_indomitable": {
    uses: {
      key: "indomitable",
      label: "Indomitable",
      amount: { kind: "by_level", values: { "9": 1, "13": 2, "17": 3 } },
      recharge: "long",
      pool: false,
    },
  },
  "srd-2024_fighter_ability-score-improvement": asi(),
  "srd-2024_fighter_epic-boon": epicBoon(),
  "srd-2024_fighter_champion_additional-fighting-style": withChoice({ ...FIGHTING_STYLE, key: "additional_fighting_style", label: "Additional Fighting Style" }),

  // Monk
  "srd-2024_monk_martial-arts": {
    scaling: { label: "Martial Arts Die", values: { "1": "1d6", "5": "1d8", "11": "1d10", "17": "1d12" } },
  },
  "srd-2024_monk_monks-focus": {
    uses: {
      key: "ki_points",
      label: "Focus Points",
      amount: { kind: "class_level", multiplier: 1 },
      recharge: "short",
      pool: true,
    },
    actions: [
      { name: "Flurry of Blows", activation: "bonus_action", spends: FOCUS },
      { name: "Patient Defense", activation: "bonus_action" },
      { name: "Patient Defense (Focus)", activation: "bonus_action", spends: FOCUS },
      { name: "Step of the Wind", activation: "bonus_action" },
      { name: "Step of the Wind (Focus)", activation: "bonus_action", spends: FOCUS },
    ],
  },
  "srd-2024_monk_stunning-strike": { activation: "special", spends: FOCUS },
  "srd-2024_monk_deflect-attacks": { activation: "reaction" },
  "srd-2024_monk_slow-fall": { activation: "reaction" },
  "srd-2024_monk_uncanny-metabolism": { activation: "special", uses: oncePerLongRest("uncanny_metabolism", "Uncanny Metabolism") },
  "srd-2024_monk_ability-score-improvement": asi(),
  "srd-2024_monk_epic-boon": epicBoon(),
  "srd-2024_monk_warrior-of-the-open-hand_wholeness-of-body": {
    activation: "bonus_action",
    uses: wisModUses("wholeness_of_body", "Wholeness of Body"),
  },

  // Paladin
  "srd-2024_paladin_lay-on-hands": {
    activation: "bonus_action",
    uses: {
      key: "lay_on_hands",
      label: "Lay on Hands",
      amount: { kind: "class_level", multiplier: 5 },
      recharge: "long",
      pool: true,
    },
  },
  "srd-2024_paladin_fighting-style": withChoice(FIGHTING_STYLE),
  "srd-2024_paladin_weapon-mastery": weaponMastery({ "1": 2 }),
  // 2024 Divine Smite is a spell, so Paladin's Smite is a free cast per long rest rather than a damage rider.
  "srd-2024_paladin_paladins-smite": { uses: oncePerLongRest("paladins_smite", "Paladin's Smite") },
  // Divine Sense is a Channel Divinity option in 2024, an action that spends one use.
  "srd-2024_paladin_channel-divinity": {
    activation: "action",
    spends: CHANNEL,
    uses: {
      key: "channel_divinity",
      label: "Channel Divinity",
      amount: { kind: "by_level", values: { "3": 2, "11": 3 } },
      recharge: "long",
      short_rest_regain: 1,
      pool: false,
    },
  },
  "srd-2024_paladin_abjure-foes": { activation: "action" },
  "srd-2024_paladin_faithful-steed": { uses: oncePerLongRest("faithful_steed", "Faithful Steed") },
  "srd-2024_paladin_ability-score-improvement": asi(),
  "srd-2024_paladin_epic-boon": epicBoon(),
  "srd-2024_paladin_oath-of-devotion_sacred-weapon": { activation: "special", spends: CHANNEL },

  // Ranger
  "srd-2024_ranger_favored-enemy": {
    uses: {
      key: "favored_enemy",
      label: "Favored Enemy",
      amount: { kind: "by_level", values: { "1": 2, "5": 3, "9": 4, "13": 5, "17": 6 } },
      recharge: "long",
      pool: false,
    },
  },
  "srd-2024_ranger_fighting-style": withChoice(FIGHTING_STYLE),
  "srd-2024_ranger_weapon-mastery": weaponMastery({ "1": 2 }),
  "srd-2024_ranger_deft-explorer": expertise(1),
  "srd-2024_ranger_expertise": expertise(2),
  "srd-2024_ranger_natures-veil": { activation: "bonus_action", uses: wisModUses("natures_veil", "Nature's Veil") },
  "srd-2024_ranger_tireless": { activation: "action", uses: wisModUses("tireless", "Tireless") },
  "srd-2024_ranger_ability-score-improvement": asi(),
  "srd-2024_ranger_epic-boon": epicBoon(),
  // Colossus Slayer's rider sits on the choice's feature for the player to tick; the choice itself is only a record of the pick.
  "srd-2024_ranger_hunter_hunters-prey": {
    ...customChoice("hunters_prey", "Hunter's Prey", ["Colossus Slayer", "Horde Breaker"]),
    riders: [
      { label: "Colossus Slayer", dice: { kind: "fixed", expression: "1d8" }, applies_to: "weapon", once_per_turn: true },
    ],
  },
  "srd-2024_ranger_hunter_defensive-tactics": customChoice("defensive_tactics", "Defensive Tactics", ["Escape the Horde", "Multiattack Defense"]),

  // Rogue
  "srd-2024_rogue_sneak-attack": {
    scaling: {
      label: "Sneak Attack",
      values: {
        "1": "1d6", "3": "2d6", "5": "3d6", "7": "4d6", "9": "5d6",
        "11": "6d6", "13": "7d6", "15": "8d6", "17": "9d6", "19": "10d6",
      },
    },
    riders: [
      { label: "Sneak Attack", dice: { kind: "scaling" }, applies_to: "finesse_or_ranged", once_per_turn: true },
    ],
  },
  "srd-2024_rogue_cunning-action": {
    activation: "bonus_action",
    actions: [
      { name: "Dash", activation: "bonus_action" },
      { name: "Disengage", activation: "bonus_action" },
      { name: "Hide", activation: "bonus_action" },
    ],
  },
  "srd-2024_rogue_steady-aim": { activation: "bonus_action" },
  "srd-2024_rogue_uncanny-dodge": { activation: "reaction" },
  "srd-2024_rogue_expertise": expertise(2),
  "srd-2024_rogue_weapon-mastery": weaponMastery({ "1": 2 }),
  "srd-2024_rogue_stroke-of-luck": {
    uses: { key: "stroke_of_luck", label: "Stroke of Luck", amount: { kind: "fixed", value: 1 }, recharge: "short", pool: false },
  },
  "srd-2024_rogue_ability-score-improvement": asi(),
  "srd-2024_rogue_epic-boon": epicBoon(),
  "srd-2024_rogue_thief_fast-hands": { activation: "bonus_action" },

  // Sorcerer
  "srd-2024_sorcerer_innate-sorcery": {
    activation: "bonus_action",
    uses: {
      key: "innate_sorcery",
      label: "Innate Sorcery",
      amount: { kind: "fixed", value: 2 },
      recharge: "long",
      pool: false,
    },
  },
  "srd-2024_sorcerer_font-of-magic": {
    uses: {
      key: "sorcery_points",
      label: "Sorcery Points",
      amount: {
        kind: "by_level",
        values: {
          "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10,
          "11": 11, "12": 12, "13": 13, "14": 14, "15": 15, "16": 16, "17": 17, "18": 18, "19": 19, "20": 20,
        },
      },
      recharge: "long",
      pool: true,
    },
  },
  "srd-2024_sorcerer_metamagic": withChoice({
    key: "metamagic_options",
    label: "Metamagic",
    pick: { kind: "option", set: "metamagic" },
    count: { kind: "known", values: { "2": 2, "10": 4, "17": 6 } },
    replace_on_level_up: true,
  }),
  "srd-2024_sorcerer_ability-score-improvement": asi(),
  "srd-2024_sorcerer_epic-boon": epicBoon(),
  "srd-2024_sorcerer_draconic-sorcery_dragon-wings": {
    activation: "bonus_action",
    uses: oncePerLongRest("dragon_wings", "Dragon Wings"),
  },

  // Warlock
  "srd-2024_warlock_eldritch-invocations": withChoice({
    key: "eldritch_invocations",
    label: "Eldritch Invocations",
    pick: { kind: "option", set: "eldritch_invocation" },
    count: { kind: "known", values: { "1": 1, "2": 3, "5": 5, "7": 6, "9": 7, "12": 8, "15": 9, "18": 10 } },
    replace_on_level_up: true,
  }),
  "srd-2024_warlock_magical-cunning": { activation: "special", uses: oncePerLongRest("magical_cunning", "Magical Cunning") },
  "srd-2024_warlock_contact-patron": { uses: oncePerLongRest("contact_patron", "Contact Patron") },
  "srd-2024_warlock_ability-score-improvement": asi(),
  "srd-2024_warlock_epic-boon": epicBoon(),
  "srd-2024_warlock_fiend-patron_dark-ones-own-luck": {
    uses: {
      key: "dark_ones_own_luck",
      label: "Dark One's Own Luck",
      amount: { kind: "ability_mod", ability: "cha", min: 1 },
      recharge: "long",
      pool: false,
    },
  },
  "srd-2024_warlock_fiend-patron_hurl-through-hell": { uses: oncePerLongRest("hurl_through_hell", "Hurl Through Hell") },

  // Wizard
  "srd-2024_wizard_arcane-recovery": { uses: oncePerLongRest("arcane_recovery", "Arcane Recovery") },
  "srd-2024_wizard_scholar": expertise(1),
  "srd-2024_wizard_ability-score-improvement": asi(),
  "srd-2024_wizard_epic-boon": epicBoon(),
};

const ALL_ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;

const boon = (mechanics: FeatureMechanics, abilities: FeatCatalogueEntry["ability_increase"]): FeatCatalogueEntry => ({
  category: "epic_boon",
  prerequisites: { level: 19 },
  repeatable: false,
  ability_increase: abilities,
  mechanics,
});

const anyBoonIncrease: FeatCatalogueEntry["ability_increase"] = {
  abilities: [...ALL_ABILITIES],
  amount: 1,
  split: false,
  max: 30,
};

const fightingStyleFeat: FeatCatalogueEntry = {
  category: "fighting_style",
  prerequisites: { fighting_style_feature: true },
  repeatable: false,
  ability_increase: null,
  mechanics: {},
};

const originFeat = (repeatable: boolean, mechanics: FeatureMechanics = {}): FeatCatalogueEntry => ({
  category: "origin",
  prerequisites: null,
  repeatable,
  ability_increase: null,
  mechanics,
});

/** SRD 5.2 (2024) feats, by Open5e record key. */
export const SRD_2024_FEATS: FeatCatalogue = {
  "srd-2024_ability-score-improvement": {
    category: "general",
    prerequisites: { level: 4 },
    repeatable: true,
    ability_increase: { abilities: [...ALL_ABILITIES], amount: 2, split: true, max: 20 },
    mechanics: {},
  },
  "srd-2024_grappler": {
    category: "general",
    prerequisites: { level: 4, abilities: { any_of: { str: 13, dex: 13 } } },
    repeatable: false,
    ability_increase: { abilities: ["str", "dex"], amount: 1, split: false, max: 20 },
    mechanics: {},
  },
  "srd-2024_alert": originFeat(false),
  "srd-2024_magic-initiate": originFeat(true),
  "srd-2024_savage-attacker": originFeat(false),
  // The book lets Skilled grant tools as well; the contract only expresses the skill picks.
  "srd-2024_skilled": originFeat(true, {
    choices: [
      {
        key: "skilled_proficiencies",
        label: "Skilled",
        pick: { kind: "skill", from: [] },
        count: { kind: "per_grant", amount: 3 },
        replace_on_level_up: false,
      },
    ],
  }),
  "srd-2024_archery": fightingStyleFeat,
  "srd-2024_defense": fightingStyleFeat,
  "srd-2024_great-weapon-fighting": fightingStyleFeat,
  "srd-2024_two-weapon-fighting": fightingStyleFeat,
  "srd-2024_boon-of-combat-prowess": boon(
    { uses: { key: "boon_of_combat_prowess", label: "Combat Prowess", amount: { kind: "fixed", value: 1 }, recharge: "turn", pool: false } },
    anyBoonIncrease,
  ),
  "srd-2024_boon-of-dimensional-travel": boon({}, anyBoonIncrease),
  "srd-2024_boon-of-fate": boon(
    { uses: { key: "boon_of_fate", label: "Boon of Fate", amount: { kind: "fixed", value: 1 }, recharge: "short", pool: false } },
    anyBoonIncrease,
  ),
  "srd-2024_boon-of-irresistible-offense": boon({}, anyBoonIncrease),
  // The book restricts the increase to Intelligence, Wisdom or Charisma, where the Open5e text says "of your choice".
  "srd-2024_boon-of-spell-recall": {
    ...boon({}, { abilities: ["int", "wis", "cha"], amount: 1, split: false, max: 30 }),
    prerequisites: { level: 19, spellcasting: true },
  },
  "srd-2024_boon-of-the-night-spirit": boon({ activation: "bonus_action" }, anyBoonIncrease),
  "srd-2024_boon-of-truesight": boon({}, anyBoonIncrease),
};
