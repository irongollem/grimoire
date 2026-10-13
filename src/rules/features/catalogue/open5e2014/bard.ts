import type { UsesAmount } from "@/rules/features/mechanics.types";
import type { FeatureCatalogue } from "../types";

const INSPIRATION = { key: "bardic_inspiration", amount: 1 };
const PROFICIENCY: UsesAmount = { kind: "proficiency" };

export const BARD_FEATURES: FeatureCatalogue = {
  // College of Echoes
  "toh_college-of-echoes_alter-sound": {
    activation: "reaction",
    actions: [
      { name: "Enhance", activation: "reaction" },
      { name: "Dampen", activation: "reaction" },
      { name: "Distort", activation: "reaction" },
      { name: "Disrupt", activation: "reaction", spends: INSPIRATION },
    ],
  },
  "toh_college-of-echoes_resounding-strikes": {
    riders: [
      {
        label: "Resounding Strikes",
        dice: {
          kind: "slot",
          base: "1d6",
          base_level: 1,
          per_level: "1d6",
          max_dice: 6,
        },
        damage_type: "thunder",
        applies_to: "melee_weapon",
        once_per_turn: false,
        cost: { kind: "spell_slot" },
      },
    ],
  },
  "toh_college-of-echoes_reverberating-strikes": {
    activation: "special",
    effect: {
      kind: "save",
      save: { ability: "str", dc_ability: "spell", success: "none" },
    },
  },

  // College of Investigation
  "toh_college-of-investigation_bonus-proficiencies": {
    grants: { skills: ["insight"] },
    choices: [
      {
        key: "investigation_skills",
        label: "Bonus Proficiencies",
        pick: {
          kind: "skill",
          from: [
            "acrobatics",
            "deception",
            "investigation",
            "performance",
            "sleight_of_hand",
            "stealth",
          ],
        },
        count: { kind: "per_grant", amount: 2 },
        replace_on_level_up: false,
      },
    ],
  },
  "toh_college-of-investigation_quick-read": {
    activation: "bonus_action",
    spends: INSPIRATION,
  },
  "toh_college-of-investigation_bardic-instinct": { activation: "reaction" },
  "toh_college-of-investigation_hot-pursuit": { activation: "special" },

  // College of Shadows
  "toh_college-of-shadows_bonus-proficiencies": {
    grants: { skills: ["stealth"] },
    choices: [
      {
        key: "shadows_skills",
        label: "Bonus Proficiencies",
        pick: { kind: "skill", from: [] },
        count: { kind: "per_grant", amount: 2 },
        replace_on_level_up: false,
      },
    ],
  },
  "toh_college-of-shadows_mantle-of-shadows": {
    activation: "action",
    toggle: {
      key: "mantle_of_shadows",
      label: "Mantle of Shadows",
      ends_on: "short_rest",
    },
  },
  "toh_college-of-shadows_cunning-insight": {
    activation: "action",
    actions: [
      {
        name: "Cunning Insight",
        activation: "action",
        effect: {
          kind: "save",
          save: { ability: "wis", dc_ability: "spell", success: "none" },
          area: "60 ft",
        },
      },
      {
        name: "Cunning Insight (Bardic Inspiration)",
        activation: "bonus_action",
        spends: INSPIRATION,
        effect: {
          kind: "save",
          save: { ability: "wis", dc_ability: "spell", success: "none" },
          area: "60 ft",
        },
      },
    ],
  },
  "toh_college-of-shadows_shadowed-performance": {
    activation: "special",
    uses: {
      key: "shadowed_performance",
      label: "Shadowed Performance",
      amount: { kind: "fixed", value: 1 },
      recharge: "short",
      pool: false,
    },
    effect: {
      kind: "save",
      save: { ability: "wis", dc_ability: "spell", success: "none" },
    },
  },

  // College of Sincerity
  "toh_college-of-sincerity_artist-of-renown": {
    activation: "special",
    spends: INSPIRATION,
  },

  // College of Skalds
  "open5e_college-of-skalds_saga-of-deeds": {
    actions: [
      { name: "Add to weapon damage", activation: "special" },
      { name: "Add to Armor Class", activation: "reaction" },
    ],
  },
  "open5e_college-of-skalds_song-and-strike": { activation: "bonus_action" },

  // College of Tactics
  "toh_college-of-tactics_setting-the-board": {
    activation: "bonus_action",
    uses: {
      key: "setting_the_board",
      label: "Setting the Board",
      amount: PROFICIENCY,
      recharge: "long",
      pool: false,
    },
  },
  "toh_college-of-tactics_song-of-strategy": {
    activation: "special",
    actions: [
      { name: "Bait and Bleed", activation: "special" },
      { name: "Counter Offensive", activation: "reaction" },
      { name: "Distraction", activation: "bonus_action" },
      { name: "Frightening Charge", activation: "special" },
      { name: "Hold Steady", activation: "special" },
      { name: "Indirect Approach", activation: "special" },
    ],
  },
  "toh_college-of-tactics_ablative-inspiration": {
    activation: "reaction",
    spends: INSPIRATION,
  },

  // College of the Cat
  "toh_college-of-the-cat_inspired-pounce": { activation: "reaction" },
  "toh_college-of-the-cat_bonus-proficiencies": {
    grants: { skills: ["acrobatics", "stealth"], tools: ["Thieves' Tools"] },
  },
};
