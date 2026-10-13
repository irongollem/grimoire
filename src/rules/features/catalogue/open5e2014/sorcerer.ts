import type { FeatureCatalogue } from "../types";

/**
 * Sorcerer archetypes. The Runechild's charged runes are modelled as a pool
 * that refills on a long rest, though the book has them empty after one; the
 * player spends down to what is actually charged.
 */
export const SORCERER_FEATURES: FeatureCatalogue = {
  // Cold-Blooded
  "toh_cold-blooded_insinuating-serpent": {
    activation: "special",
    uses: {
      key: "cold_blooded_insinuating_serpent",
      label: "Insinuating Serpent",
      amount: { kind: "proficiency" },
      recharge: "long",
      pool: false,
    },
  },
  "toh_cold-blooded_spirit-venom": {
    activation: "reaction",
    uses: {
      key: "cold_blooded_spirit_venom",
      label: "Spirit Venom",
      amount: { kind: "proficiency" },
      recharge: "long",
      pool: false,
    },
    effect: { kind: "damage", dice: { "14": "6d4" }, damage_type: "psychic" },
  },
  "toh_cold-blooded_mirrored-lamina": { activation: "reaction" },

  // Hungering
  "toh_hungering_thirsty-soul": {
    activation: "special",
    effect: {
      kind: "heal",
      add: [{ kind: "class_level" }, { kind: "ability", ability: "cha" }],
      min: 1,
    },
  },
  "toh_hungering_glutton-for-punishment": { activation: "reaction" },

  // Resonant Body
  "toh_resonant-body_signature-sound": {
    activation: "special",
    uses: {
      key: "resonant_body_signature_sound",
      label: "Signature Sound (alarm)",
      amount: { kind: "fixed", value: 1 },
      recharge: "long",
      pool: false,
    },
    actions: [
      {
        name: "Shatter",
        activation: "action",
        spends: { key: "sorcery_points", amount: 3 },
      },
      {
        name: "Silence",
        activation: "action",
        spends: { key: "sorcery_points", amount: 3 },
      },
    ],
  },
  "toh_resonant-body_sonic-savant": {
    activation: "special",
    uses: {
      key: "resonant_body_sonic_savant",
      label: "Sonic Savant",
      amount: { kind: "proficiency" },
      recharge: "long",
      pool: false,
    },
  },
  "toh_resonant-body_sound-and-fury": {
    activation: "special",
    uses: {
      key: "resonant_body_sound_and_fury",
      label: "Sound and Fury",
      amount: { kind: "proficiency" },
      recharge: "long",
      pool: false,
    },
  },

  // Rifthopper
  "toh_rifthopper_shift-space": { activation: "special" },
  "toh_rifthopper_teleport-object": {
    activation: "action",
    scaling: {
      label: "Object Weight",
      values: { "1": "5 lb", "6": "10 lb", "14": "15 lb", "18": "20 lb" },
    },
  },
  "toh_rifthopper_tactical-swap": {
    activation: "reaction",
    uses: {
      key: "rifthopper_tactical_swap",
      label: "Tactical Swap",
      amount: { kind: "proficiency" },
      recharge: "long",
      pool: false,
    },
  },
  "toh_rifthopper_familiar-locations": {
    activation: "action",
    uses: {
      key: "rifthopper_familiar_locations",
      label: "Familiar Locations",
      amount: { kind: "proficiency" },
      recharge: "long",
      pool: false,
    },
  },
  "toh_rifthopper_dimensional-ambler": {
    activation: "action",
    uses: {
      key: "rifthopper_dimensional_ambler",
      label: "Dimensional Ambler",
      amount: { kind: "fixed", value: 1 },
      recharge: "long",
      pool: false,
    },
  },

  // Runechild
  "tdcs_runechild_glyphs-of-aegis": {
    actions: [
      {
        name: "Absorb Damage (per rune)",
        activation: "reaction",
        spends: { key: "runechild_charged_runes", amount: 1 },
      },
      {
        name: "Transfer a Glyph",
        activation: "action",
        spends: { key: "runechild_charged_runes", amount: 1 },
      },
    ],
  },
  "tdcs_runechild_essence-runes": {
    activation: "bonus_action",
    uses: {
      key: "runechild_charged_runes",
      label: "Charged Runes",
      amount: { kind: "class_level", multiplier: 1 },
      recharge: "long",
      pool: true,
    },
  },
  "tdcs_runechild_manifest-inscriptions": {
    activation: "action",
    spends: { key: "runechild_charged_runes", amount: 1 },
  },
  "tdcs_runechild_sigilic-augmentation": {
    activation: "bonus_action",
    spends: { key: "runechild_charged_runes", amount: 1 },
  },
  "tdcs_runechild_runic-torrent": { activation: "special" },
  "tdcs_runechild_arcane-exemplar-form": {
    activation: "bonus_action",
    uses: {
      key: "runechild_arcane_exemplar_form",
      label: "Arcane Exemplar Form",
      amount: { kind: "fixed", value: 1 },
      recharge: "long",
      pool: false,
    },
    toggle: {
      key: "arcane_exemplar_form",
      label: "Arcane Exemplar Form",
      spends: { key: "runechild_charged_runes", amount: 6 },
      ends_on: "short_rest",
    },
  },

  // Spore Sorcery
  "toh_spore-sorcery_spore-transmission": { activation: "bonus_action" },
  "toh_spore-sorcery_metamagic-spore-transmission": {
    actions: [
      {
        name: "Hungry Spell: regain hit points",
        activation: "special",
        effect: {
          kind: "heal",
          add: [
            { kind: "ability", ability: "cha" },
            { kind: "ability", ability: "cha" },
          ],
          min: 2,
        },
      },
      {
        name: "Shared Hunger Spell: regain hit points",
        activation: "special",
        effect: {
          kind: "heal",
          add: [
            { kind: "ability", ability: "cha" },
            { kind: "ability", ability: "cha" },
          ],
          min: 2,
        },
      },
    ],
  },
  "toh_spore-sorcery_nature-magic": {
    activation: "action",
    uses: {
      key: "spore_sorcery_speak_with_plants",
      label: "Speak with Plants",
      amount: { kind: "proficiency" },
      recharge: "long",
      pool: false,
    },
  },
  "toh_spore-sorcery_spores-protection": {
    activation: "reaction",
    effect: { kind: "temp_hp", dice: { "14": "10" } },
  },
  "toh_spore-sorcery_spore-form": {
    activation: "action",
    uses: {
      key: "spore_sorcery_spore_form",
      label: "Spore Form",
      amount: { kind: "fixed", value: 1 },
      recharge: "long",
      pool: false,
    },
    toggle: { key: "spore_form", label: "Spore Form", ends_on: "short_rest" },
    actions: [
      {
        name: "Spores Heal Allies",
        activation: "special",
        effect: {
          kind: "heal",
          add: [{ kind: "ability", ability: "cha" }],
          min: 1,
          area: "20-ft radius",
        },
      },
      {
        name: "Spores Harm Foes",
        activation: "special",
        effect: {
          kind: "damage",
          damage_type: "poison",
          add: [{ kind: "ability", ability: "cha" }],
          min: 1,
          area: "20-ft radius",
        },
      },
    ],
  },

  // Wastelander
  "toh_wastelander_aberrant-physiology": {
    activation: "reaction",
    uses: {
      key: "wastelander_aberrant_physiology",
      label: "Aberrant Physiology",
      amount: { kind: "proficiency" },
      recharge: "long",
      pool: false,
    },
  },
  "toh_wastelander_alien-alteration": {
    choices: [
      {
        key: "alien_alteration",
        label: "Alien Alteration",
        pick: {
          kind: "custom",
          options: [
            "Binary Mind",
            "Digitigrade Legs",
            "Grasping Tentacle",
            "Prehensile Tail",
          ],
        },
        count: { kind: "per_grant", amount: 1 },
        replace_on_level_up: false,
      },
    ],
    actions: [
      {
        name: "Tentacle Strike",
        activation: "action",
        effect: {
          kind: "attack",
          attack: { delivery: "melee", ability: "cha" },
          dice: { "1": "1d6" },
          damage_type: "bludgeoning",
          add: [{ kind: "ability", ability: "cha" }],
        },
      },
    ],
  },
  "toh_wastelander_advanced-transformation": {
    choices: [
      {
        key: "advanced_transformation",
        label: "Advanced Transformation",
        pick: {
          kind: "custom",
          options: [
            "Caustic Tentacle",
            "Cognitive Split",
            "Fell Sprinter",
            "Third Arm",
            "A second Alien Alteration",
          ],
        },
        count: { kind: "per_grant", amount: 1 },
        replace_on_level_up: false,
      },
    ],
    riders: [
      {
        label: "Caustic Tentacle",
        dice: { kind: "fixed", expression: "2d6" },
        damage_type: "acid",
        applies_to: "unarmed",
        once_per_turn: false,
      },
    ],
    actions: [
      { name: "Fell Sprinter: Dash", activation: "bonus_action" },
      { name: "Fell Sprinter: Disengage", activation: "bonus_action" },
    ],
  },
  "toh_wastelander_absorb-arcana": { activation: "reaction" },
  "toh_wastelander_spontaneous-transformation": {
    activation: "bonus_action",
    uses: {
      key: "wastelander_spontaneous_transformation",
      label: "Spontaneous Transformation",
      amount: { kind: "fixed", value: 1 },
      recharge: "short",
      pool: false,
    },
    toggle: {
      key: "spontaneous_transformation",
      label: "Spontaneous Transformation",
      spends: { key: "wastelander_spontaneous_transformation", amount: 1 },
      ends_on: "short_rest",
    },
  },

  // Wyrd Magic
  "open5e_wyrd-magic_wyrd-weaver": {
    activation: "special",
    uses: {
      key: "wyrd_magic_wyrd_weaver",
      label: "Wyrd Weaver",
      amount: { kind: "fixed", value: 1 },
      recharge: "long",
      pool: false,
    },
  },
  "open5e_wyrd-magic_tip-the-scales-of-fate": {
    activation: "reaction",
    spends: { key: "sorcery_points", amount: 2 },
  },
  "open5e_wyrd-magic_magical-deluge": { activation: "special" },
};
