import type { FeatureCatalogue } from "../types";

/**
 * Black Flag's Mechanist, archetype Metallurgist. The base class is not in the
 * SRD catalogue, so Augment effects are not a pool this file can spend from;
 * Absorbing carries its own.
 *
 * Not encoded: Absorbing's damage reduction (twice the Intelligence modifier,
 * not a roll), Mystic Metal's gauntlet attack (the player picks Strength or
 * Intelligence per attack, which an effect cannot say) and Juggernaut's
 * Athletics proficiency (it holds only while the armour is worn).
 */
export const MECHANIST_FEATURES: FeatureCatalogue = {
  // Metallurgist
  "bfrd_metallurgist_augment-absorbing": {
    activation: "reaction",
    uses: {
      key: "metallurgist_absorbing",
      label: "Absorbing",
      amount: { kind: "proficiency" },
      recharge: "long",
      pool: false,
    },
  },
  "bfrd_metallurgist_mystic-metal": {
    actions: [{ name: "Summon Armor", activation: "bonus_action" }],
  },
  "bfrd_metallurgist_heavy-hitter": {
    scaling: {
      label: "Heavy Hitter Damage",
      values: { "7": "1d6", "9": "1d8", "15": "1d10" },
    },
    riders: [
      {
        label: "Heavy Hitter",
        dice: { kind: "scaling" },
        damage_type: "force",
        applies_to: "weapon",
        once_per_turn: false,
      },
    ],
  },
  "bfrd_metallurgist_full-metal": {
    activation: "bonus_action",
    uses: {
      key: "metallurgist_full_metal",
      label: "Full Metal",
      amount: { kind: "fixed", value: 1 },
      recharge: "long",
      pool: false,
    },
    toggle: { key: "full_metal", label: "Full Metal", ends_on: "short_rest" },
  },
};
