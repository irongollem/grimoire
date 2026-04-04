/**
 * Trap CR Advisor
 *
 * Estimates an appropriate Challenge Rating based on D&D 5e trap design guidelines.
 * Returns a suggested CR range and the reasoning behind it.
 *
 * Reference: D&D DMG "Dungeon Hazards" + monster CR design guidelines.
 */

import { parseDiceAvg } from "./dice";
export { parseDiceAvg };

// ── Inputs ────────────────────────────────────────────────────────────────────

export type TrapEffectCategory = "damage" | "condition" | "terrain" | "alarm" | "death";

export type TrapTargeting =
  | "single"     // One creature
  | "area_small" // Up to 3 creatures (10–15 ft, small corridor)
  | "area_large"; // 4+ creatures (entire room, 20+ ft radius)

export type TrapDcTier =
  | "low"      // DC ≤ 12 — easily spotted/avoided
  | "moderate" // DC 13–16 — standard difficulty
  | "high"     // DC 17–20 — difficult to avoid
  | "extreme"; // DC 21+ — nearly unavoidable

export type TrapSecondaryEffect =
  | "none"
  | "minor_condition"   // poisoned, frightened, minor debuff
  | "major_condition"   // restrained, incapacitated
  | "barrier"           // blocks movement, splits party, fills corridor
  | "ongoing_damage";   // burning, acid pool, recurring damage

export interface TrapAdvisorInputs {
  effectCategory: TrapEffectCategory;
  damageDice: string;
  targeting: TrapTargeting;
  dcTier: TrapDcTier;
  resetType: "None" | "Manual" | "Automatic";
  secondaryEffect: TrapSecondaryEffect;
  isInstantDeath: boolean;
  trapHp: number | null;
  trapAc: number | null;
}

export interface TrapAdvisorResult {
  suggestedCr: string;
  suggestedMin: string;
  suggestedMax: string;
  factors: string[];
  score: number;
}

// ── Score → CR mapping ────────────────────────────────────────────────────────

const CR_FROM_SCORE = [
  "0", "1/8", "1/4", "1/2",
  "1", "2", "3", "4", "5", "6", "7", "8", "9", "10",
  "11", "12", "13", "14", "15",
];

function crAtScore(score: number): string {
  const idx = Math.max(0, Math.min(CR_FROM_SCORE.length - 1, Math.round(score)));
  return CR_FROM_SCORE[idx] ?? "0";
}

// ── Damage → base score ───────────────────────────────────────────────────────
// Single-target instantaneous burst benchmarks:
// CR 0 (score 0): 0–7 avg  |  CR 1/8 (1): 8–13  |  CR 1/4 (2): 14–20
// CR 1/2 (3): 21–28  |  CR 1 (4): 29–40  |  CR 2 (5): 41–56
// CR 3 (6): 57–72    |  CR 4 (7): 73–92   |  CR 5 (8): 93–112

const DAMAGE_BREAKPOINTS: Array<{ minAvg: number; score: number }> = [
  { minAvg: 0,   score: 0 },
  { minAvg: 8,   score: 1 },
  { minAvg: 14,  score: 2 },
  { minAvg: 21,  score: 3 },
  { minAvg: 29,  score: 4 },
  { minAvg: 41,  score: 5 },
  { minAvg: 57,  score: 6 },
  { minAvg: 73,  score: 7 },
  { minAvg: 93,  score: 8 },
  { minAvg: 113, score: 9 },
  { minAvg: 133, score: 10 },
  { minAvg: 155, score: 11 },
  { minAvg: 180, score: 12 },
];

function damageToScore(avg: number): number {
  let score = 0;
  for (const bp of DAMAGE_BREAKPOINTS) {
    if (avg >= bp.minAvg) score = bp.score;
  }
  return score;
}

// ── Main advisor ──────────────────────────────────────────────────────────────

export function adviseCr(inputs: TrapAdvisorInputs): TrapAdvisorResult {
  const factors: string[] = [];
  let score = 0;

  const avg = parseDiceAvg(inputs.damageDice);

  // ── Effect category ───────────────────────────────────────────────────────
  if (inputs.effectCategory === "damage") {
    const baseScore = damageToScore(avg);
    score = baseScore;
    if (avg > 0) {
      factors.push(`~${Math.round(avg)} avg damage → base score ${baseScore} (CR ${crAtScore(baseScore)})`);
    } else {
      factors.push("No damage dice set — defaulting to CR 0 base");
    }
  } else if (inputs.effectCategory === "condition") {
    score = 2;
    factors.push("Condition effect (restrained, poisoned, frightened…) → base score 2 (CR 1/4)");
  } else if (inputs.effectCategory === "terrain") {
    score = 3;
    factors.push("Terrain control (pit, collapse, flood, wall) → base score 3 (CR 1/2)");
  } else if (inputs.effectCategory === "alarm") {
    score = 0;
    factors.push("Alarm only — no direct harm → CR 0 base");
  } else if (inputs.effectCategory === "death") {
    score = 8;
    factors.push("Death or incapacitation effect → base score 8 (CR 5)");
  }

  // ── Targeting ────────────────────────────────────────────────────────────
  if (inputs.targeting === "area_small") {
    score += 1.5;
    factors.push("Small area effect (up to 3 targets) +1½ CR");
  } else if (inputs.targeting === "area_large") {
    score += 3;
    factors.push("Large area effect (4+ targets, entire room) +3 CR");
  }

  // ── DC tier ──────────────────────────────────────────────────────────────
  switch (inputs.dcTier) {
    case "low":
      score -= 1;
      factors.push("Low DC (≤12) — easy to spot or dodge −1 CR");
      break;
    case "moderate":
      factors.push("Moderate DC (13–16) — standard difficulty, no adjustment");
      break;
    case "high":
      score += 0.5;
      factors.push("High DC (17–20) — hard to avoid +½ CR");
      break;
    case "extreme":
      score += 1.5;
      factors.push("Extreme DC (21+) — nearly unavoidable +1½ CR");
      break;
  }

  // ── Reset type ───────────────────────────────────────────────────────────
  if (inputs.resetType === "Manual") {
    score += 0.5;
    factors.push("Manual reset — can be re-armed by enemies +½ CR");
  } else if (inputs.resetType === "Automatic") {
    score += 2;
    factors.push("Automatic reset — triggers repeatedly, ongoing hazard +2 CR");
  }

  // ── Durability (HP / AC) ──────────────────────────────────────────────────
  const hp = inputs.trapHp;
  if (hp !== null && hp > 0) {
    if (hp <= 10) {
      score -= 0.5;
      factors.push(`Low HP (${hp}) — easily smashed −½ CR`);
    } else if (hp <= 30) {
      // baseline
    } else if (hp <= 60) {
      score += 0.5;
      factors.push(`High HP (${hp}) — difficult to destroy +½ CR`);
    } else {
      score += 1;
      factors.push(`Very high HP (${hp}) — extremely hard to destroy +1 CR`);
    }
  }
  const ac = inputs.trapAc;
  if (ac !== null && ac >= 18) {
    score += 0.5;
    factors.push(`High AC (${ac}) — hard to damage physically +½ CR`);
  }

  // ── Secondary effect ─────────────────────────────────────────────────────
  const SECONDARY_SCORES: Record<TrapSecondaryEffect, number> = {
    none:            0,
    minor_condition: 0.5,
    major_condition: 1,
    ongoing_damage:  0.5,
    barrier:         1.5,
  };
  const SECONDARY_LABELS: Record<TrapSecondaryEffect, string> = {
    none:            "",
    minor_condition: "Minor condition (poisoned, frightened) +½ CR",
    major_condition: "Major condition (restrained, incapacitated) +1 CR",
    ongoing_damage:  "Ongoing damage (burning, acid pool) +½ CR",
    barrier:         "Barrier / separation (blocks corridor, splits party) +1½ CR",
  };
  if (inputs.secondaryEffect !== "none") {
    score += SECONDARY_SCORES[inputs.secondaryEffect];
    factors.push(SECONDARY_LABELS[inputs.secondaryEffect]);
  }

  // ── Instant death ────────────────────────────────────────────────────────
  if (inputs.isInstantDeath) {
    score += 2;
    factors.push("Save-or-die / instant death mechanic +2 CR");
  }

  const finalScore = Math.max(0, score);
  const minScore = Math.max(0, finalScore - 1);
  const maxScore = finalScore + 1;

  if (factors.length === 0) {
    factors.push("No specific effects selected — cannot estimate");
  }

  return {
    suggestedCr: crAtScore(finalScore),
    suggestedMin: crAtScore(minScore),
    suggestedMax: crAtScore(maxScore),
    factors,
    score: finalScore,
  };
}

// ── CR benchmark reference table ─────────────────────────────────────────────

export const CR_TRAP_BENCHMARKS: Array<{
  cr: string;
  label: string;
  damage: string;
  dc: string;
  examples: string;
}> = [
  { cr: "0",   label: "Trivial Setback",   damage: "0–7",    dc: "≤10",  examples: "Noisemaker, small falling object" },
  { cr: "1/8", label: "Minor Setback",     damage: "8–13",   dc: "10–12", examples: "Dart trap, 5 ft pit" },
  { cr: "1/4", label: "Moderate Setback",  damage: "14–20",  dc: "12–14", examples: "Crossbow trap, simple snare" },
  { cr: "1/2", label: "Dangerous Trap",    damage: "21–28",  dc: "14–15", examples: "Spiked pit, fire jet (single)" },
  { cr: "1",   label: "Serious Trap",      damage: "29–40",  dc: "15–16", examples: "Poison needle, portcullis drop" },
  { cr: "2",   label: "Deadly Trap",       damage: "41–56",  dc: "16–17", examples: "Rolling boulder, acid spray" },
  { cr: "3",   label: "Lethal Trap",       damage: "57–72",  dc: "17–18", examples: "Blade barrier trigger, fire room" },
  { cr: "4",   label: "Catastrophic Trap", damage: "73–92",  dc: "18–19", examples: "Collapsing floor, death gas chamber" },
  { cr: "5",   label: "Legendary Hazard",  damage: "93–112", dc: "20+",   examples: "Prismatic ward, magical death ray" },
];
