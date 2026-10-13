import type {
  FeatureMechanics,
  FeatureUses,
  UsesCost,
} from "@/rules/features/mechanics.types";
import type { FeatureCatalogue } from "../types";

/**
 * Cleric domains from Open5e (Tome of Heroes, Tal'Dorei, Open5e Originals).
 * The "... Domain Spells" tables are absent: they live in the archetype's spell
 * maps. Channel Divinity spends the cleric's own `channel_divinity` pool.
 */

const CHANNEL_DIVINITY: UsesCost = { key: "channel_divinity", amount: 1 };

function channelDivinity(
  extra: Omit<FeatureMechanics, "spends"> = {},
): FeatureMechanics {
  return { activation: "action", spends: CHANNEL_DIVINITY, ...extra };
}

function usesOnce(
  key: string,
  label: string,
  recharge: FeatureUses["recharge"] = "long",
): FeatureUses {
  return {
    key,
    label,
    amount: { kind: "fixed", value: 1 },
    recharge,
    pool: false,
  };
}

function usesProficiency(key: string, label: string): FeatureUses {
  return {
    key,
    label,
    amount: { kind: "proficiency" },
    recharge: "long",
    pool: false,
  };
}

function usesWisdom(key: string, label: string): FeatureUses {
  return {
    key,
    label,
    amount: { kind: "ability_mod", ability: "wis", min: 1 },
    recharge: "long",
    pool: false,
  };
}

/** The 8th-level Divine Strike: 1d8, 2d8 from 14th. No damage type means the weapon's own. */
function divineStrike(die: string, damageType?: string): FeatureMechanics {
  const dice =
    die === "1d8" ? { "8": "1d8", "14": "2d8" } : { "8": "1d6", "14": "2d6" };
  return {
    scaling: { label: "Divine Strike", values: dice },
    riders: [
      {
        label: "Divine Strike",
        dice: { kind: "scaling" },
        ...(damageType ? { damage_type: damageType } : {}),
        applies_to: "weapon",
        once_per_turn: true,
      },
    ],
  };
}

export const CLERIC_FEATURES: FeatureCatalogue = {
  // Blood Domain
  "tdcs_blood-domain_channel-divinity-blood-puppet": channelDivinity({
    effect: {
      kind: "save",
      save: { ability: "con", dc_ability: "spell", success: "none" },
    },
  }),
  "tdcs_blood-domain_channel-divinity-crimson-bond": channelDivinity({
    actions: [
      {
        name: "Connect to the bonded creature's senses",
        activation: "action",
        effect: {
          kind: "save",
          save: { ability: "con", dc_ability: "spell", success: "none" },
        },
      },
    ],
  }),
  "tdcs_blood-domain_sanguine-recall": {
    activation: "action",
    uses: usesOnce("blood_domain_sanguine_recall", "Sanguine Recall"),
  },
  "tdcs_blood-domain_vascular-corruption-aura": {
    activation: "action",
    uses: usesOnce(
      "blood_domain_vascular_corruption_aura",
      "Vascular Corruption Aura",
    ),
    toggle: {
      key: "vascular_corruption_aura",
      label: "Vascular Corruption Aura",
      spends: { key: "blood_domain_vascular_corruption_aura", amount: 1 },
      ends_on: "short_rest",
    },
    effect: {
      kind: "damage",
      dice: { "17": "2d6" },
      damage_type: "necrotic",
      area: "30-ft aura",
    },
  },

  // Demise Domain
  "open5e_demise-domain_channel-divinity-killing-touch": {
    activation: "special",
    spends: CHANNEL_DIVINITY,
    effect: {
      kind: "damage",
      dice: { "2": "5" },
      damage_type: "necrotic",
      add: [{ kind: "class_level" }, { kind: "class_level" }],
    },
  },
  "open5e_demise-domain_divine-strike": divineStrike("1d8", "necrotic"),

  // Hunt Domain
  "toh_hunt-domain_blessing-of-the-hunter": {
    activation: "action",
    grants: { skills: ["survival"] },
  },
  "toh_hunt-domain_channel-divinity-heart-strike": {
    activation: "special",
    riders: [
      {
        label: "Heart Strike",
        dice: { kind: "fixed", expression: "5" },
        applies_to: "weapon",
        once_per_turn: false,
        cost: { kind: "uses", ...CHANNEL_DIVINITY },
      },
    ],
  },
  "toh_hunt-domain_pack-hunter": { activation: "reaction" },
  "toh_hunt-domain_divine-strike": divineStrike("1d8"),
  "toh_hunt-domain_deadly-stalker": {
    activation: "action",
    uses: usesOnce("hunt_domain_deadly_stalker", "Deadly Stalker", "short"),
  },

  // Mercy Domain
  "toh_mercy-domain_bonus-proficiencies": {
    grants: { skills: ["medicine"], tools: ["Poisoner's Kit"] },
  },
  "toh_mercy-domain_channel-divinity-involuntary-aid": channelDivinity({
    effect: {
      kind: "save",
      save: { ability: "wis", dc_ability: "spell", success: "half" },
      add: [
        { kind: "class_level" },
        { kind: "class_level" },
        { kind: "class_level" },
      ],
    },
  }),
  "toh_mercy-domain_bolster-the-living": { activation: "reaction" },
  "toh_mercy-domain_divine-strike-of-mercy": divineStrike("1d6"),

  // Mischief Domain
  "open5e_mischief-domain_spreader-of-mischief": { activation: "action" },
  "open5e_mischief-domain_channel-divinity-double-trouble": {
    activation: "action",
    toggle: {
      key: "double_trouble",
      label: "Double Trouble",
      spends: CHANNEL_DIVINITY,
      ends_on: "short_rest",
    },
  },
  "open5e_mischief-domain_channel-divinity-walk-unseen": channelDivinity(),
  "open5e_mischief-domain_divine-strike": divineStrike("1d8", "poison"),

  // Portal Domain
  "toh_portal-domain_bonus-proficiencies": {
    grants: { skills: ["arcana"] },
    choices: [
      {
        key: "portal_domain_tool",
        label: "Portal Domain Tool Proficiency",
        pick: {
          kind: "custom",
          options: ["Cartographer's Tools", "Navigator's Tools"],
        },
        count: { kind: "per_grant", amount: 1 },
        replace_on_level_up: false,
      },
    ],
  },
  "toh_portal-domain_portal-bond": {
    activation: "action",
    uses: usesOnce("portal_domain_portal_bond", "Portal Bond"),
  },
  "toh_portal-domain_channel-divinity-dimensional-shift": channelDivinity(),
  "toh_portal-domain_portal-touch": {
    activation: "bonus_action",
    uses: usesProficiency("portal_domain_portal_touch", "Portal Touch"),
  },
  "toh_portal-domain_transpositional-divine-strike": divineStrike("1d8"),
  "toh_portal-domain_portal-mastery": {
    activation: "reaction",
    uses: usesOnce("portal_domain_portal_mastery", "Portal Mastery"),
  },

  // Serpent Domain
  "toh_serpent-domain_envenomed": {
    activation: "bonus_action",
    grants: { skills: ["deception"], tools: ["Poisoner's Kit"] },
  },
  "toh_serpent-domain_channel-divinity-serpent-stealth": channelDivinity(),
  "toh_serpent-domain_divine-strike": divineStrike("1d8", "poison"),
  "toh_serpent-domain_transformative-molt": {
    activation: "special",
    uses: usesOnce("serpent_domain_transformative_molt", "Transformative Molt"),
    actions: [
      {
        name: "End the transformation",
        activation: "reaction",
        effect: {
          kind: "heal",
          add: [
            { kind: "class_level" },
            { kind: "class_level" },
            { kind: "class_level" },
          ],
        },
      },
    ],
  },

  // Shadow Domain
  "toh_shadow-domain_cover-of-night": {
    grants: { skills: ["stealth"] },
    actions: [{ name: "Hide", activation: "bonus_action" }],
  },
  "toh_shadow-domain_channel-divinity-shadow-grasp": channelDivinity({
    effect: {
      kind: "save",
      save: { ability: "str", dc_ability: "spell", success: "none" },
    },
  }),
  "toh_shadow-domain_potent-spellcasting": {
    riders: [
      {
        label: "Potent Spellcasting",
        dice: { kind: "flat", add: [{ kind: "ability", ability: "wis" }] },
        applies_to: "spell",
        once_per_turn: false,
      },
    ],
  },
  "toh_shadow-domain_fade-to-black": {
    activation: "bonus_action",
    uses: usesProficiency("shadow_domain_fade_to_black", "Fade to Black"),
  },

  // Storm Domain
  "open5e_storm-domain_tempests-rebuke": {
    activation: "reaction",
    uses: usesWisdom("storm_domain_tempests_rebuke", "Tempest's Rebuke"),
    effect: {
      kind: "save",
      save: { ability: "dex", dc_ability: "spell", success: "half" },
      dice: { "1": "2d8" },
    },
  },
  "open5e_storm-domain_channel-divinity-full-fury": {
    activation: "special",
    spends: CHANNEL_DIVINITY,
  },
  "open5e_storm-domain_divine-strike": divineStrike("1d8", "thunder"),

  // Vermin Domain
  "toh_vermin-domain_the-unseen": {
    grants: { skills: ["stealth", "survival"] },
  },
  "toh_vermin-domain_channel-divinity-swarm-step": {
    activation: "bonus_action",
    spends: CHANNEL_DIVINITY,
  },
  "toh_vermin-domain_legion-of-bites": {
    activation: "action",
    uses: usesWisdom("vermin_domain_legion_of_bites", "Legion of Bites"),
    effect: {
      kind: "save",
      save: { ability: "con", dc_ability: "spell", success: "none" },
    },
  },
  "toh_vermin-domain_divine-strike": divineStrike("1d8", "poison"),

  // Wind Domain
  "toh_wind-domain_winds-chosen": { grants: { skills: ["nature"] } },
  "toh_wind-domain_channel-divinity-grasp-not-the-wind": {
    activation: "special",
    spends: CHANNEL_DIVINITY,
  },
  "toh_wind-domain_stormshield": {
    activation: "reaction",
    uses: usesWisdom("wind_domain_stormshield", "Stormshield"),
  },
  "toh_wind-domain_divine-strike": divineStrike("1d8", "thunder"),
  "toh_wind-domain_dire-tempest": {
    activation: "action",
    uses: usesOnce("wind_domain_dire_tempest", "Dire Tempest"),
    effect: {
      kind: "save",
      save: { ability: "str", dc_ability: "spell", success: "half" },
      dice: { "17": "8d6" },
      damage_type: "bludgeoning",
      area: "20-ft radius",
    },
  },
};
