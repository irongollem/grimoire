import type {
  FeatureMechanics,
  UsesCost,
} from "@/rules/features/mechanics.types";
import type { FeatureCatalogue } from "../types";

const CD: UsesCost = { key: "channel_divinity", amount: 1 };

/** The Channel Divinity pool arrives with the oath at 3rd level, so each oath's record declares it, as the SRD's Devotion does. */
function channelDivinity(
  actions: FeatureMechanics["actions"],
): FeatureMechanics {
  return {
    uses: {
      key: "channel_divinity",
      label: "Channel Divinity",
      amount: { kind: "by_level", values: { "3": 1 } },
      recharge: "short",
      pool: false,
    },
    actions,
  };
}

const once = (key: string, label: string) => ({
  key,
  label,
  amount: { kind: "fixed", value: 1 } as const,
  recharge: "long" as const,
  pool: false,
});

/**
 * Not encoded, because the contract cannot say it: Hearth's
 * Fiery Smite (an option on Divine Smite). Passive auras are absent.
 */
export const PALADIN_FEATURES: FeatureCatalogue = {
  // Oath of Justice
  "toh_oath-of-justice_channel-divinity": channelDivinity([
    {
      name: "Tether of Righteousness",
      activation: "action",
      spends: CD,
      effect: {
        kind: "save",
        save: { ability: "dex", dc_ability: "spell", success: "none" },
        area: "30 ft",
      },
    },
    { name: "Justicar's Celerity", activation: "reaction", spends: CD },
  ]),
  "toh_oath-of-justice_disciplined-pursuant": {
    activation: "special",
    effect: {
      kind: "save",
      save: { ability: "con", dc_ability: "spell", success: "none" },
    },
  },
  "toh_oath-of-justice_shackles-of-light": {
    activation: "special",
    effect: {
      kind: "save",
      save: { ability: "con", dc_ability: "spell", success: "none" },
    },
  },
  "toh_oath-of-justice_avatar-of-perfect-order": {
    activation: "action",
    uses: once("avatar_of_perfect_order", "Avatar of Perfect Order"),
    actions: [
      {
        name: "Command Action",
        activation: "reaction",
        effect: {
          kind: "save",
          save: { ability: "wis", dc_ability: "spell", success: "none" },
        },
      },
    ],
  },

  // Oath of Safeguarding
  "toh_oath-of-safeguarding_channel-divinity": channelDivinity([
    { name: "Insurmountable Passage", activation: "action", spends: CD },
    {
      name: "Protect from Harm",
      activation: "action",
      spends: CD,
      effect: {
        kind: "save",
        save: { ability: "wis", dc_ability: "spell", success: "none" },
        area: "30 ft",
      },
    },
  ]),
  "toh_oath-of-safeguarding_battlefield-controller": { activation: "reaction" },
  "toh_oath-of-safeguarding_redoubtable-defender": {
    activation: "action",
    uses: once("redoubtable_defender", "Redoubtable Defender"),
  },

  // Oath of the Elements
  "toh_oath-of-the-elements_elemental-language": {
    grants: { languages: ["Primordial"] },
  },
  "toh_oath-of-the-elements_channel-divinity": channelDivinity([
    {
      name: "Abjure the Otherworldly",
      activation: "action",
      spends: CD,
      effect: {
        kind: "save",
        save: { ability: "wis", dc_ability: "spell", success: "none" },
        area: "30 ft",
      },
    },
  ]),
  "toh_oath-of-the-elements_elemental-strike": {
    activation: "bonus_action",
    spends: CD,
    toggle: {
      key: "elemental_strike",
      label: "Elemental Strike",
      ends_on: "short_rest",
    },
    riders: [
      {
        label: "Elemental Strike",
        dice: {
          kind: "flat",
          add: [{ kind: "ability", ability: "cha" }],
          min: 1,
        },
        applies_to: "weapon",
        once_per_turn: false,
        requires_toggle: "elemental_strike",
      },
    ],
  },
  "toh_oath-of-the-elements_aura-of-resistance": {
    choices: [
      {
        key: "aura_of_resistance",
        label: "Aura of Resistance",
        pick: {
          kind: "custom",
          options: ["Acid", "Cold", "Fire", "Lightning", "Thunder"],
        },
        count: { kind: "per_grant", amount: 1 },
        replace_on_level_up: false,
      },
    ],
  },
  "toh_oath-of-the-elements_elemental-companion": {
    activation: "action",
    uses: once("elemental_companion", "Elemental Companion"),
  },
  "toh_oath-of-the-elements_elemental-champion": {
    activation: "bonus_action",
    uses: once("elemental_champion", "Elemental Champion"),
    toggle: {
      key: "elemental_champion",
      label: "Elemental Champion",
      spends: { key: "elemental_champion", amount: 1 },
      ends_on: "short_rest",
    },
    riders: [
      {
        label: "Elemental Champion",
        dice: { kind: "fixed", expression: "3d6" },
        applies_to: "weapon",
        once_per_turn: false,
        requires_toggle: "elemental_champion",
      },
    ],
  },

  // Oath of the Guardian
  "toh_oath-of-the-guardian_channel-divinity": channelDivinity([
    { name: "Inspired Leadership", activation: "action", spends: CD },
    {
      name: "Turn the Wild",
      activation: "action",
      spends: CD,
      effect: {
        kind: "save",
        save: { ability: "wis", dc_ability: "spell", success: "none" },
        area: "30 ft",
      },
    },
  ]),
  "toh_oath-of-the-guardian_hold-the-line": {
    activation: "reaction",
    uses: {
      key: "hold_the_line",
      label: "Hold the Line",
      amount: { kind: "ability_mod", ability: "cha", min: 1 },
      recharge: "long",
      pool: false,
    },
  },
  "toh_oath-of-the-guardian_band-of-heroes": {
    activation: "action",
    uses: once("band_of_heroes", "Band of Heroes"),
    effect: { kind: "temp_hp", add: [{ kind: "class_level" }] },
  },

  // Oath of the Hearth
  "toh_oath-of-the-hearth_channel-divinity": channelDivinity([
    {
      name: "Cease Hostility",
      activation: "action",
      spends: CD,
      effect: {
        kind: "save",
        save: { ability: "cha", dc_ability: "spell", success: "none" },
        area: "60 ft",
      },
    },
    {
      name: "Turn Boreal Creatures",
      activation: "action",
      spends: CD,
      effect: {
        kind: "save",
        save: { ability: "wis", dc_ability: "spell", success: "none" },
        area: "30 ft",
      },
    },
  ]),
  "toh_oath-of-the-hearth_roaring-fire": {
    activation: "special",
    uses: once("roaring_fire", "Roaring Fire"),
    toggle: {
      key: "roaring_fire",
      label: "Roaring Fire",
      spends: { key: "roaring_fire", amount: 1 },
      ends_on: "short_rest",
    },
    riders: [
      {
        label: "Roaring Fire",
        dice: { kind: "fixed", expression: "1d6" },
        damage_type: "fire",
        applies_to: "weapon",
        once_per_turn: false,
        requires_toggle: "roaring_fire",
      },
    ],
    effect: {
      kind: "damage",
      dice: { "20": "2d8" },
      damage_type: "fire",
      area: "20 ft",
    },
  },

  // Oath of the Plaguetouched
  "toh_oath-of-the-plaguetouched_channel-divinity": channelDivinity([
    { name: "Protective Aura", activation: "bonus_action", spends: CD },
    {
      name: "Turn Undead",
      activation: "action",
      spends: CD,
      effect: {
        kind: "save",
        save: { ability: "wis", dc_ability: "spell", success: "none" },
        area: "30 ft",
      },
    },
  ]),
  "toh_oath-of-the-plaguetouched_scourge-of-undeath": {
    activation: "bonus_action",
    uses: once("scourge_of_undeath", "Scourge of Undeath"),
    toggle: {
      key: "scourge_of_undeath",
      label: "Scourge of Undeath",
      ends_on: "short_rest",
    },
    riders: [
      {
        label: "Scourge of Undeath",
        dice: {
          kind: "flat",
          add: [
            { kind: "ability", ability: "cha" },
            { kind: "ability", ability: "cha" },
          ],
          min: 2,
        },
        damage_type: "radiant",
        applies_to: "melee_weapon",
        once_per_turn: false,
        requires_toggle: "scourge_of_undeath",
      },
    ],
  },

  // Oathless Betrayer
  "open5e_oathless-betrayer_channel-divinity": channelDivinity([
    {
      name: "Command the Undead",
      activation: "action",
      spends: CD,
      effect: {
        kind: "save",
        save: { ability: "wis", dc_ability: "spell", success: "none" },
        area: "30 ft",
      },
    },
    {
      name: "Frightful Bearing",
      activation: "action",
      spends: CD,
      effect: {
        kind: "save",
        save: { ability: "wis", dc_ability: "spell", success: "none" },
        area: "30 ft",
      },
    },
  ]),
  "open5e_oathless-betrayer_aura-of-loathing": {
    riders: [
      {
        label: "Aura of Loathing",
        dice: {
          kind: "flat",
          add: [{ kind: "ability", ability: "cha" }],
          min: 1,
        },
        applies_to: "melee_weapon",
        once_per_turn: false,
      },
    ],
  },
  "open5e_oathless-betrayer_master-of-doom": {
    activation: "action",
    uses: once("master_of_doom", "Master of Doom"),
    actions: [
      {
        name: "Aura Damage",
        activation: "special",
        effect: {
          kind: "damage",
          dice: { "20": "4d10" },
          damage_type: "psychic",
        },
      },
      {
        name: "Malicious Lash",
        activation: "bonus_action",
        effect: {
          kind: "attack",
          attack: { delivery: "melee", ability: "spell" },
          dice: { "20": "3d10" },
          damage_type: "necrotic",
          add: [{ kind: "ability", ability: "cha" }],
        },
      },
    ],
  },
};
