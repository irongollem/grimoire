import type { FeatureCatalogue } from "../types";

/**
 * Rogue archetypes. Not encoded: the Eldritch Trickster's, Soulspy's and
 * Underfoot's Spellcasting features (third-caster tables live with the
 * archetype's spell maps), and what the contract cannot say (a Sneak Attack
 * turned radiant, a damage threshold ignored on one hit only).
 */
export const ROGUE_FEATURES: FeatureCatalogue = {
  // Cat Burglar
  "toh_cat-burglar_up-over-and-in": { activation: "reaction" },
  "toh_cat-burglar_master-burglar": {
    activation: "bonus_action",
    uses: {
      key: "cat_burglar_master_burglar",
      label: "Master Burglar",
      amount: { kind: "fixed", value: 1 },
      recharge: "long",
      pool: false,
    },
  },

  // Dawn Blade
  "toh_dawn-blade_radiant-beam": {
    activation: "bonus_action",
    effect: {
      kind: "attack",
      attack: { delivery: "ranged", ability: "dex", range: "30 ft" },
      dice: { "3": "1d6", "10": "2d6" },
      damage_type: "radiant",
    },
  },
  "toh_dawn-blade_dawn-strike": {
    riders: [
      {
        label: "Dawn Strike (undead or shadow)",
        dice: { kind: "fixed", expression: "1d6" },
        damage_type: "radiant",
        applies_to: "finesse_or_ranged",
        once_per_turn: true,
      },
    ],
  },
  "toh_dawn-blade_bolstering-light": {
    activation: "special",
    effect: {
      kind: "temp_hp",
      add: [{ kind: "class_level" }, { kind: "class_level" }],
    },
    choices: [
      {
        key: "bolstering_light",
        label: "Bolstering Light",
        pick: {
          kind: "custom",
          options: [
            "Temporary hit points",
            "End blinded, deafened or poisoned",
            "End a curse",
            "End a disease",
          ],
        },
        count: { kind: "per_grant", amount: 1 },
        replace_on_level_up: false,
      },
    ],
  },
  "toh_dawn-blade_sudden-illumination": {
    activation: "special",
    effect: {
      kind: "save",
      save: { ability: "con", dc_ability: "wis", success: "none" },
    },
  },
  "toh_dawn-blade_dawn-flare": {
    activation: "special",
    effect: {
      kind: "save",
      save: { ability: "con", dc_ability: "wis", success: "none" },
      dice: { "17": "10d6" },
      damage_type: "radiant",
    },
  },

  // Eldritch Trickster
  "open5e_eldritch-trickster_magical-misdirection": {
    activation: "bonus_action",
  },
  "open5e_eldritch-trickster_eldritch-grift": {
    activation: "reaction",
    uses: {
      key: "eldritch_trickster_eldritch_grift",
      label: "Eldritch Grift",
      amount: { kind: "fixed", value: 1 },
      recharge: "long",
      pool: false,
    },
  },
  "open5e_eldritch-trickster_sleight-of-mage-hand": {
    activation: "bonus_action",
  },

  // Sapper
  "toh_sapper_combat-engineer": {
    activation: "action",
    grants: {
      tools: [
        "Alchemist's Supplies",
        "Carpenter's Tools",
        "Mason's Tools",
        "Tinker's Tools",
      ],
    },
    effect: {
      kind: "save",
      save: { ability: "dex", dc_ability: "int", success: "half" },
      dice: { "3": "1d6", "5": "2d6", "11": "3d6", "17": "4d6" },
      damage_type: "force",
      area: "10-ft radius",
    },
  },
  "toh_sapper_breach-defenses": {
    scaling: {
      label: "Damage Threshold Ignored",
      values: { "9": "5", "13": "10", "17": "15" },
    },
  },
  "toh_sapper_clear-the-path": { activation: "bonus_action" },
  "toh_sapper_all-clear": {
    activation: "action",
    uses: {
      key: "sapper_all_clear",
      label: "All Clear",
      amount: { kind: "fixed", value: 1 },
      recharge: "short",
      pool: false,
    },
  },

  // Smuggler
  "toh_smuggler_dab-handed-dealer": {
    grants: { tools: ["Vehicles (Land)", "Vehicles (Water)"] },
    choices: [
      {
        key: "dab_handed_dealer_tool",
        label: "Dab-handed Dealer",
        pick: {
          kind: "custom",
          options: ["Disguise Kit", "Navigator's Tools"],
        },
        count: { kind: "per_grant", amount: 1 },
        replace_on_level_up: false,
      },
    ],
  },
  "toh_smuggler_smuggler-s-legerdemain": {
    choices: [
      {
        key: "smuggler_legerdemain_cantrips",
        label: "Smuggler's Legerdemain Cantrips",
        pick: { kind: "spell", lists: ["Wizard"], level: 0, free_cast: false },
        count: { kind: "known", values: { "3": 2 } },
        replace_on_level_up: false,
      },
      {
        key: "smuggler_legerdemain_spell",
        label: "Smuggler's Legerdemain Spell",
        pick: { kind: "spell", lists: ["Wizard"], level: 1, free_cast: true },
        count: { kind: "known", values: { "7": 1 } },
        replace_on_level_up: true,
      },
    ],
  },
  "toh_smuggler_improved-smuggler-s-legerdemain": {
    choices: [
      {
        key: "smuggler_improved_legerdemain_spell",
        label: "Improved Smuggler's Legerdemain Spell",
        pick: { kind: "spell", lists: ["Wizard"], level: 2, free_cast: true },
        count: { kind: "known", values: { "13": 1 } },
        replace_on_level_up: true,
      },
    ],
  },

  // Soulspy
  "toh_soulspy_bonus-proficiency": { grants: { skills: ["religion"] } },
  "toh_soulspy_divine-symbol": {
    activation: "action",
    toggle: {
      key: "divine_symbol",
      label: "Divine Symbol",
      ends_on: "short_rest",
    },
    actions: [
      {
        name: "Divine Symbol Bolt (radiant)",
        activation: "action",
        effect: {
          kind: "attack",
          attack: { delivery: "ranged", ability: "wis", range: "30 ft" },
          dice: { "3": "1d8", "5": "2d8", "11": "3d8", "17": "4d8" },
          damage_type: "radiant",
        },
      },
      {
        name: "Divine Symbol Bolt (necrotic)",
        activation: "action",
        effect: {
          kind: "attack",
          attack: { delivery: "ranged", ability: "wis", range: "30 ft" },
          dice: { "3": "1d8", "5": "2d8", "11": "3d8", "17": "4d8" },
          damage_type: "necrotic",
        },
      },
      { name: "Become Thieves' Tools", activation: "bonus_action" },
    ],
  },
  "toh_soulspy_sacred-stealth": {
    activation: "special",
    uses: {
      key: "soulspy_sacred_stealth",
      label: "Sacred Stealth",
      amount: { kind: "ability_mod", ability: "wis", min: 1 },
      recharge: "short",
      pool: false,
    },
  },
  "toh_soulspy_life-thief": {
    activation: "special",
    uses: {
      key: "soulspy_life_thief",
      label: "Life Thief",
      amount: { kind: "fixed", value: 1 },
      recharge: "short",
      pool: false,
    },
  },

  // Underfoot
  toh_underfoot_undermine: {
    activation: "action",
    effect: {
      kind: "save",
      save: { ability: "dex", dc_ability: "dex", success: "none" },
    },
  },
};
