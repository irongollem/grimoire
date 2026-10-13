import type { UsesAmount } from "@/rules/features/mechanics.types";
import type { FeatureCatalogue } from "../types";

/**
 * Open5e 2014 barbarian paths. A rider that works "while raging" names the
 * base Rage toggle (key `rage`), so one switch on the sheet gates the SRD
 * Rage damage and every path's riders alike.
 */
const RAGE_USE = { key: "rage_uses", amount: 1 };
const PROFICIENCY: UsesAmount = { kind: "proficiency" };

export const BARBARIAN_FEATURES: FeatureCatalogue = {
  // Path of Booming Magnificence
  "toh_path-of-booming-magnificence_roar-of-defiance": {
    activation: "reaction",
    effect: {
      kind: "save",
      save: { ability: "con", dc_ability: "cha", success: "none" },
      dice: { "3": "1d6", "10": "2d6" },
      damage_type: "thunder",
    },
  },
  "toh_path-of-booming-magnificence_lions-glory": {
    activation: "special",
    uses: {
      key: "lions_glory",
      label: "Lion's Glory",
      amount: { kind: "fixed", value: 1 },
      recharge: "long",
      pool: false,
    },
  },
  "toh_path-of-booming-magnificence_resonant-bellow": {
    activation: "bonus_action",
    uses: {
      key: "resonant_bellow",
      label: "Resonant Bellow",
      amount: { kind: "fixed", value: 1 },
      recharge: "short",
      pool: false,
    },
    effect: {
      kind: "temp_hp",
      dice: { "10": "1d12" },
      add: [{ kind: "ability", ability: "cha" }],
      min: 1,
    },
  },
  "toh_path-of-booming-magnificence_victorious-roar": {
    activation: "bonus_action",
    effect: {
      kind: "save",
      save: { ability: "wis", dc_ability: "cha", success: "half" },
      damage_type: "psychic",
      add: [{ kind: "class_level" }],
      area: "30 ft",
    },
  },

  // Path of Hellfire
  "toh_path-of-hellfire_hellish-aspect": {
    scaling: { label: "Hellish Aspect", values: { "3": "1d6", "10": "2d6" } },
    riders: [
      {
        label: "Hellish Aspect",
        dice: { kind: "scaling" },
        damage_type: "fire",
        applies_to: "weapon",
        once_per_turn: true,
        requires_toggle: "rage",
      },
    ],
  },
  "toh_path-of-hellfire_hells-vengeance": {
    activation: "reaction",
    effect: {
      kind: "damage",
      damage_type: "fire",
      add: [{ kind: "proficiency" }],
      area: "60 ft",
    },
  },
  "toh_path-of-hellfire_hellfire-shield": {
    activation: "special",
    uses: {
      key: "hellfire_shield",
      label: "Hellfire Shield",
      amount: { kind: "fixed", value: 1 },
      recharge: "short",
      pool: false,
    },
  },
  "toh_path-of-hellfire_devilish-essence": {
    activation: "reaction",
    effect: {
      kind: "temp_hp",
      add: [{ kind: "class_level" }],
    },
  },

  // Path of Mistwood
  "toh_path-of-mistwood_bonus-proficiency": { grants: { skills: ["stealth"] } },
  "toh_path-of-mistwood_from-the-mist": {
    activation: "bonus_action",
    uses: {
      key: "mistwood_from_the_mist",
      label: "From the Mist",
      amount: PROFICIENCY,
      recharge: "long",
      pool: false,
    },
  },
  "toh_path-of-mistwood_mist-dance": {
    activation: "special",
    uses: {
      key: "mistwood_mist_dance",
      label: "Mist Dance",
      amount: PROFICIENCY,
      recharge: "long",
      pool: false,
    },
  },

  // Path of the Dragon
  "toh_path-of-the-dragon_wyrm-teeth": {
    activation: "bonus_action",
    effect: {
      kind: "attack",
      attack: { delivery: "melee", ability: "str", range: "5 ft" },
      dice: { "3": "1d8" },
      damage_type: "piercing",
      add: [{ kind: "ability", ability: "str" }],
    },
    // The extra damage is of the totem dragon's type, which the contract cannot name from a choice: untyped.
    actions: [
      {
        name: "Bite (totem damage)",
        activation: "special",
        effect: { kind: "damage", add: [{ kind: "proficiency" }] },
      },
    ],
  },
  "toh_path-of-the-dragon_totem-dragon": {
    grants: { languages: ["Draconic"] },
    choices: [
      {
        key: "totem_dragon",
        label: "Totem Dragon",
        pick: {
          kind: "custom",
          options: [
            "Black or Copper (Acid)",
            "Blue or Bronze (Lightning)",
            "Brass, Gold, or Red (Fire)",
            "Green (Poison)",
            "Silver or White (Cold)",
          ],
        },
        count: { kind: "per_grant", amount: 1 },
        replace_on_level_up: false,
      },
    ],
  },
  "toh_path-of-the-dragon_legendary-might": {
    activation: "special",
    uses: {
      key: "legendary_might",
      label: "Legendary Might",
      amount: { kind: "by_level", values: { "6": 1, "14": 2 } },
      recharge: "long",
      pool: false,
    },
  },
  "toh_path-of-the-dragon_aspect-of-the-dragon": {
    // The aspect is chosen each time you rage, so there is no permanent pick; only Dragon Heart is limited.
    uses: {
      key: "dragon_heart",
      label: "Dragon Heart",
      amount: { kind: "fixed", value: 1 },
      recharge: "short",
      pool: false,
    },
    actions: [
      {
        name: "Dragon Heart",
        activation: "special",
        spends: { key: "dragon_heart", amount: 1 },
        effect: {
          kind: "temp_hp",
          dice: { "10": "1d12" },
          add: [{ kind: "class_level" }],
        },
      },
    ],
  },
  "toh_path-of-the-dragon_wyrm-lungs": {
    activation: "action",
    uses: {
      key: "wyrm_lungs",
      label: "Wyrm Lungs",
      amount: { kind: "fixed", value: 1 },
      recharge: "long",
      pool: false,
    },
    effect: {
      kind: "save",
      save: { ability: "dex", dc_ability: "con", success: "half" },
      dice: { "14": "12d8" },
      area: "60-ft cone",
    },
  },

  // Path of the Herald
  "toh_path-of-the-herald_oral-tradition": {
    grants: { skills: ["history", "performance"] },
  },
  "toh_path-of-the-herald_battle-fervor": {
    activation: "special",
    spends: RAGE_USE,
  },
  "toh_path-of-the-herald_lorekeeper": {
    activation: "special",
    uses: {
      key: "lorekeeper",
      label: "Lorekeeper",
      amount: { kind: "fixed", value: 1 },
      recharge: "short",
      pool: false,
    },
  },
  "toh_path-of-the-herald_bolstering-chant": {
    activation: "bonus_action",
    actions: [
      {
        // Barbarian level times 3.
        name: "End your rage",
        activation: "bonus_action",
        effect: {
          kind: "heal",
          add: [
            { kind: "class_level" },
            { kind: "class_level" },
            { kind: "class_level" },
          ],
        },
      },
      {
        name: "End your rage with Battle Fervor allies",
        activation: "bonus_action",
        effect: {
          kind: "heal",
          add: [{ kind: "class_level" }, { kind: "ability", ability: "cha" }],
        },
      },
    ],
  },
  "toh_path-of-the-herald_thunderous-oratory": {
    riders: [
      {
        label: "Thunderous Oratory",
        dice: { kind: "fixed", expression: "2d6" },
        damage_type: "thunder",
        applies_to: "weapon",
        once_per_turn: false,
        requires_toggle: "rage",
      },
    ],
    effect: {
      kind: "save",
      save: { ability: "str", dc_ability: "cha", success: "none" },
      area: "critical hit: pushed 10 ft and prone",
    },
  },

  // Path of the Inner Eye
  "toh_path-of-the-inner-eye_anticipatory-stance": { activation: "reaction" },
  "toh_path-of-the-inner-eye_insightful-dodge": {
    activation: "reaction",
    uses: {
      key: "insightful_dodge",
      label: "Insightful Dodge",
      amount: PROFICIENCY,
      recharge: "long",
      pool: false,
    },
  },
  "toh_path-of-the-inner-eye_foretelling-tactics": {
    activation: "special",
    uses: {
      key: "foretelling_tactics",
      label: "Foretelling Tactics",
      amount: { kind: "fixed", value: 1 },
      recharge: "short",
      pool: false,
    },
  },
  "toh_path-of-the-inner-eye_preemptive-parry": { activation: "reaction" },

  // Path of the Juggernaut
  "tdcs_path-of-the-juggernaut_thunderous-blows": {
    activation: "special",
    effect: {
      kind: "save",
      save: { ability: "str", dc_ability: "str", success: "none" },
    },
  },
  "tdcs_path-of-the-juggernaut_demolishing-might": {
    riders: [
      {
        label: "Demolishing Might (constructs)",
        dice: { kind: "fixed", expression: "1d8" },
        applies_to: "melee_weapon",
        once_per_turn: false,
      },
    ],
  },
  "tdcs_path-of-the-juggernaut_overwhelming-cleave": {
    activation: "bonus_action",
  },
  "tdcs_path-of-the-juggernaut_unstoppable": { activation: "special" },

  // Path of Thorns
  "toh_path-of-thorns_thorned-grasp": {
    activation: "special",
    effect: {
      kind: "damage",
      dice: { "3": "1d4", "10": "2d4" },
      damage_type: "piercing",
    },
  },
  "toh_path-of-thorns_blossoming-thorns": {
    activation: "bonus_action",
    effect: {
      kind: "attack",
      attack: { delivery: "melee", ability: "str" },
      dice: { "3": "1d4", "8": "1d6", "14": "1d8" },
      damage_type: "piercing",
      add: [{ kind: "ability", ability: "str" }],
    },
  },
  "toh_path-of-thorns_natures-blessing": {
    activation: "reaction",
    actions: [
      {
        name: "Thorns",
        activation: "reaction",
        effect: {
          kind: "damage",
          dice: { "6": "1d4", "10": "2d4" },
          damage_type: "piercing",
        },
      },
      {
        name: "Disarm",
        activation: "reaction",
        effect: {
          kind: "save",
          save: { ability: "str", dc_ability: "con", success: "none" },
        },
      },
    ],
  },
  "toh_path-of-thorns_toxic-infusion": {
    activation: "bonus_action",
    uses: {
      key: "toxic_infusion",
      label: "Toxic Infusion",
      amount: PROFICIENCY,
      recharge: "long",
      pool: false,
    },
    toggle: {
      key: "toxic_infusion",
      label: "Toxic Infusion",
      spends: { key: "toxic_infusion", amount: 1 },
      ends_on: "short_rest",
    },
    effect: {
      kind: "save",
      save: { ability: "con", dc_ability: "con", success: "none" },
    },
  },
  "toh_path-of-thorns_thorn-barrage": {
    activation: "action",
    uses: {
      key: "thorn_barrage",
      label: "Thorn Barrage",
      amount: PROFICIENCY,
      recharge: "long",
      pool: false,
    },
    effect: {
      kind: "save",
      save: { ability: "dex", dc_ability: "con", success: "half" },
      dice: { "14": "4d6" },
      damage_type: "piercing",
      area: "10 ft",
    },
  },
};
