import type {
  FeatureMechanics,
  FeatureUses,
} from "@/rules/features/mechanics.types";
import type { FeatureCatalogue } from "../types";

/**
 * Open5e 2014 wizard archetypes. Spellbook grants, spell-copy discounts and
 * other passive wording are absent on purpose (see open5e2014.ts).
 */

function perProficiencyLong(key: string, label: string): FeatureUses {
  return {
    key,
    label,
    amount: { kind: "proficiency" },
    recharge: "long",
    pool: false,
  };
}

/** The Arcane Aegis of the Abjurationist and of the School of Abjuring and Warding: made once per long rest. */
function arcaneAegis(key: string, restoreWithSlot: boolean): FeatureMechanics {
  return {
    activation: "special",
    uses: {
      key,
      label: "Arcane Aegis",
      amount: { kind: "fixed", value: 1 },
      recharge: "long",
      pool: false,
    },
    // Restoring by a bonus action and a spell slot is in the Abjurationist's text only.
    ...(restoreWithSlot
      ? {
          actions: [
            {
              name: "Restore Arcane Aegis (expend a spell slot)",
              activation: "bonus_action" as const,
            },
          ],
        }
      : {}),
  };
}

const AEGIS_EXTENSION: FeatureMechanics = { activation: "reaction" };

export const WIZARD_FEATURES: FeatureCatalogue = {
  // Abjurationist
  "open5e_abjurationist_arcane-aegis": arcaneAegis(
    "abjurationist_arcane_aegis",
    true,
  ),
  "open5e_abjurationist_aegis-extension": AEGIS_EXTENSION,
  "open5e_abjurationist_anti-magician": {
    actions: [{ name: "Dispel Magic", activation: "bonus_action" }],
  },

  // Cantrip Adept
  "toh_cantrip-adept_arcane-alacrity": {
    activation: "special",
    uses: {
      ...perProficiencyLong("cantrip_adept_arcane_alacrity", "Arcane Alacrity"),
      recharge_from: { level: 10, recharge: "short" },
    },
  },
  "toh_cantrip-adept_cantrip-polymath": {
    choices: [
      {
        key: "cantrip_polymath",
        label: "Cantrip Polymath",
        pick: {
          kind: "spell",
          lists: ["Bard", "Cleric", "Druid", "Sorcerer", "Warlock", "Wizard"],
          level: 0,
          free_cast: false,
        },
        count: { kind: "per_grant", amount: 2 },
        replace_on_level_up: false,
      },
    ],
  },
  "toh_cantrip-adept_potent-spellcasting": {
    riders: [
      {
        label: "Potent Spellcasting (cantrips only)",
        dice: { kind: "flat", add: [{ kind: "ability", ability: "int" }] },
        applies_to: "spell",
        once_per_turn: false,
      },
    ],
  },
  "toh_cantrip-adept_empowered-cantrips": {
    activation: "special",
    uses: perProficiencyLong(
      "cantrip_adept_empowered_cantrips",
      "Empowered Cantrips",
    ),
  },

  // Courser Mage
  "toh_courser-mage_stalking-savant": { grants: { skills: ["stealth"] } },
  "toh_courser-mage_unseen-assailant": { activation: "bonus_action" },
  "toh_courser-mage_spell-arrow": {
    activation: "bonus_action",
    riders: [
      {
        label: "Spell Arrow (bow arrows only)",
        dice: {
          kind: "slot",
          base: "2d4",
          base_level: 1,
          per_level: "1d4",
          max_dice: 10,
        },
        damage_type: "force",
        applies_to: "weapon",
        once_per_turn: false,
        cost: { kind: "spell_slot" },
      },
    ],
  },

  // Familiar Master
  "toh_familiar-master_familiar-savant": {
    activation: "special",
    uses: perProficiencyLong(
      "familiar_master_familiar_savant",
      "Free Find Familiar",
    ),
  },
  "toh_familiar-master_arcane-amplification": {
    riders: [
      {
        label: "Arcane Amplification (spells through your familiar)",
        dice: { kind: "flat", add: [{ kind: "ability", ability: "int" }] },
        applies_to: "spell",
        once_per_turn: false,
      },
    ],
  },
  "toh_familiar-master_companion-concentration": {
    activation: "action",
    uses: perProficiencyLong(
      "familiar_master_companion_concentration",
      "Companion Concentration",
    ),
  },

  // Gravebinding
  "toh_gravebinding_gravebinder-lore": {
    activation: "action",
    uses: {
      key: "gravebinding_gravebinder_lore",
      label: "Gravebinder Lore",
      amount: { kind: "ability_mod", ability: "int", min: 1 },
      recharge: "long",
      pool: false,
    },
    grants: { skills: ["religion"] },
  },
  "toh_gravebinding_hunter-of-the-dead": { activation: "action" },
  "toh_gravebinding_ward-against-the-risen": {
    activation: "reaction",
    uses: {
      key: "gravebinding_ward_against_the_risen",
      label: "Ward Against the Risen",
      amount: { kind: "ability_mod", ability: "int", min: 1 },
      recharge: "long",
      pool: false,
    },
  },
  "toh_gravebinding_disruptive-touch": {
    riders: [
      {
        label: "Disruptive Touch",
        dice: { kind: "fixed", expression: "4d6" },
        damage_type: "radiant",
        applies_to: "spell",
        once_per_turn: false,
      },
    ],
  },
  "toh_gravebinding_radiant-nimbus": {
    activation: "action",
    uses: {
      key: "gravebinding_radiant_nimbus",
      label: "Radiant Nimbus",
      amount: { kind: "fixed", value: 1 },
      recharge: "long",
      pool: false,
    },
    toggle: {
      key: "radiant_nimbus",
      label: "Radiant Nimbus",
      spends: { key: "gravebinding_radiant_nimbus", amount: 1 },
      ends_on: "short_rest",
    },
    actions: [
      { name: "Frighten Undead", activation: "action" },
      {
        name: "Radiant Retaliation",
        activation: "special",
        effect: {
          kind: "damage",
          dice: { "14": "2d10" },
          damage_type: "radiant",
        },
      },
    ],
  },

  // School of Abjuring and Warding
  "open5e_school-of-abjuring-and-warding_arcane-aegis": arcaneAegis(
    "abjuring_and_warding_arcane_aegis",
    false,
  ),
  "open5e_school-of-abjuring-and-warding_aegis-extension": AEGIS_EXTENSION,

  // School of Divining and Soothsaying
  "open5e_school-of-divining-and-soothsaying_premonition": {
    activation: "special",
    uses: {
      key: "divining_premonition",
      label: "Premonition",
      amount: { kind: "by_level", values: { "2": 2, "14": 3 } },
      recharge: "long",
      pool: false,
    },
  },
  "open5e_school-of-divining-and-soothsaying_extrasensory-perception": {
    activation: "special",
    uses: {
      key: "divining_extrasensory_perception",
      label: "Extrasensory Perception",
      amount: { kind: "fixed", value: 1 },
      recharge: "short",
      pool: false,
    },
    choices: [
      {
        key: "extrasensory_perception",
        label: "Extrasensory Perception",
        pick: {
          kind: "custom",
          options: [
            "Ether Sight",
            "Script Sight",
            "Shadow Sight",
            "Unseen Sight",
          ],
        },
        count: { kind: "per_grant", amount: 1 },
        replace_on_level_up: false,
      },
    ],
  },

  // School of Illusions and Phantasms
  "open5e_school-of-illusions-and-phantasms_mutable-mirage": {
    activation: "action",
  },
  "open5e_school-of-illusions-and-phantasms_second-semblance": {
    activation: "reaction",
    uses: {
      key: "illusions_second_semblance",
      label: "Second Semblance",
      amount: { kind: "fixed", value: 1 },
      recharge: "short",
      pool: false,
    },
  },
  "open5e_school-of-illusions-and-phantasms_phantasmagoria": {
    activation: "bonus_action",
  },

  // School of Liminality
  "toh_school-of-liminality_mulligan": {
    activation: "reaction",
    uses: perProficiencyLong("liminality_mulligan", "Mulligan"),
  },
  "toh_school-of-liminality_otherworldly-sense": {
    activation: "special",
    uses: perProficiencyLong(
      "liminality_otherworldly_sense",
      "Otherworldly Sense",
    ),
  },
  "toh_school-of-liminality_liminal-adept": {
    activation: "special",
    uses: {
      key: "liminality_liminal_adept",
      label: "Threshold Slip",
      amount: { kind: "by_level", values: { "10": 2, "14": 3 } },
      recharge: "short",
      pool: false,
    },
  },
  "toh_school-of-liminality_forced-transition": {
    activation: "action",
    uses: {
      key: "liminality_forced_transition",
      label: "Forced Transition",
      amount: { kind: "fixed", value: 1 },
      recharge: "long",
      pool: false,
    },
    choices: [
      {
        key: "forced_transition",
        label: "Forced Transition",
        pick: {
          kind: "custom",
          options: ["Rapid Advancement", "Regression", "True Self"],
        },
        count: { kind: "per_grant", amount: 1 },
        replace_on_level_up: false,
      },
    ],
  },

  // School of Necrotic Arts
  "open5e_school-of-necrotic-arts_dark-reaper": { activation: "special" },
  "open5e_school-of-necrotic-arts_control-undead": {
    activation: "action",
    effect: {
      kind: "save",
      save: { ability: "cha", dc_ability: "spell", success: "none" },
    },
  },

  // Spellsmith
  "toh_spellsmith_spell-transformation": {
    activation: "action",
    uses: perProficiencyLong(
      "spellsmith_spell_transformation",
      "Spell Transformation",
    ),
  },
  "toh_spellsmith_spell-honing": {
    activation: "special",
    uses: perProficiencyLong("spellsmith_spell_honing", "Spell Honing"),
    choices: [
      {
        key: "spell_honing",
        label: "Spell Honing",
        pick: {
          kind: "custom",
          options: [
            "Increase save DC by 2",
            "Increase spell attack bonus by 2",
            "Add Intelligence modifier to damage",
          ],
        },
        count: { kind: "per_grant", amount: 1 },
        replace_on_level_up: false,
      },
    ],
  },
  "toh_spellsmith_spell-reversion": { activation: "reaction" },
};
