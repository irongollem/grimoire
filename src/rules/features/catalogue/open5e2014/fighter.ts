import type {
  FeatureMechanics,
  UsesAmount,
} from "@/rules/features/mechanics.types";
import type { FeatureCatalogue } from "../types";

const PROFICIENCY: UsesAmount = { kind: "proficiency" };

function ownSkill(
  key: string,
  label: string,
  from: Array<"insight" | "medicine" | "religion" | "nature" | "survival">,
): FeatureMechanics {
  return {
    choices: [
      {
        key,
        label,
        pick: { kind: "skill", from },
        count: { kind: "per_grant", amount: 1 },
        replace_on_level_up: false,
      },
    ],
  };
}

/**
 * Not encoded, because the contract cannot say it: the Arcane Warrior's
 * Spellcasting (a third-caster table), Pugilist Resilient Fighter's extra
 * Second Wind uses and the Radiant Pikeman's half-proficiency uses (the base
 * pool and a half-proficiency amount are not expressible), Legionary Massed
 * Fighting's bonus per adjacent ally, Tunnel Watcher Fight for Every Step's
 * damage reduction. Passive features are absent on purpose.
 */
export const FIGHTER_FEATURES: FeatureCatalogue = {
  // Arcane Warrior
  "open5e_arcane-warrior_bonded-weapon": { activation: "bonus_action" },
  "open5e_arcane-warrior_battle-magic": { activation: "bonus_action" },
  "open5e_arcane-warrior_improved-battle-magic": { activation: "bonus_action" },

  // Chaplain
  "toh_chaplain_student-of-faith": ownSkill(
    "student_of_faith",
    "Student of Faith",
    ["insight", "medicine", "religion"],
  ),
  "toh_chaplain_field-medic": { activation: "action" },
  "toh_chaplain_rally-the-troops": {
    activation: "action",
    uses: {
      key: "chaplain_rally_the_troops",
      label: "Rally the Troops",
      amount: { kind: "fixed", value: 1 },
      recharge: "short",
      pool: false,
    },
  },
  "toh_chaplain_rally-point": {
    activation: "reaction",
    uses: {
      key: "chaplain_rally_point",
      label: "Rally Point",
      amount: PROFICIENCY,
      recharge: "long",
      pool: false,
    },
  },

  // Legionary
  "toh_legionary_bonus-proficiency": ownSkill(
    "legionary_bonus_proficiency",
    "Bonus Proficiency",
    ["insight", "nature", "survival"],
  ),
  "toh_legionary_move-as-one": {
    activation: "special",
    uses: {
      key: "legionary_move_as_one",
      label: "Move As One",
      amount: PROFICIENCY,
      recharge: "long",
      pool: false,
    },
  },
  "toh_legionary_coordinated-fighting": {
    riders: [
      {
        label:
          "Coordinated Fighting (first attack each round, ally within 5 ft)",
        dice: { kind: "fixed", expression: "1" },
        applies_to: "weapon",
        once_per_turn: true,
      },
    ],
  },
  toh_legionary_vigilance: { activation: "reaction" },
  "toh_legionary_cooperative-strike": { activation: "bonus_action" },

  // Pugilist
  "toh_pugilist_unarmed-warrior": {
    activation: "bonus_action",
    scaling: {
      label: "Unarmed Strike Die",
      values: { "3": "d6", "10": "d8", "18": "d10" },
    },
  },
  "toh_pugilist_uncanny-fortitude": {
    activation: "special",
    uses: {
      key: "pugilist_uncanny_fortitude",
      label: "Uncanny Fortitude",
      amount: PROFICIENCY,
      recharge: "long",
      pool: false,
    },
  },
  "toh_pugilist_debilitating-blow": {
    activation: "bonus_action",
    effect: {
      kind: "save",
      save: { ability: "con", dc_ability: "str", success: "none" },
    },
  },
  "toh_pugilist_withstand-death": { activation: "reaction" },

  // Radiant Pikeman
  "toh_radiant-pikeman_harassing-strike": { activation: "reaction" },
  "toh_radiant-pikeman_formation-tactics": { activation: "bonus_action" },
  "toh_radiant-pikeman_give-ground": {
    activation: "reaction",
    effect: { kind: "damage", dice: { "15": "1d6" }, damage_type: "radiant" },
  },
  "toh_radiant-pikeman_the-suns-protection": { activation: "special" },

  // Timeblade
  "toh_timeblade_temporal-strike": {
    activation: "bonus_action",
    uses: {
      key: "timeblade_temporal_strike",
      label: "Temporal Strike",
      amount: PROFICIENCY,
      recharge: "short",
      pool: false,
    },
    actions: [
      {
        name: "Dislocative Step",
        activation: "bonus_action",
        spends: { key: "timeblade_temporal_strike", amount: 1 },
      },
      {
        name: "Dislocative Shove",
        activation: "bonus_action",
        spends: { key: "timeblade_temporal_strike", amount: 1 },
        effect: {
          kind: "save",
          save: { ability: "str", dc_ability: "str", success: "none" },
        },
      },
    ],
  },
  "toh_timeblade_chronologic-echo": {
    activation: "special",
    uses: {
      key: "timeblade_chronologic_echo",
      label: "Chronologic Echo",
      amount: { kind: "fixed", value: 1 },
      recharge: "long",
      pool: false,
    },
  },
  "toh_timeblade_improved-temporal-strike": {
    activation: "bonus_action",
    actions: [
      {
        name: "Chronal Cleave",
        activation: "bonus_action",
        spends: { key: "timeblade_temporal_strike", amount: 1 },
      },
      {
        name: "Chronal Shield",
        activation: "bonus_action",
        spends: { key: "timeblade_temporal_strike", amount: 1 },
      },
    ],
  },
  "toh_timeblade_continuity-rift": {
    activation: "special",
    uses: {
      key: "timeblade_continuity_rift",
      label: "Continuity Rift",
      amount: { kind: "fixed", value: 1 },
      recharge: "long",
      pool: false,
    },
    actions: [
      {
        name: "Return Damage",
        activation: "special",
        effect: {
          kind: "damage",
          dice: { "15": "8d8" },
          damage_type: "psychic",
        },
      },
      {
        name: "Confusion Save",
        activation: "special",
        effect: {
          kind: "save",
          save: { ability: "int", dc_ability: "int", success: "none" },
        },
      },
    ],
  },
  "toh_timeblade_temporal-warrior": {
    activation: "action",
    uses: {
      key: "timeblade_temporal_warrior",
      label: "Temporal Warrior",
      amount: { kind: "fixed", value: 1 },
      recharge: "long",
      pool: false,
    },
  },

  // Tunnel Watcher
  "toh_tunnel-watcher_bonus-proficiencies": {
    grants: { tools: ["Thieves' Tools", "Mason's Tools"] },
  },
  "toh_tunnel-watcher_fight-for-every-step": { activation: "reaction" },
  "toh_tunnel-watcher_first-line-of-defense": {
    riders: [
      {
        label: "First Line of Defense (opportunity attack)",
        dice: { kind: "fixed", expression: "1d8" },
        applies_to: "weapon",
        once_per_turn: false,
      },
    ],
  },
  "toh_tunnel-watcher_steadfast": {
    riders: [
      {
        label: "Steadfast",
        dice: { kind: "fixed", expression: "1d8" },
        applies_to: "weapon",
        once_per_turn: false,
      },
    ],
  },
  "toh_tunnel-watcher_cave-in": {
    activation: "special",
    effect: {
      kind: "save",
      save: { ability: "dex", dc_ability: "str", success: "half" },
      dice: { "15": "2d10" },
      damage_type: "bludgeoning",
    },
  },
  "toh_tunnel-watcher_against-the-tide": { activation: "bonus_action" },
};
