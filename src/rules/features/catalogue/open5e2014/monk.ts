import type { FeatureCatalogue } from "../types";
import type {
  ByLevel,
  DamageRider,
  UsesCost,
} from "@/rules/features/mechanics.types";

/**
 * Open5e 2014 monk traditions (Tome of Heroes, Tal'Dorei, Open5e Originals).
 * Ki costs spend the base `ki_points` pool.
 */

const KI: UsesCost = { key: "ki_points", amount: 1 };

function ki(amount: number): UsesCost {
  return { key: "ki_points", amount };
}

/** The Martial Arts die by monk level, as a dice expression per level. */
const MARTIAL_ARTS_DIE: ByLevel<string> = {
  "1": "1d4",
  "5": "1d6",
  "11": "1d8",
  "17": "1d10",
};

/** Two Martial Arts dice (Steel Rain Blossom), from the first level that grants the feature. */
const TWO_MARTIAL_ARTS_DICE: ByLevel<string> = { "11": "2d8", "17": "2d10" };

/** The Wisdom modifier that rides with a Martial Arts die rider; the ki is spent on the die rider only. */
function wisdomRider(
  label: string,
  appliesTo: DamageRider["applies_to"],
  once: boolean,
): DamageRider {
  return {
    label,
    dice: { kind: "flat", add: [{ kind: "ability", ability: "wis" }] },
    applies_to: appliesTo,
    once_per_turn: once,
  };
}

function martialArtsRider(
  label: string,
  appliesTo: DamageRider["applies_to"],
  once: boolean,
  cost?: UsesCost,
): DamageRider {
  const rider: DamageRider = {
    label,
    dice: { kind: "scaling" },
    applies_to: appliesTo,
    once_per_turn: once,
  };
  if (cost) rider.cost = { kind: "uses", ...cost };
  return rider;
}

export const MONK_FEATURES: FeatureCatalogue = {
  // Way of Concordant Motion
  "toh_way-of-concordant-motion_cooperative-ki": {
    actions: [
      {
        name: "Flurry of Blows: empower allies",
        activation: "bonus_action",
        spends: KI,
        effect: {
          kind: "damage",
          dice: MARTIAL_ARTS_DIE,
          add: [{ kind: "ability", ability: "wis" }],
        },
      },
      {
        name: "Patient Defense: share with an ally",
        activation: "special",
        spends: KI,
      },
      {
        name: "Step of the Wind: share with an ally",
        activation: "special",
        spends: KI,
      },
    ],
  },
  "toh_way-of-concordant-motion_deflect-strike": {
    activation: "reaction",
    spends: ki(2),
    effect: {
      kind: "damage",
      dice: { "6": "1d10" },
      add: [{ kind: "ability", ability: "dex" }, { kind: "class_level" }],
    },
  },
  "toh_way-of-concordant-motion_concordant-mind": {
    activation: "action",
    spends: ki(5),
    uses: {
      key: "way_of_concordant_motion_concordant_mind",
      label: "Concordant Mind",
      amount: { kind: "fixed", value: 1 },
      recharge: "long",
      pool: false,
    },
  },

  // Way of Shadowdancing
  "open5e_way-of-shadowdancing_magic-of-shadow": {
    actions: [
      { name: "Darkness", activation: "action", spends: ki(2) },
      { name: "Darkvision", activation: "action", spends: ki(2) },
      { name: "Silence", activation: "action", spends: ki(2) },
      { name: "Pass without Trace", activation: "action", spends: ki(2) },
    ],
  },
  "open5e_way-of-shadowdancing_dark-passage": { activation: "bonus_action" },
  "open5e_way-of-shadowdancing_walk-unseen": { activation: "action" },
  "open5e_way-of-shadowdancing_shadow-strike": { activation: "reaction" },

  // Way of the Cerulean Spirit
  "tdcs_way-of-the-cerulean-spirit_extract-aspects": {
    activation: "special",
    spends: KI,
    effect: {
      kind: "save",
      save: { ability: "con", dc_ability: "wis", success: "none" },
    },
  },
  "tdcs_way-of-the-cerulean-spirit_extort-truth": {
    activation: "special",
    spends: ki(2),
    effect: {
      kind: "save",
      save: { ability: "cha", dc_ability: "wis", success: "none" },
    },
  },
  "tdcs_way-of-the-cerulean-spirit_mind-of-mercury": {
    activation: "reaction",
    spends: KI,
  },
  "tdcs_way-of-the-cerulean-spirit_preternatural-counter": {
    activation: "reaction",
  },
  "tdcs_way-of-the-cerulean-spirit_debilitating-barrage": {
    activation: "special",
    spends: ki(3),
    effect: {
      kind: "save",
      save: { ability: "con", dc_ability: "wis", success: "none" },
    },
  },

  // Way of the Dragon
  "toh_way-of-the-dragon_draconic-affiliation": {
    choices: [
      {
        key: "draconic_affiliation",
        label: "Draconic Affiliation",
        pick: {
          kind: "custom",
          options: [
            "Black or Copper",
            "Blue or Bronze",
            "Brass, Gold, or Red",
            "Green",
            "Silver or White",
          ],
        },
        count: { kind: "per_grant", amount: 1 },
        replace_on_level_up: false,
      },
    ],
  },
  // The extra damage is of the type of the chosen affiliation, so the rider names no type.
  "toh_way-of-the-dragon_draconic-onslaught": {
    riders: [
      {
        label: "Draconic Onslaught",
        dice: { kind: "fixed", expression: "2d6" },
        applies_to: "weapon",
        once_per_turn: false,
      },
    ],
  },
  "toh_way-of-the-dragon_take-flight": {
    activation: "action",
    spends: KI,
    effect: { kind: "damage", dice: { "6": "2d6" } },
  },
  "toh_way-of-the-dragon_conquering-wyrm": {
    activation: "special",
    spends: ki(2),
    riders: [
      {
        label: "Conquering Wyrm",
        dice: { kind: "fixed", expression: "4d6" },
        applies_to: "unarmed",
        once_per_turn: false,
      },
    ],
  },
  "toh_way-of-the-dragon_scales-of-the-wyrm": {
    activation: "special",
    effect: { kind: "temp_hp", add: [{ kind: "class_level" }] },
    toggle: {
      key: "scales_of_the_wyrm",
      label: "Scales of the Wyrm",
      spends: ki(4),
      ends_on: "short_rest",
    },
  },

  // Way of the Humble Elephant
  "toh_way-of-the-humble-elephant_slow-to-anger": {
    scaling: { label: "Slow to Anger Die", values: MARTIAL_ARTS_DIE },
    actions: [
      { name: "Halve the damage", activation: "reaction" },
      {
        name: "Knock the attacker prone",
        activation: "reaction",
        effect: {
          kind: "save",
          save: { ability: "str", dc_ability: "wis", success: "none" },
        },
      },
    ],
    riders: [
      martialArtsRider("Slow to Anger", "melee_weapon", true, KI),
      wisdomRider("Wisdom with Slow to Anger", "melee_weapon", true),
    ],
  },
  "toh_way-of-the-humble-elephant_unyielding-step": {
    activation: "special",
    toggle: {
      key: "unyielding_step",
      label: "Unyielding Step",
      spends: KI,
      ends_on: "short_rest",
    },
  },
  "toh_way-of-the-humble-elephant_decisive-in-wrath": {
    scaling: { label: "Decisive in Wrath Die", values: MARTIAL_ARTS_DIE },
    riders: [
      martialArtsRider("Decisive in Wrath", "melee_weapon", false),
      wisdomRider("Decisive in Wrath (Wisdom)", "melee_weapon", false),
    ],
  },
  "toh_way-of-the-humble-elephant_thick-hide": {
    activation: "bonus_action",
    toggle: {
      key: "thick_hide",
      label: "Thick Hide",
      spends: ki(5),
      ends_on: "short_rest",
    },
  },

  // Way of the Still Waters
  "toh_way-of-the-still-waters_turbulent-waters": {
    // Gaining a die (a reaction) adds to the pool rather than spending it, so the feature has no activation of its own.
    uses: {
      key: "way_of_the_still_waters_turbulence_dice",
      label: "Turbulence Dice (gained in combat)",
      amount: { kind: "proficiency" },
      recharge: "short",
      pool: true,
    },
    scaling: { label: "Turbulence Die", values: MARTIAL_ARTS_DIE },
    riders: [
      martialArtsRider("Turbulence dice", "weapon", false, {
        key: "way_of_the_still_waters_turbulence_dice",
        amount: 1,
      }),
    ],
  },
  "toh_way-of-the-still-waters_spreading-ripples": {
    actions: [
      { name: "Gain a Turbulence die", activation: "reaction" },
      {
        name: "Spreading ripples",
        activation: "special",
        effect: { kind: "damage", dice: MARTIAL_ARTS_DIE },
      },
    ],
  },
  "toh_way-of-the-still-waters_tempestuous-waters": { activation: "special" },

  // Way of the Tipsy Monkey
  "toh_way-of-the-tipsy-monkey_sway-and-strike": {
    activation: "special",
    spends: KI,
    effect: {
      kind: "save",
      save: { ability: "str", dc_ability: "wis", success: "none" },
    },
  },
  "toh_way-of-the-tipsy-monkey_jester-style": { activation: "reaction" },
  // The 1d10 improvised-weapon die replaces the 1d6, so the player ticks one of the two.
  "toh_way-of-the-tipsy-monkey_fortune-favors-the-fool": {
    riders: [
      {
        label: "Fortune Favors the Fool",
        dice: { kind: "fixed", expression: "1d6" },
        applies_to: "weapon",
        once_per_turn: true,
      },
      {
        label: "Fortune Favors the Fool (improvised weapon)",
        dice: { kind: "fixed", expression: "1d10" },
        applies_to: "weapon",
        once_per_turn: true,
      },
    ],
  },

  // Way of the Unerring Arrow
  "toh_way-of-the-unerring-arrow_flurry-of-deflection": {
    uses: {
      key: "way_of_the_unerring_arrow_flurry_of_deflection",
      label: "Flurry of Deflection",
      amount: { kind: "proficiency" },
      recharge: "turn",
      pool: false,
    },
    actions: [
      {
        name: "Deflect Missiles (extra reaction)",
        activation: "reaction",
        spends: {
          key: "way_of_the_unerring_arrow_flurry_of_deflection",
          amount: 1,
        },
        effect: {
          kind: "damage",
          dice: { "9": "2d10" },
          add: [{ kind: "ability", ability: "dex" }, { kind: "class_level" }],
        },
      },
      {
        name: "Return the caught missile",
        activation: "special",
        spends: KI,
        effect: {
          kind: "attack",
          attack: { delivery: "ranged", ability: "dex" },
        },
      },
    ],
  },
  "toh_way-of-the-unerring-arrow_needle-eye-of-insight": {
    activation: "special",
    spends: KI,
  },
  "toh_way-of-the-unerring-arrow_steel-rain-blossom": {
    activation: "action",
    effect: {
      kind: "save",
      save: { ability: "dex", dc_ability: "wis", success: "none" },
      dice: TWO_MARTIAL_ARTS_DICE,
      damage_type: "piercing",
      area: "15-ft radius",
    },
  },
  "toh_way-of-the-unerring-arrow_improbable-shot": {
    uses: {
      key: "way_of_the_unerring_arrow_improbable_shot",
      label: "Improbable Shot (other plane)",
      amount: { kind: "fixed", value: 1 },
      recharge: "long",
      pool: false,
    },
    actions: [
      { name: "Ignore all cover", activation: "special", spends: ki(3) },
      {
        name: "Strike a target on another plane (5 ki points)",
        activation: "special",
        spends: {
          key: "way_of_the_unerring_arrow_improbable_shot",
          amount: 1,
        },
      },
    ],
  },

  // Way of the Wildcat
  "toh_way-of-the-wildcat_enhanced-agility": {
    grants: { skills: ["acrobatics"] },
  },
  "toh_way-of-the-wildcat_feline-reflexes": {
    activation: "reaction",
    actions: [
      { name: "Dodge as a reaction", activation: "reaction", spends: ki(2) },
    ],
  },
  "toh_way-of-the-wildcat_springing-pounce": {
    activation: "special",
    scaling: { label: "Springing Pounce Die", values: MARTIAL_ARTS_DIE },
    riders: [
      martialArtsRider("Springing Pounce", "weapon", true, KI),
      wisdomRider("Springing Pounce (Wisdom)", "weapon", true),
    ],
    actions: [
      {
        name: "Push the target",
        activation: "special",
        spends: KI,
        effect: {
          kind: "save",
          save: { ability: "str", dc_ability: "wis", success: "none" },
        },
      },
    ],
  },
  "toh_way-of-the-wildcat_improved-feline-reflexes": {
    activation: "reaction",
    actions: [
      { name: "Move toward the source", activation: "reaction" },
      {
        name: "Unarmed strike against the source",
        activation: "special",
        spends: ki(3),
      },
    ],
  },
};
