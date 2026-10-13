import type { FeatureCatalogue } from "../types";
import type {
  FeatureChoice,
  FeatureUses,
} from "@/rules/features/mechanics.types";

/**
 * Open5e 2014 ranger archetypes (Tome of Heroes). The additional spells of the
 * Grove Warden, Snake Speaker and Wasteland Strider live in the archetype spell
 * maps, not here.
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

function customChoice(
  key: string,
  label: string,
  options: string[],
): FeatureChoice {
  return {
    key,
    label,
    pick: { kind: "custom", options },
    count: { kind: "per_grant", amount: 1 },
    replace_on_level_up: false,
  };
}

export const RANGER_FEATURES: FeatureCatalogue = {
  // Beast Trainer
  "toh_beast-trainer_beast-whisperer": {
    grants: { skills: ["animal_handling"] },
  },
  "toh_beast-trainer_trained-animals": { activation: "bonus_action" },
  "toh_beast-trainer_bestial-flanker": {
    activation: "special",
    uses: proficiencyUses("beast_trainer_bestial_flanker", "Bestial Flanker"),
  },
  "toh_beast-trainer_primal-whirlwind": {
    activation: "special",
    uses: proficiencyUses("beast_trainer_primal_whirlwind", "Primal Whirlwind"),
  },

  // Grove Warden
  "toh_grove-warden_forests-will": { activation: "bonus_action" },
  "toh_grove-warden_intruders-bane": {
    activation: "bonus_action",
    uses: {
      key: "grove_warden_intruders_bane",
      label: "Intruder's Bane",
      amount: { kind: "fixed", value: 1 },
      recharge: "short",
      pool: false,
    },
    effect: {
      kind: "save",
      save: { ability: "dex", dc_ability: "spell", success: "none" },
      area: "15-ft radius",
    },
  },
  "toh_grove-warden_wrath-of-the-forest": {
    activation: "bonus_action",
    effect: {
      kind: "attack",
      attack: { delivery: "ranged", ability: "dex", range: "30 ft" },
      dice: { "11": "1d8" },
      add: [{ kind: "ability", ability: "dex" }],
    },
  },
  "toh_grove-warden_living-bulwark": { activation: "reaction" },

  // Haunted Warden
  "toh_haunted-warden_beyond-the-pale": {
    activation: "bonus_action",
    uses: proficiencyUses("haunted_warden_beyond_the_pale", "Beyond the Pale"),
  },
  "toh_haunted-warden_spirit-usher": {
    activation: "bonus_action",
    choices: [
      customChoice("spirit_usher_cantrip_damage", "Spirit's damage cantrip", [
        "Chill Touch",
        "Ray of Frost",
        "Sacred Flame",
        "Vicious Mockery",
      ]),
      customChoice("spirit_usher_cantrip_utility", "Spirit's utility cantrip", [
        "Druidcraft",
        "Prestidigitation",
        "Thaumaturgy",
      ]),
      customChoice("spirit_usher_cantrip_trick", "Spirit's trick cantrip", [
        "Dancing Lights",
        "Message",
        "Minor Illusion",
      ]),
    ],
  },
  "toh_haunted-warden_merge-spirit": {
    activation: "action",
    uses: {
      key: "haunted_warden_merge_spirit",
      label: "Merge Spirit",
      amount: { kind: "fixed", value: 1 },
      recharge: "short",
      pool: false,
    },
    toggle: {
      key: "merge_spirit",
      label: "Merge Spirit",
      spends: { key: "haunted_warden_merge_spirit", amount: 1 },
      ends_on: "short_rest",
    },
  },
  "toh_haunted-warden_guardian-geist": { activation: "reaction" },

  // Snake Speaker
  "toh_snake-speaker_scaly-transition": {
    choices: [
      {
        key: "scaly_transition",
        label: "Scaly Transition",
        pick: {
          kind: "custom",
          options: [
            "Bite",
            "Keen Smell",
            "Poison Resistance",
            "Scales",
            "Serpentine Movement",
          ],
        },
        count: { kind: "known", values: { "3": 1, "11": 2 } },
        replace_on_level_up: false,
      },
    ],
    actions: [
      {
        name: "Bite",
        activation: "bonus_action",
        effect: {
          kind: "attack",
          attack: { delivery: "melee", ability: "dex", range: "5 ft" },
          dice: { "3": "1d4" },
          damage_type: "piercing",
          add: [{ kind: "ability", ability: "dex" }],
        },
      },
      {
        name: "Bite venom",
        activation: "bonus_action",
        effect: { kind: "damage", dice: { "3": "1d8" }, damage_type: "poison" },
      },
    ],
  },
  "toh_snake-speaker_serpent-shape": {
    activation: "action",
    uses: {
      key: "snake_speaker_serpent_shape",
      label: "Serpent Shape",
      amount: { kind: "by_level", values: { "7": 1, "15": 2 } },
      recharge: "long",
      pool: false,
    },
  },
  "toh_snake-speaker_sinuous-dance": {
    activation: "special",
    uses: {
      key: "snake_speaker_sinuous_dance",
      label: "Sinuous Dance",
      amount: { kind: "fixed", value: 1 },
      recharge: "short",
      pool: false,
    },
  },
  "toh_snake-speaker_decoy-skin": {
    activation: "action",
    uses: {
      key: "snake_speaker_decoy_skin",
      label: "Decoy Skin",
      amount: { kind: "fixed", value: 1 },
      recharge: "long",
      pool: false,
    },
    actions: [{ name: "Command the decoy", activation: "bonus_action" }],
  },

  // Spear of the Weald
  "toh_spear-of-the-weald_touch-of-the-fey-land": {
    choices: [
      customChoice("touch_of_the_fey_land", "Touch of the Fey Land", [
        "Aflame",
        "Entwined",
        "Everblooming",
        "Moonlit",
      ]),
    ],
  },
  "toh_spear-of-the-weald_weald-spear": {
    activation: "bonus_action",
    scaling: {
      label: "Weald Spear Die",
      values: { "3": "d8", "7": "d10", "11": "d12" },
    },
    effect: {
      kind: "attack",
      attack: { delivery: "melee", ability: "dex", range: "thrown 20/60 ft" },
      dice: { "3": "1d8", "7": "1d10", "11": "1d12" },
      add: [{ kind: "ability", ability: "dex" }],
    },
  },
  "toh_spear-of-the-weald_canopy": {
    activation: "reaction",
    uses: {
      key: "spear_of_the_weald_canopy",
      label: "Canopy",
      amount: { kind: "by_level", values: { "7": 1, "11": 2, "18": 3 } },
      recharge: "short",
      pool: false,
    },
  },
  "toh_spear-of-the-weald_steps-of-the-forest-god": {
    activation: "bonus_action",
  },
  "toh_spear-of-the-weald_overwhelm": { activation: "bonus_action" },

  // Wasteland Strider
  "toh_wasteland-strider_chaotic-strikes": {
    activation: "bonus_action",
    toggle: {
      key: "chaotic_strikes",
      label: "Chaotic Strikes",
      ends_on: "short_rest",
    },
    riders: [
      {
        label: "Chaotic Strikes",
        dice: { kind: "fixed", expression: "1d4" },
        applies_to: "weapon",
        once_per_turn: false,
        requires_toggle: "chaotic_strikes",
      },
    ],
  },
  "toh_wasteland-strider_call-the-otherworldly": {
    activation: "action",
    uses: {
      key: "wasteland_strider_call_the_otherworldly",
      label: "Call the Otherworldly",
      amount: { kind: "fixed", value: 1 },
      recharge: "short",
      pool: false,
    },
  },
  "toh_wasteland-strider_dimensional-step": {
    activation: "action",
    uses: proficiencyUses(
      "wasteland_strider_dimensional_step",
      "Dimensional Step",
    ),
  },
};
