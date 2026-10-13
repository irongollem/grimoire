import type { FeatureUses } from "@/rules/features/mechanics.types";
import type { FeatureCatalogue } from "../types";

/**
 * Warlock archetypes beyond the SRD (Tome of Heroes, Open5e Originals).
 * Spell DCs read "your warlock spell save DC" or name no ability, so they use
 * the class's spell save DC. Passive features and the spell lists are absent.
 */

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

const ELEMENTS = ["Acid", "Cold", "Fire", "Lightning", "Poison"];

const probabilityDice: Record<string, number> = {};
for (let level = 1; level <= 20; level++)
  probabilityDice[String(level)] = level + 1;

export const WARLOCK_FEATURES: FeatureCatalogue = {
  // Ancient Dragons
  "toh_ancient-dragons_wyrmling-blessing": {
    choices: [
      {
        key: "wyrmling_blessing",
        label: "Wyrmling Blessing",
        pick: {
          kind: "custom",
          options: [
            "Aquatic Affinity",
            "Draconic Hunger",
            "Draconic Sight",
            "Elemental Versatility",
          ],
        },
        count: { kind: "per_grant", amount: 1 },
        replace_on_level_up: false,
      },
      {
        key: "elemental_versatility_type",
        label: "Elemental Versatility",
        pick: { kind: "custom", options: ELEMENTS },
        count: { kind: "per_grant", amount: 1 },
        replace_on_level_up: false,
      },
    ],
  },
  "toh_ancient-dragons_dragon-tongue": { grants: { languages: ["Draconic"] } },
  "toh_ancient-dragons_draconic-mien": {
    activation: "action",
    uses: oncePer("ancient_dragons_draconic_mien", "Draconic Mien", "short"),
    effect: {
      kind: "save",
      save: { ability: "wis", dc_ability: "spell", success: "none" },
      area: "up to 3 creatures within 30 ft",
    },
    choices: [
      {
        key: "draconic_mien_resistance",
        label: "Draconic Mien Resistance",
        pick: { kind: "custom", options: ELEMENTS },
        count: { kind: "per_grant", amount: 1 },
        replace_on_level_up: false,
      },
    ],
  },
  "toh_ancient-dragons_ascended-blessing": {
    riders: [
      {
        label: "Ascended Blessing",
        dice: { kind: "flat", add: [{ kind: "ability", ability: "cha" }] },
        applies_to: "spell",
        once_per_turn: false,
      },
    ],
    uses: {
      key: "ancient_dragons_elemental_expertise",
      label: "Elemental Expertise reaction",
      amount: { kind: "proficiency" },
      recharge: "long",
      pool: false,
    },
    choices: [
      {
        key: "ascended_blessing",
        label: "Ascended Blessing",
        pick: {
          kind: "custom",
          options: [
            "Aquatic Command",
            "Crystallized Hunger",
            "Draconic Senses",
            "Elemental Expertise",
          ],
        },
        count: { kind: "per_grant", amount: 1 },
        replace_on_level_up: false,
      },
    ],
    actions: [
      { name: "Essence Gem", activation: "bonus_action" },
      {
        name: "Elemental Expertise reaction",
        activation: "reaction",
        spends: { key: "ancient_dragons_elemental_expertise", amount: 1 },
        effect: {
          kind: "damage",
          add: [{ kind: "proficiency" }],
        },
      },
    ],
  },
  "toh_ancient-dragons_draconic-manifestation": {
    activation: "action",
    uses: oncePer(
      "ancient_dragons_draconic_manifestation",
      "Draconic Manifestation",
      "long",
    ),
  },

  // Animal Lords
  "toh_animal-lords_natural-blessing": {
    grants: { skills: ["animal_handling"] },
  },
  "toh_animal-lords_animalistic-insight": {
    activation: "action",
    uses: oncePer(
      "animal_lords_animalistic_insight",
      "Animalistic Insight",
      "short",
    ),
    scaling: {
      label: "Animalistic Insight bonus",
      values: { "1": "+1", "10": "+2" },
    },
    choices: [
      {
        key: "animalistic_insight_benefit",
        label: "Animalistic Insight",
        pick: {
          kind: "custom",
          options: [
            "Attack bonus",
            "Damage bonus",
            "Advantage on saving throws",
            "Armor Class bonus",
          ],
        },
        count: { kind: "per_grant", amount: 1 },
        replace_on_level_up: false,
      },
    ],
  },
  "toh_animal-lords_patron-companion": { activation: "bonus_action" },
  "toh_animal-lords_primal-mastery": {
    choices: [
      {
        key: "primal_mastery",
        label: "Primal Mastery",
        pick: {
          kind: "custom",
          options: [
            "Cat Eyes",
            "Chameleonic",
            "Fangs",
            "Hold Breath",
            "Keen Senses",
            "Leap",
            "Spry",
            "Swift",
            "Thick Hide",
            "Webbed Limbs",
          ],
        },
        count: { kind: "per_grant", amount: 1 },
        replace_on_level_up: false,
      },
    ],
    actions: [
      {
        name: "Fangs",
        activation: "special",
        effect: {
          kind: "attack",
          attack: { delivery: "melee", ability: "cha" },
          dice: { "10": "1d6" },
          damage_type: "piercing",
          add: [{ kind: "ability", ability: "cha" }],
        },
      },
    ],
  },
  "toh_animal-lords_call-the-legions": {
    activation: "action",
    uses: oncePer("animal_lords_call_the_legions", "Call the Legions", "short"),
  },

  // Hunter in Darkness
  "toh_hunter-in-darkness_savage-hunter": {
    activation: "special",
    effect: {
      kind: "save",
      save: { ability: "wis", dc_ability: "spell", success: "none" },
    },
  },
  "toh_hunter-in-darkness_step-into-shadow": {
    activation: "bonus_action",
    uses: oncePer(
      "hunter_in_darkness_step_into_shadow",
      "Step Into Shadow",
      "short",
    ),
  },
  "toh_hunter-in-darkness_strike-from-the-dark": {
    activation: "special",
    effect: {
      kind: "save",
      save: { ability: "wis", dc_ability: "spell", success: "none" },
    },
  },
  "toh_hunter-in-darkness_avatar-of-death": {
    activation: "bonus_action",
    uses: oncePer(
      "hunter_in_darkness_avatar_of_death",
      "Avatar of Death",
      "short",
    ),
    effect: {
      kind: "save",
      save: { ability: "wis", dc_ability: "spell", success: "none" },
      area: "allies of the target within 30 ft",
    },
  },

  // Old Wood
  "toh_old-wood_sap-magic": {
    activation: "reaction",
    effect: {
      kind: "heal",
      add: [{ kind: "class_level" }, { kind: "ability", ability: "cha" }],
      min: 1,
    },
  },
  "toh_old-wood_predatory-grace": {
    activation: "action",
    uses: oncePer("old_wood_predatory_grace", "Predatory Grace", "short"),
  },
  "toh_old-wood_avatar-of-the-wood": {
    activation: "bonus_action",
    uses: oncePer("old_wood_avatar_of_the_wood", "Avatar of the Wood", "short"),
    toggle: {
      key: "avatar_of_the_wood",
      label: "Avatar of the Wood",
      spends: { key: "old_wood_avatar_of_the_wood", amount: 1 },
      ends_on: "short_rest",
    },
    actions: [
      {
        name: "Claws",
        activation: "special",
        effect: {
          kind: "attack",
          attack: { delivery: "melee", ability: "cha" },
          dice: { "14": "1d6" },
          damage_type: "slashing",
          add: [{ kind: "ability", ability: "cha" }],
        },
      },
    ],
  },

  // Primordial
  "toh_primordial_convulsion-of-the-worldbuilder": {
    activation: "action",
    uses: oncePer(
      "primordial_convulsion_of_the_worldbuilder",
      "Convulsion of the Worldbuilder",
      "short",
    ),
    effect: {
      kind: "save",
      save: { ability: "dex", dc_ability: "spell", success: "none" },
      dice: { "1": "1d8", "5": "2d8", "11": "3d8", "17": "4d8" },
      damage_type: "bludgeoning",
      area: "30-ft cone, 30-ft line or 20-ft radius burst",
    },
  },
  toh_primordial_redirection: {
    activation: "reaction",
    uses: oncePer("primordial_redirection", "Redirection", "short"),
  },
  "toh_primordial_adaptive-shroud": {
    activation: "reaction",
    uses: oncePer("primordial_adaptive_shroud", "Adaptive Shroud", "short"),
  },
  "toh_primordial_crushing-regard-of-the-primordial-one": {
    activation: "action",
    uses: oncePer(
      "primordial_crushing_regard",
      "Crushing Regard of the Primordial One",
      "long",
    ),
    actions: [
      {
        name: "One Creature",
        activation: "action",
        spends: { key: "primordial_crushing_regard", amount: 1 },
        effect: {
          kind: "save",
          save: { ability: "wis", dc_ability: "spell", success: "half" },
          dice: { "14": "10d10" },
          damage_type: "force",
          area: "one creature within 60 ft",
        },
      },
      {
        name: "Multiple Creatures",
        activation: "action",
        spends: { key: "primordial_crushing_regard", amount: 1 },
        effect: {
          kind: "save",
          save: { ability: "con", dc_ability: "spell", success: "half" },
          dice: { "14": "5d10" },
          damage_type: "force",
          area: "20-ft-radius sphere within 100 ft",
        },
      },
    ],
  },

  // The Ancient Fey Court
  "open5e_the-ancient-fey-court_courtiers-aspect": {
    activation: "action",
    uses: oncePer(
      "ancient_fey_court_courtiers_aspect",
      "Courtier's Aspect",
      "short",
    ),
    effect: {
      kind: "save",
      save: { ability: "wis", dc_ability: "spell", success: "none" },
      area: "10-ft cube",
    },
  },
  "open5e_the-ancient-fey-court_shroud-of-mists": {
    activation: "reaction",
    uses: oncePer(
      "ancient_fey_court_shroud_of_mists",
      "Shroud of Mists",
      "short",
    ),
  },
  "open5e_the-ancient-fey-court_counter-enchantment": {
    activation: "reaction",
    effect: {
      kind: "save",
      save: { ability: "wis", dc_ability: "spell", success: "none" },
    },
  },
  "open5e_the-ancient-fey-court_waking-dream": {
    activation: "action",
    uses: oncePer("ancient_fey_court_waking_dream", "Waking Dream", "short"),
    effect: {
      kind: "save",
      save: { ability: "wis", dc_ability: "spell", success: "none" },
      area: "one creature within 60 ft",
    },
  },

  // The Great Elder Thing
  "open5e_the-great-elder-thing_inhuman_reflex": {
    activation: "reaction",
    uses: oncePer(
      "great_elder_thing_inhuman_reflex",
      "Inhuman Reflex",
      "short",
    ),
  },
  "open5e_the-great-elder-thing_cosmic-enthrallment": { activation: "action" },

  // Wyrdweaver
  "toh_wyrdweaver_appropriate-advantage": {
    activation: "reaction",
    spends: { key: "probability_dice", amount: 1 },
    effect: {
      kind: "save",
      save: { ability: "cha", dc_ability: "spell", success: "none" },
      area: "creature within 60 ft",
    },
  },
  "toh_wyrdweaver_probability-wellspring": {
    activation: "reaction",
    uses: {
      key: "probability_dice",
      label: "Probability Dice",
      amount: { kind: "by_level", values: probabilityDice },
      recharge: "long",
      pool: true,
    },
    scaling: {
      label: "Probability Die",
      values: { "1": "d6", "5": "d8", "11": "d10", "17": "d12" },
    },
  },
  "toh_wyrdweaver_improbable-duplicate": {
    activation: "special",
    scaling: {
      label: "Probability Die",
      values: { "6": "1d6", "11": "1d8", "17": "1d10" },
    },
    riders: [
      {
        label: "Improbable Duplicate",
        dice: { kind: "scaling" },
        applies_to: "weapon",
        once_per_turn: true,
        cost: { kind: "uses", key: "probability_dice", amount: 1 },
      },
    ],
  },
  "toh_wyrdweaver_inconceivable-channeling": {
    activation: "reaction",
    uses: oncePer(
      "wyrdweaver_inconceivable_channeling",
      "Inconceivable Channeling",
      "short",
    ),
  },
  "toh_wyrdweaver_favored-soul": {
    activation: "reaction",
    uses: oncePer("wyrdweaver_favored_soul", "Favored Soul", "short"),
    effect: {
      kind: "save",
      save: { ability: "cha", dc_ability: "spell", success: "none" },
      area: "creature within 60 ft",
    },
  },
};
