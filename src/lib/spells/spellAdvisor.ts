/**
 * Spell Level Advisor
 *
 * Estimates an appropriate spell level based on the 2024 DMG spell design
 * guidelines. Returns a suggested level range and the reasoning behind it.
 *
 * Reference: D&D 2024 Dungeon Master's Guide, "Crafting Spells" section.
 */

// ── Inputs ────────────────────────────────────────────────────────────────────

export type EffectType = "damage" | "healing" | "control" | "buff" | "utility";

/**
 * Intensity of a non-damage effect.
 * Maps to a base score bonus so the advisor can estimate level even without dice.
 *
 * control:
 *   weak     — minor debuff, disadvantage on one thing       (e.g. Bane, Vicious Mockery)
 *   moderate — restrained, frightened, halved speed          (e.g. Hold Person, Web, Slow)
 *   major    — incapacitated, stunned, banished              (e.g. Hold Monster, Banishment)
 *   extreme  — dominated, paralysed, petrified, instant KO   (e.g. Dominate Person, Power Word Stun)
 *
 * buff:
 *   weak     — minor bonus, +d4, guidance-level             (e.g. Guidance, Resistance)
 *   moderate — advantage, resistance, significant stat buff  (e.g. Bless, Shield, Enhance Ability)
 *   major    — extra attack, free movement, powerful AC      (e.g. Haste, Fly, Greater Invisibility)
 *   extreme  — extra action, immunity, raise dead            (e.g. Time Stop, True Resurrection)
 *
 * utility:
 *   weak     — minor convenience, limited info              (e.g. Prestidigitation, Detect Magic)
 *   moderate — solves a whole problem category              (e.g. Comprehend Languages, Darkvision)
 *   major    — major exploration/social advantage           (e.g. Teleportation Circle, Legend Lore)
 *   extreme  — world-altering, near-infinite range/scope    (e.g. Wish, Gate)
 */
export type EffectIntensity = "weak" | "moderate" | "major" | "extreme";

/** @deprecated Use TargetingMode instead */
export type AoeType = "single" | "small" | "medium" | "large";

export type TargetingMode =
  | "self"       // self only (no targeting roll)
  | "single"     // one creature / object
  | "multi_2"    // up to 2 creatures
  | "multi_3"    // up to 3 creatures
  | "multi_4_5"  // up to 4–5 creatures
  | "aoe_small"  // cone ≤15 ft, line ≤30 ft, 5–10 ft radius
  | "aoe_medium" // 20 ft radius / 60 ft line
  | "aoe_large"; // 30+ ft radius, affects many targets

export type SaveType =
  | "automatic" // no save, no attack — always works (e.g. Magic Missile)
  | "attack_roll" // to-hit roll required (can miss)
  | "save_negates" // save completely negates the effect
  | "save_for_half"; // save halves damage (standard for big AoE)

export type DurationTier =
  | "instantaneous"
  | "conc_1min" // Concentration, up to 1 minute
  | "conc_10min" // Concentration, up to 10 minutes
  | "conc_1hour" // Concentration, up to 1 hour
  | "sustained_1min" // 1 minute, no concentration
  | "sustained_long"; // 8+ hours, no concentration

export interface AdvisorInputs {
  effectType: EffectType;
  effectIntensity: EffectIntensity; // for control / buff / utility — how powerful is the core effect?
  damageDice: string; // e.g. "3d6", "8d8+20" — for damage/healing spells
  targetingMode: TargetingMode;
  saveType: SaveType;
  durationTier: DurationTier;
  hasSecondaryEffect: boolean; // knockback, condition, rider effect
  requiresConcentration: boolean;
  isRitual: boolean;
}

export interface AdvisorResult {
  suggestedMin: number;
  suggestedMax: number;
  factors: string[]; // human-readable explanation per factor
  score: number; // raw computed score for debugging
}

// ── Dice parser ───────────────────────────────────────────────────────────────
export { parseDiceAvg } from "@/lib/dice/dice";
import { parseDiceAvg } from "@/lib/dice/dice";

// ── Damage → base level mapping ───────────────────────────────────────────────
// Based on the 2024 DMG "Typical Damage by Level" for single-target attack/save spells.
// Cantrip (0): scales with char level, baseline ~1d10 (avg 5.5) at L1 char
// These are the *instantaneous, single-target, save-for-half* benchmarks.

const DAMAGE_BREAKPOINTS: Array<{ minAvg: number; level: number }> = [
  { minAvg: 0, level: 0 }, // cantrip
  { minAvg: 8, level: 1 }, // 2d6 (7) → 1st
  { minAvg: 12, level: 2 }, // 4d6 (14) → 2nd
  { minAvg: 18, level: 3 }, // 5d8 (22) → 3rd; Fireball is 8d6=28 but AoE
  { minAvg: 28, level: 4 }, // 8d6 (28) single
  { minAvg: 36, level: 5 }, // 8d8 (36) → 5th; Cone of Cold
  { minAvg: 45, level: 6 }, // 10d8 (45)
  { minAvg: 52, level: 7 }, // 13d6 (45) / Finger of Death 7d8+30=61
  { minAvg: 60, level: 8 }, // 14d6 (49) / 10d10 (55)
  { minAvg: 70, level: 9 }, // Meteor Swarm ~140 total across targets
];

function avgToBaseLevel(avg: number): number {
  let level = 0;
  for (const bp of DAMAGE_BREAKPOINTS) {
    if (avg >= bp.minAvg) level = bp.level;
  }
  return level;
}

// ── Healing → base level mapping ─────────────────────────────────────────────
// Heal Wounds: 1d8+mod ≈ 9 avg → 1st level
// Each level roughly adds 1d8 (4.5)

function healAvgToBaseLevel(avg: number): number {
  if (avg <= 0) return 0;
  if (avg <= 10) return 1;
  if (avg <= 15) return 2;
  if (avg <= 20) return 3;
  if (avg <= 27) return 4;
  if (avg <= 35) return 5;
  if (avg <= 43) return 6;
  if (avg <= 51) return 7;
  if (avg <= 60) return 8;
  return 9;
}

// ── Main advisor ──────────────────────────────────────────────────────────────

export function adviseLevelRange(inputs: AdvisorInputs): AdvisorResult {
  const factors: string[] = [];
  let score = 0;

  const avg = parseDiceAvg(inputs.damageDice);

  if (inputs.effectType === "damage") {
    const baseLevel = avgToBaseLevel(avg);
    score = baseLevel;
    if (avg > 0) {
      factors.push(`~${Math.round(avg)} avg damage → base level ${baseLevel}`);
    }
  } else if (inputs.effectType === "healing") {
    const baseLevel = healAvgToBaseLevel(avg);
    score = baseLevel;
    if (avg > 0) {
      factors.push(`~${Math.round(avg)} avg healing → base level ${baseLevel}`);
    }
  } else if (inputs.effectType === "control") {
    const intensityScores: Record<EffectIntensity, number> = {
      weak: 1,
      moderate: 2,
      major: 4,
      extreme: 6,
    };
    const intensityLabels: Record<EffectIntensity, string> = {
      weak: "Weak control (disadvantage, minor debuff)",
      moderate: "Moderate control (restrained, frightened, slow)",
      major: "Major control (stunned, incapacitated, banished)",
      extreme: "Extreme control (dominated, paralysed, power word)",
    };
    score = intensityScores[inputs.effectIntensity];
    factors.push(`${intensityLabels[inputs.effectIntensity]} → base level ${score}`);
  } else if (inputs.effectType === "buff") {
    const intensityScores: Record<EffectIntensity, number> = {
      weak: 0,
      moderate: 1,
      major: 3,
      extreme: 7,
    };
    const intensityLabels: Record<EffectIntensity, string> = {
      weak: "Weak buff (minor bonus, +d4)",
      moderate: "Moderate buff (advantage, resistance)",
      major: "Major buff (extra attack, flight, haste)",
      extreme: "Extreme buff (extra action, immunity, resurrection)",
    };
    score = intensityScores[inputs.effectIntensity];
    factors.push(`${intensityLabels[inputs.effectIntensity]} → base level ${score}`);
  } else {
    const intensityScores: Record<EffectIntensity, number> = {
      weak: 0,
      moderate: 1,
      major: 3,
      extreme: 8,
    };
    const intensityLabels: Record<EffectIntensity, string> = {
      weak: "Minor utility (convenience, limited info)",
      moderate: "Moderate utility (solves a problem category)",
      major: "Major utility (teleportation, legend lore)",
      extreme: "World-altering utility (Wish, Gate)",
    };
    score = intensityScores[inputs.effectIntensity];
    factors.push(`${intensityLabels[inputs.effectIntensity]} → base level ${score}`);
  }

  // ── Targeting adjustment ──────────────────────────────────────────────────
  // Multi-target and AoE spells are more powerful because they scale with enemy density.
  // AoE also requires positioning and risks friendly fire, so it's slightly discounted
  // vs. pure multi-target at the same count.
  switch (inputs.targetingMode) {
    case "self":
      score -= 0.5;
      factors.push("Self-only — no targeting required -½ level");
      break;
    case "single":
      // baseline, no adjustment
      break;
    case "multi_2":
      score += 0.5;
      factors.push("Up to 2 targets +½ level");
      break;
    case "multi_3":
      score += 1;
      factors.push("Up to 3 targets +1 level");
      break;
    case "multi_4_5":
      score += 1.5;
      factors.push("Up to 4–5 targets +1½ levels");
      break;
    case "aoe_small":
      score += 0.5;
      factors.push("Small AoE (cone/line ≤15 ft) +½ level");
      break;
    case "aoe_medium":
      score += 1;
      factors.push("Medium AoE (20 ft radius / 60 ft line) +1 level");
      break;
    case "aoe_large":
      score += 2;
      factors.push("Large AoE (30 ft+ radius, many targets) +2 levels");
      break;
  }

  // ── Save / reliability adjustment ────────────────────────────────────────
  if (inputs.saveType === "automatic") {
    score += 1;
    factors.push("No save or attack roll — guaranteed effect +1 level");
  } else if (inputs.saveType === "save_negates") {
    score += 0.5;
    factors.push("Save negates — all-or-nothing +½ level");
  } else if (inputs.saveType === "attack_roll") {
    score -= 0.25;
    factors.push("Attack roll required — can miss, slight reduction");
  }
  // save_for_half: no adjustment (the standard benchmark)

  // ── Duration adjustment ───────────────────────────────────────────────────
  if (inputs.requiresConcentration) {
    score -= 0.5;
    factors.push("Requires Concentration — resource cost -½ level");
  }

  if (inputs.durationTier === "conc_1min") {
    // Already handled by concentration flag above
  } else if (inputs.durationTier === "conc_10min") {
    score += 0.5;
    factors.push("Concentration up to 10 min — longer battlefield control +½ level");
  } else if (inputs.durationTier === "conc_1hour") {
    score += 1;
    factors.push("Concentration up to 1 hour — exploration utility +1 level");
  } else if (inputs.durationTier === "sustained_1min") {
    score += 1;
    factors.push("1 minute non-concentration (strong) +1 level");
  } else if (inputs.durationTier === "sustained_long") {
    score += 2;
    factors.push("8+ hours non-concentration — long-lasting effect +2 levels");
  }

  // ── Secondary effects ─────────────────────────────────────────────────────
  if (inputs.hasSecondaryEffect) {
    score += 1;
    factors.push("Secondary condition or rider effect +1 level");
  }

  // ── Ritual ────────────────────────────────────────────────────────────────
  if (inputs.isRitual) {
    score -= 0.5;
    factors.push("Can be cast as ritual — extended cast time offsets power");
  }

  // ── Clamp and round to level range ────────────────────────────────────────
  const finalLevel = Math.max(0, Math.min(9, Math.round(score)));
  const min = Math.max(0, finalLevel - 1);
  const max = Math.min(9, finalLevel + 1);

  if (factors.length === 0) {
    factors.push("No specific effects selected — cannot estimate");
  }

  return { suggestedMin: min, suggestedMax: max, factors, score };
}

// ── Cantrip scaling note ──────────────────────────────────────────────────────
export const CANTRIP_SCALING_NOTE =
  "Cantrips scale with character level: damage increases at 5th (×2), 11th (×3), and 17th (×4).";

// ── Level-based damage benchmark table (for display) ─────────────────────────
export const DAMAGE_BENCHMARKS: Array<{
  level: number;
  label: string;
  singleTarget: string;
  aoeSmall: string;
  aoeLarge: string;
}> = [
  {
    level: 0,
    label: "Cantrip",
    singleTarget: "1d10 (scales)",
    aoeSmall: "1d6",
    aoeLarge: "—",
  },
  {
    level: 1,
    label: "1st",
    singleTarget: "2d10",
    aoeSmall: "3d6",
    aoeLarge: "2d6 (small area)",
  },
  {
    level: 2,
    label: "2nd",
    singleTarget: "4d6",
    aoeSmall: "3d8",
    aoeLarge: "3d6",
  },
  {
    level: 3,
    label: "3rd",
    singleTarget: "6d6",
    aoeSmall: "5d8",
    aoeLarge: "8d6 (Fireball)",
  },
  {
    level: 4,
    label: "4th",
    singleTarget: "8d6",
    aoeSmall: "6d8",
    aoeLarge: "5d8/turn",
  },
  {
    level: 5,
    label: "5th",
    singleTarget: "8d8",
    aoeSmall: "8d8",
    aoeLarge: "8d8 (Cone of Cold)",
  },
  {
    level: 6,
    label: "6th",
    singleTarget: "10d8",
    aoeSmall: "10d6",
    aoeLarge: "10d6 chain",
  },
  {
    level: 7,
    label: "7th",
    singleTarget: "13d6",
    aoeSmall: "12d6",
    aoeLarge: "12d6 large area",
  },
  {
    level: 8,
    label: "8th",
    singleTarget: "14d6",
    aoeSmall: "12d8",
    aoeLarge: "10d8/turn",
  },
  {
    level: 9,
    label: "9th",
    singleTarget: "20d6+20",
    aoeSmall: "20d6",
    aoeLarge: "20d6 (Meteor Swarm)",
  },
];

// ── Reference spells by level (for non-damage advisor display) ────────────────
// Shows 2-3 canonical SRD examples near each level so the user can sanity-check.
export const REFERENCE_SPELLS: Record<
  number,
  { control?: string; buff?: string; utility?: string }
> = {
  0: {
    buff: "Guidance, Resistance",
    utility: "Prestidigitation, Mage Hand, Light",
  },
  1: {
    control: "Bane, Command",
    buff: "Bless, Heroism, Shield",
    utility: "Detect Magic, Comprehend Languages",
  },
  2: {
    control: "Hold Person, Web",
    buff: "Enhance Ability, Blur",
    utility: "Darkvision, Locate Object",
  },
  3: {
    control: "Slow, Hypnotic Pattern",
    buff: "Haste, Protection from Energy",
    utility: "Fly, Clairvoyance, Tongues",
  },
  4: {
    control: "Banishment, Confusion",
    buff: "Freedom of Movement, Greater Invis.",
    utility: "Arcane Eye, Dimension Door",
  },
  5: {
    control: "Hold Monster, Dominate Person",
    buff: "Seeming, Steel Wind Strike",
    utility: "Teleportation Circle, Legend Lore",
  },
  6: {
    control: "Mass Suggestion, Eyebite",
    buff: "Heroes' Feast, True Seeing",
    utility: "Find the Path, Word of Recall",
  },
  7: {
    control: "Power Word Fortify, Symbol",
    buff: "Regenerate, Resurrection",
    utility: "Plane Shift, Teleport",
  },
  8: {
    control: "Dominate Monster, Feeblemind",
    buff: "Mind Blank, Holy Aura",
    utility: "Antipathy / Sympathy",
  },
  9: {
    control: "Power Word Stun, Imprisonment",
    buff: "Power Word Heal, Foresight",
    utility: "Wish, Gate",
  },
};

// ── School design tips ────────────────────────────────────────────────────────
// General design principles used by D&D writers per school.
// These are qualitative — shown in the advisor to guide the homebrew author.
export const SCHOOL_DESIGN_TIPS: Record<string, { title: string; tips: string[] }> = {
  abjuration: {
    title: "Abjuration",
    tips: [
      "Core purpose: protection, prevention, and counterspelling.",
      "Typical mechanics: temporary HP, AC bonuses, damage resistance, negating other spells.",
      "Most abjurations are reactions or short-duration buffs — concentration is common for the bigger ones.",
      "Avoid overlap with the Armor of Agathys / Shield / Counterspell design space without a meaningful twist.",
    ],
  },
  conjuration: {
    title: "Conjuration",
    tips: [
      "Core purpose: bringing creatures or matter to you, or moving yourself elsewhere.",
      "Summon spells: balance the summoned creature's CR roughly equal to spell level - 1.",
      "Teleportation spells are premium utility; keep range limited or add a destination restriction.",
      "Conjured objects/terrain (e.g. Web, Grease) need a clear area size, material property, and removal condition.",
    ],
  },
  divination: {
    title: "Divination",
    tips: [
      "Core purpose: information and foresight — no direct damage.",
      "Value scales with information quality: targeting one creature < targeting an area < campaign-scope knowledge.",
      "Most divinations should be ritual-eligible; they rarely need concentration.",
      "Be careful with scrying effects — unlimited range information is a 5th-level benchmark (Scrying).",
    ],
  },
  enchantment: {
    title: "Enchantment",
    tips: [
      "Core purpose: directly influencing the minds of others.",
      "Most enchantments are Wisdom saves (the mental defense stat).",
      "Charm vs. dominate is the key axis: charm = friendly, dominate = puppet — domination is ~2 levels higher.",
      "The more creatures affected or the less agency they retain, the higher the level should be.",
      "Consider humanoids-only restrictions to keep lower-level spells balanced.",
    ],
  },
  evocation: {
    title: "Evocation",
    tips: [
      "Core purpose: raw elemental energy, usually damage.",
      "Use the damage benchmark table as the primary guide for level.",
      "Saving throw + half damage is the standard for AoE. No-save should cost +1 level.",
      "Elemental type matters for balance: fire/lightning are common and often resisted; psychic/force are rare and rarely resisted.",
      "Cantrips should have a rider effect (push, slow, damage type variety) to stay competitive.",
    ],
  },
  illusion: {
    title: "Illusion",
    tips: [
      "Core purpose: deception — false sensory information.",
      "Illusions that deal no direct harm are generally 1-2 levels lower than equivalent control spells.",
      "Interaction checks (Investigation vs. spell DC) should be part of the spell text.",
      "Silent Image (1st) → Major Image (3rd) → Programmed Illusion (6th) is the canonical complexity ladder.",
      'Illusory damage that is "real" to the target is extremely powerful — treat as full damage spells.',
    ],
  },
  necromancy: {
    title: "Necromancy",
    tips: [
      "Core purpose: life force manipulation — both dealing necrotic damage and raising undead.",
      "Necrotic damage is rarely resisted, so benchmark slightly above equivalent fire damage.",
      "Undead summoning scales with undead CR and quantity — Animate Dead is 3rd because the undead persist.",
      "Life-drain effects (steal HP and give to caster) are powerful; the healing component adds ~1 level.",
      "Resurrection spells are off the normal scale — cost is in material components, not level alone.",
    ],
  },
  transmutation: {
    title: "Transmutation",
    tips: [
      "Core purpose: changing the physical properties of creatures or objects.",
      "Buffs that grant a wholly new capability (flight, water breathing) follow the utility scale, not the buff scale.",
      "Polymorphing a target is Concentration + powerful transformation — a 4th-level benchmark (Polymorph).",
      "Physical stat boosts (+2 STR etc.) are weaker than advantage; keep them at 2nd–3rd level.",
      "Object-only transmutations (heat metal, stone shape) can be lower level as they don't affect action economy.",
    ],
  },
};

export const HEALING_BENCHMARKS: Array<{
  level: number;
  label: string;
  single: string;
  mass?: string;
}> = [
  { level: 1, label: "1st", single: "1d8 + mod", mass: "—" },
  { level: 2, label: "2nd", single: "2d8 + mod", mass: "—" },
  {
    level: 3,
    label: "3rd",
    single: "3d8 + mod",
    mass: "1d4 + mod each (Mass Heal)",
  },
  { level: 4, label: "4th", single: "4d8 + mod" },
  { level: 5, label: "5th", single: "5d8 + mod", mass: "3d8 + mod each" },
  { level: 6, label: "6th", single: "6d8 + mod" },
  { level: 7, label: "7th", single: "7d8 + mod" },
  { level: 8, label: "8th", single: "8d8 + mod" },
  {
    level: 9,
    label: "9th",
    single: "Full HP restore",
    mass: "Full HP restore (group)",
  },
];
