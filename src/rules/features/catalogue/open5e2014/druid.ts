import type { FeatureUses } from "@/rules/features/mechanics.types";
import type { FeatureCatalogue } from "../types";

/**
 * Druid circles from Tome of Heroes (Kobold Press) and Open5e Originals.
 *
 * Not encoded, because the contract cannot say it: Circle Spells (they live in the archetype's spell maps), and
 * recharges that a spell slot can also buy back (Mantle of Bees, Engulfing
 * Embrace).
 */

function proficiencyUses(key: string, label: string): FeatureUses {
  return {
    key,
    label,
    amount: { kind: "proficiency" },
    recharge: "long",
    pool: false,
  };
}

function oncePer(
  key: string,
  label: string,
  recharge: "short" | "long",
): FeatureUses {
  return {
    key,
    label,
    amount: { kind: "fixed", value: 1 },
    recharge,
    pool: false,
  };
}

export const DRUID_FEATURES: FeatureCatalogue = {
  // Circle of Ash
  "toh_circle-of-ash_ash-cloud": {
    activation: "action",
    spends: { key: "wild_shape", amount: 1 },
    effect: {
      kind: "save",
      save: { ability: "dex", dc_ability: "spell", success: "half" },
      dice: { "2": "2d8" },
      damage_type: "bludgeoning",
      area: "5 ft around a point within 30 ft",
    },
    actions: [
      {
        name: "Choking Ash",
        activation: "special",
        effect: {
          kind: "save",
          save: { ability: "con", dc_ability: "spell", success: "none" },
          area: "20-ft-radius sphere",
        },
      },
    ],
  },
  "toh_circle-of-ash_feed-the-earth": {
    activation: "action",
    actions: [
      {
        name: "Eruption (bludgeoning)",
        activation: "action",
        effect: {
          kind: "save",
          save: { ability: "dex", dc_ability: "spell", success: "half" },
          dice: { "10": "2d8" },
          damage_type: "bludgeoning",
          area: "10 ft around the point",
        },
      },
      {
        name: "Eruption (fire)",
        activation: "action",
        effect: {
          kind: "save",
          save: { ability: "dex", dc_ability: "spell", success: "half" },
          dice: { "10": "2d8" },
          damage_type: "fire",
          area: "10 ft around the point",
        },
      },
      { name: "Siphon into Growth", activation: "reaction" },
    ],
  },
  "toh_circle-of-ash_covered-in-ash": {
    activation: "reaction",
    uses: proficiencyUses("covered_in_ash", "Covered in Ash"),
    actions: [{ name: "Ashen Step", activation: "bonus_action" }],
    effect: {
      kind: "temp_hp",
      add: [{ kind: "proficiency" }, { kind: "proficiency" }],
    },
  },
  "toh_circle-of-ash_from-the-ashes": {
    activation: "special",
    uses: oncePer("from_the_ashes", "From the Ashes", "long"),
    effect: {
      kind: "save",
      save: { ability: "dex", dc_ability: "spell", success: "half" },
      dice: { "14": "6d6" },
      damage_type: "fire",
      area: "30 ft",
    },
  },

  // Circle of Bees
  "toh_circle-of-bees_bee-stinger": {
    activation: "action",
    spends: { key: "wild_shape", amount: 1 },
    actions: [
      {
        name: "Stinger Strike",
        activation: "special",
        effect: {
          kind: "attack",
          attack: { delivery: "melee", ability: "wis" },
          dice: { "2": "1d4", "6": "1d6", "10": "1d8", "14": "1d10" },
          damage_type: "piercing",
          add: [{ kind: "ability", ability: "wis" }],
        },
      },
    ],
  },
  "toh_circle-of-bees_bee-bond": {
    choices: [
      {
        key: "bee_bond_skill",
        label: "Bee Bond Skill",
        pick: { kind: "skill", from: ["acrobatics", "stealth"] },
        count: { kind: "per_grant", amount: 1 },
        replace_on_level_up: false,
      },
    ],
    grants: { languages: ["Bee Dance"] },
  },
  "toh_circle-of-bees_bumblebee-rush": {
    activation: "bonus_action",
    uses: proficiencyUses("bumblebee_rush", "Bumblebee Rush"),
  },
  "toh_circle-of-bees_mantle-of-bees": {
    activation: "action",
    uses: oncePer("mantle_of_bees", "Mantle of Bees", "short"),
    toggle: {
      key: "mantle_of_bees",
      label: "Mantle of Bees",
      ends_on: "short_rest",
    },
    actions: [
      {
        name: "Swarm (piercing)",
        activation: "action",
        effect: {
          kind: "save",
          save: { ability: "con", dc_ability: "spell", success: "half" },
          dice: { "14": "4d6" },
          damage_type: "piercing",
          area: "10-ft-radius sphere within 60 ft",
        },
      },
      {
        name: "Swarm (poison)",
        activation: "action",
        effect: {
          kind: "save",
          save: { ability: "con", dc_ability: "spell", success: "half" },
          dice: { "14": "4d6" },
          damage_type: "poison",
          area: "10-ft-radius sphere within 60 ft",
        },
      },
      {
        name: "Sting Back (piercing)",
        activation: "special",
        effect: {
          kind: "save",
          save: { ability: "con", dc_ability: "spell", success: "half" },
          dice: { "14": "1d8" },
          damage_type: "piercing",
        },
      },
      {
        name: "Sting Back (poison)",
        activation: "special",
        effect: {
          kind: "save",
          save: { ability: "con", dc_ability: "spell", success: "half" },
          dice: { "14": "1d8" },
          damage_type: "poison",
        },
      },
    ],
  },

  // Circle of Crystals
  "toh_circle-of-crystals_resonant-crystal": {
    actions: [
      {
        name: "Vitality: temporary hit points",
        activation: "special",
        effect: {
          kind: "temp_hp",
          add: [{ kind: "proficiency" }, { kind: "proficiency" }],
        },
      },
    ],
    choices: [
      {
        key: "harmonic_frequency",
        label: "Harmonic Frequency",
        pick: {
          kind: "custom",
          options: ["Clarity", "Cleansing", "Focus", "Healing", "Vitality"],
        },
        count: { kind: "per_grant", amount: 1 },
        replace_on_level_up: false,
      },
    ],
  },
  "toh_circle-of-crystals_crystalline-skin": {
    activation: "reaction",
    uses: proficiencyUses("crystalline_skin", "Crystalline Skin"),
  },
  "toh_circle-of-crystals_magical-resonance": {
    activation: "bonus_action",
    uses: oncePer("magical_resonance", "Magical Resonance", "long"),
  },
  "toh_circle-of-crystals_crystalline-form": {
    activation: "bonus_action",
    toggle: {
      key: "crystalline_form",
      label: "Crystalline Form",
      spends: { key: "wild_shape", amount: 1 },
      ends_on: "short_rest",
    },
  },

  // Circle of Sand
  "toh_circle-of-sand_sand-form": {
    activation: "bonus_action",
    toggle: {
      key: "sand_form",
      label: "Sand Form",
      spends: { key: "wild_shape", amount: 1 },
      ends_on: "short_rest",
    },
    actions: [
      {
        name: "Abrasive Blast",
        activation: "bonus_action",
        effect: {
          kind: "attack",
          attack: { delivery: "ranged", ability: "spell", range: "30 ft" },
          dice: { "2": "1d8", "10": "2d8" },
          damage_type: "slashing",
          add: [{ kind: "ability", ability: "wis" }],
        },
      },
      {
        name: "Stinging Cloud",
        activation: "bonus_action",
        effect: {
          kind: "save",
          save: { ability: "con", dc_ability: "spell", success: "none" },
          area: "5 ft (10 ft from 10th level)",
        },
      },
    ],
  },
  "toh_circle-of-sand_diffuse-form": {
    activation: "reaction",
    uses: proficiencyUses("diffuse_form", "Diffuse Form"),
  },
  "toh_circle-of-sand_sand-dervish": {
    activation: "bonus_action",
    uses: oncePer("sand_dervish", "Sand Dervish", "short"),
    effect: {
      kind: "save",
      save: { ability: "str", dc_ability: "spell", success: "half" },
      dice: { "6": "1d8", "10": "2d8" },
      damage_type: "slashing",
      area: "5 ft around the dervish",
    },
  },
  "toh_circle-of-sand_echo-of-the-dunes": {
    uses: oncePer("echo_of_the_dunes", "Echo of the Dunes", "short"),
    actions: [
      { name: "Sand Sphere", activation: "action" },
      { name: "Whirlwind", activation: "action" },
    ],
  },
  "toh_circle-of-sand_sandstorm": {
    activation: "action",
    uses: oncePer("sandstorm", "Sandstorm", "long"),
    effect: {
      kind: "save",
      save: { ability: "str", dc_ability: "spell", success: "half" },
      dice: { "14": "2d8" },
      damage_type: "slashing",
      area: "30-ft-radius cylinder within 120 ft",
    },
  },

  // Circle of the Green
  "toh_circle-of-the-green_summon-green-spirit": {
    activation: "action",
    spends: { key: "wild_shape", amount: 1 },
  },
  "toh_circle-of-the-green_verdant-interference": {
    activation: "reaction",
    uses: proficiencyUses("verdant_interference", "Verdant Interference"),
  },
  "toh_circle-of-the-green_spirit-symbiosis": {
    activation: "action",
    toggle: {
      key: "spirit_symbiosis",
      label: "Spirit Symbiosis",
      ends_on: "short_rest",
    },
    actions: [
      {
        name: "Tendril Attack",
        activation: "bonus_action",
        effect: {
          kind: "attack",
          attack: { delivery: "melee", ability: "spell", range: "10 ft" },
          dice: { "14": "2d8" },
          damage_type: "bludgeoning",
          add: [{ kind: "ability", ability: "wis" }],
        },
      },
    ],
  },

  // Circle of the Many
  "open5e_circle-of-the-many_resilient-transformation": {
    activation: "bonus_action",
  },
  "open5e_circle-of-the-many_strengthened-transformation": {
    scaling: {
      label: "Wild Shape Max CR",
      values: { "2": "1", "6": "2", "9": "3", "12": "4", "15": "5", "18": "6" },
    },
  },
  "open5e_circle-of-the-many_shape-of-the-elements": {
    activation: "special",
    spends: { key: "wild_shape", amount: 1 },
    choices: [
      {
        key: "elemental_form",
        label: "Elemental Form",
        pick: { kind: "custom", options: ["Air", "Earth", "Fire", "Water"] },
        count: { kind: "per_grant", amount: 1 },
        replace_on_level_up: false,
      },
    ],
  },

  // Circle of the Shapeless
  "toh_circle-of-the-shapeless_ooze-form": {
    activation: "bonus_action",
    toggle: {
      key: "ooze_form",
      label: "Ooze Form",
      spends: { key: "wild_shape", amount: 1 },
      ends_on: "short_rest",
    },
    scaling: { label: "Ooze Acid Damage", values: { "2": "1d6", "10": "2d6" } },
    riders: [
      {
        label: "Acid Weapons",
        dice: { kind: "scaling" },
        damage_type: "acid",
        applies_to: "melee_weapon",
        once_per_turn: false,
        requires_toggle: "ooze_form",
      },
    ],
    actions: [
      {
        name: "Oozing Form",
        activation: "reaction",
        effect: {
          kind: "damage",
          dice: { "2": "1d6", "10": "2d6" },
          damage_type: "acid",
        },
      },
    ],
  },
  "toh_circle-of-the-shapeless_slimy-pseudopod": {
    activation: "bonus_action",
    uses: proficiencyUses("slimy_pseudopod", "Slimy Pseudopod"),
    effect: {
      kind: "attack",
      attack: { delivery: "melee", ability: "spell", range: "5 ft" },
      dice: { "6": "1d6", "10": "2d6" },
      damage_type: "acid",
    },
  },
  "toh_circle-of-the-shapeless_engulfing-embrace": {
    activation: "action",
    uses: oncePer("engulfing_embrace", "Engulfing Embrace", "long"),
    actions: [
      {
        name: "Engulf",
        activation: "action",
        effect: {
          kind: "save",
          save: { ability: "dex", dc_ability: "spell", success: "none" },
          dice: { "14": "2d6" },
          damage_type: "acid",
          area: "a creature within 5 ft",
        },
      },
      {
        name: "Engulfed Creature Takes",
        activation: "special",
        effect: { kind: "damage", dice: { "14": "4d6" }, damage_type: "acid" },
      },
    ],
  },

  // Circle of Wind
  "toh_circle-of-wind_updraft": {
    activation: "bonus_action",
    spends: { key: "wild_shape", amount: 1 },
  },
  "toh_circle-of-wind_comforting-breezes": {
    activation: "action",
    uses: oncePer("comforting_breezes", "Comforting Breezes", "long"),
  },
  "toh_circle-of-wind_vizier-of-the-winds": {
    uses: oncePer("vizier_of_the_winds", "Vizier of the Winds", "long"),
  },
  "toh_circle-of-wind_hunger-of-storms-fury": {
    activation: "special",
    uses: oncePer("hunger_of_storms_fury", "Hunger of Storm's Fury", "long"),
  },
};
