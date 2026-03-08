/**
 * Spell Level Advisor
 *
 * Estimates an appropriate spell level based on the 2024 DMG spell design
 * guidelines. Returns a suggested level range and the reasoning behind it.
 *
 * Reference: D&D 2024 Dungeon Master's Guide, "Crafting Spells" section.
 */

// ── Inputs ────────────────────────────────────────────────────────────────────

export type EffectType = 'damage' | 'healing' | 'control' | 'buff' | 'utility'

export type AoeType =
  | 'single'           // one creature
  | 'small'            // cone ≤15 ft, line ≤30 ft, 5-10 ft radius
  | 'medium'           // 20 ft radius, 60 ft line
  | 'large'            // 30+ ft radius, affects many targets

export type SaveType =
  | 'automatic'        // no save, no attack — always works (e.g. Magic Missile)
  | 'attack_roll'      // to-hit roll required (can miss)
  | 'save_negates'     // save completely negates the effect
  | 'save_for_half'    // save halves damage (standard for big AoE)

export type DurationTier =
  | 'instantaneous'
  | 'conc_1min'        // Concentration, up to 1 minute
  | 'conc_10min'       // Concentration, up to 10 minutes
  | 'conc_1hour'       // Concentration, up to 1 hour
  | 'sustained_1min'   // 1 minute, no concentration
  | 'sustained_long'   // 8+ hours, no concentration

export interface AdvisorInputs {
  effectType: EffectType
  damageDice: string       // e.g. "3d6", "8d8+20" — for damage/healing spells
  aoeType: AoeType
  saveType: SaveType
  durationTier: DurationTier
  hasSecondaryEffect: boolean   // knockback, condition, rider effect
  requiresConcentration: boolean
  isRitual: boolean
}

export interface AdvisorResult {
  suggestedMin: number
  suggestedMax: number
  factors: string[]            // human-readable explanation per factor
  score: number                // raw computed score for debugging
}

// ── Dice parser ───────────────────────────────────────────────────────────────
export { parseDiceAvg } from './dice'
import { parseDiceAvg } from './dice'

// ── Damage → base level mapping ───────────────────────────────────────────────
// Based on the 2024 DMG "Typical Damage by Level" for single-target attack/save spells.
// Cantrip (0): scales with char level, baseline ~1d10 (avg 5.5) at L1 char
// These are the *instantaneous, single-target, save-for-half* benchmarks.

const DAMAGE_BREAKPOINTS: Array<{ minAvg: number; level: number }> = [
  { minAvg: 0,   level: 0 },  // cantrip
  { minAvg: 8,   level: 1 },  // 2d6 (7) → 1st
  { minAvg: 12,  level: 2 },  // 4d6 (14) → 2nd
  { minAvg: 18,  level: 3 },  // 5d8 (22) → 3rd; Fireball is 8d6=28 but AoE
  { minAvg: 28,  level: 4 },  // 8d6 (28) single
  { minAvg: 36,  level: 5 },  // 8d8 (36) → 5th; Cone of Cold
  { minAvg: 45,  level: 6 },  // 10d8 (45)
  { minAvg: 52,  level: 7 },  // 13d6 (45) / Finger of Death 7d8+30=61
  { minAvg: 60,  level: 8 },  // 14d6 (49) / 10d10 (55)
  { minAvg: 70,  level: 9 },  // Meteor Swarm ~140 total across targets
]

function avgToBaseLevel(avg: number): number {
  let level = 0
  for (const bp of DAMAGE_BREAKPOINTS) {
    if (avg >= bp.minAvg) level = bp.level
  }
  return level
}

// ── Healing → base level mapping ─────────────────────────────────────────────
// Heal Wounds: 1d8+mod ≈ 9 avg → 1st level
// Each level roughly adds 1d8 (4.5)

function healAvgToBaseLevel(avg: number): number {
  if (avg <= 0)   return 0
  if (avg <= 10)  return 1
  if (avg <= 15)  return 2
  if (avg <= 20)  return 3
  if (avg <= 27)  return 4
  if (avg <= 35)  return 5
  if (avg <= 43)  return 6
  if (avg <= 51)  return 7
  if (avg <= 60)  return 8
  return 9
}

// ── Main advisor ──────────────────────────────────────────────────────────────

export function adviseLevelRange(inputs: AdvisorInputs): AdvisorResult {
  const factors: string[] = []
  let score = 0

  const avg = parseDiceAvg(inputs.damageDice)

  if (inputs.effectType === 'damage') {
    const baseLevel = avgToBaseLevel(avg)
    score = baseLevel
    if (avg > 0) {
      factors.push(`~${Math.round(avg)} avg damage → base level ${baseLevel}`)
    }
  } else if (inputs.effectType === 'healing') {
    const baseLevel = healAvgToBaseLevel(avg)
    score = baseLevel
    if (avg > 0) {
      factors.push(`~${Math.round(avg)} avg healing → base level ${baseLevel}`)
    }
  } else if (inputs.effectType === 'control') {
    score = 2
    factors.push('Control effect → starts at level 2 baseline')
  } else if (inputs.effectType === 'buff') {
    score = 1
    factors.push('Buff effect → starts at level 1 baseline')
  } else {
    score = 0
    factors.push('Utility effect → starts at cantrip/level 1 baseline')
  }

  // ── AoE adjustment ────────────────────────────────────────────────────────
  // AoE spells are more powerful at the same damage level because they hit multiple targets.
  // A 30-ft radius Fireball dealing 8d6 is a *3rd-level* spell — same avg as a 4th-level
  // single-target spell. We reduce score to account for the AoE being a balancing factor
  // (requires positioning, friendly fire, etc.) but still add a bonus.
  if (inputs.aoeType === 'small') {
    score += 0.5
    factors.push('Small AoE (cone/line ≤15 ft) +½ level')
  } else if (inputs.aoeType === 'medium') {
    score += 1
    factors.push('Medium AoE (20 ft radius / 60 ft line) +1 level')
  } else if (inputs.aoeType === 'large') {
    score += 2
    factors.push('Large AoE (30 ft+ radius, many targets) +2 levels')
  }

  // ── Save / reliability adjustment ────────────────────────────────────────
  if (inputs.saveType === 'automatic') {
    score += 1
    factors.push('No save or attack roll — guaranteed effect +1 level')
  } else if (inputs.saveType === 'save_negates') {
    score += 0.5
    factors.push('Save negates — all-or-nothing +½ level')
  } else if (inputs.saveType === 'attack_roll') {
    score -= 0.25
    factors.push('Attack roll required — can miss, slight reduction')
  }
  // save_for_half: no adjustment (the standard benchmark)

  // ── Duration adjustment ───────────────────────────────────────────────────
  if (inputs.requiresConcentration) {
    score -= 0.5
    factors.push('Requires Concentration — resource cost -½ level')
  }

  if (inputs.durationTier === 'conc_1min') {
    // Already handled by concentration flag above
  } else if (inputs.durationTier === 'conc_10min') {
    score += 0.5
    factors.push('Concentration up to 10 min — longer battlefield control +½ level')
  } else if (inputs.durationTier === 'conc_1hour') {
    score += 1
    factors.push('Concentration up to 1 hour — exploration utility +1 level')
  } else if (inputs.durationTier === 'sustained_1min') {
    score += 1
    factors.push('1 minute non-concentration (strong) +1 level')
  } else if (inputs.durationTier === 'sustained_long') {
    score += 2
    factors.push('8+ hours non-concentration — long-lasting effect +2 levels')
  }

  // ── Secondary effects ─────────────────────────────────────────────────────
  if (inputs.hasSecondaryEffect) {
    score += 1
    factors.push('Secondary condition or rider effect +1 level')
  }

  // ── Ritual ────────────────────────────────────────────────────────────────
  if (inputs.isRitual) {
    score -= 0.5
    factors.push('Can be cast as ritual — extended cast time offsets power')
  }

  // ── Clamp and round to level range ────────────────────────────────────────
  const finalLevel = Math.max(0, Math.min(9, Math.round(score)))
  const min = Math.max(0, finalLevel - 1)
  const max = Math.min(9, finalLevel + 1)

  if (factors.length === 0) {
    factors.push('No specific effects selected — cannot estimate')
  }

  return { suggestedMin: min, suggestedMax: max, factors, score }
}

// ── Cantrip scaling note ──────────────────────────────────────────────────────
export const CANTRIP_SCALING_NOTE =
  'Cantrips scale with character level: damage increases at 5th (×2), 11th (×3), and 17th (×4).'

// ── Level-based damage benchmark table (for display) ─────────────────────────
export const DAMAGE_BENCHMARKS: Array<{
  level: number
  label: string
  singleTarget: string
  aoeSmall: string
  aoeLarge: string
}> = [
  { level: 0, label: 'Cantrip', singleTarget: '1d10 (scales)', aoeSmall: '1d6', aoeLarge: '—' },
  { level: 1, label: '1st',     singleTarget: '2d10',          aoeSmall: '3d6', aoeLarge: '2d6 (small area)' },
  { level: 2, label: '2nd',     singleTarget: '4d6',           aoeSmall: '3d8', aoeLarge: '3d6' },
  { level: 3, label: '3rd',     singleTarget: '6d6',           aoeSmall: '5d8', aoeLarge: '8d6 (Fireball)' },
  { level: 4, label: '4th',     singleTarget: '8d6',           aoeSmall: '6d8', aoeLarge: '5d8/turn' },
  { level: 5, label: '5th',     singleTarget: '8d8',           aoeSmall: '8d8', aoeLarge: '8d8 (Cone of Cold)' },
  { level: 6, label: '6th',     singleTarget: '10d8',          aoeSmall: '10d6', aoeLarge: '10d6 chain' },
  { level: 7, label: '7th',     singleTarget: '13d6',          aoeSmall: '12d6', aoeLarge: '12d6 large area' },
  { level: 8, label: '8th',     singleTarget: '14d6',          aoeSmall: '12d8', aoeLarge: '10d8/turn' },
  { level: 9, label: '9th',     singleTarget: '20d6+20',       aoeSmall: '20d6', aoeLarge: '20d6 (Meteor Swarm)' },
]

export const HEALING_BENCHMARKS: Array<{ level: number; label: string; single: string; mass?: string }> = [
  { level: 1, label: '1st', single: '1d8 + mod', mass: '—' },
  { level: 2, label: '2nd', single: '2d8 + mod', mass: '—' },
  { level: 3, label: '3rd', single: '3d8 + mod', mass: '1d4 + mod each (Mass Heal)' },
  { level: 4, label: '4th', single: '4d8 + mod' },
  { level: 5, label: '5th', single: '5d8 + mod', mass: '3d8 + mod each' },
  { level: 6, label: '6th', single: '6d8 + mod' },
  { level: 7, label: '7th', single: '7d8 + mod' },
  { level: 8, label: '8th', single: '8d8 + mod' },
  { level: 9, label: '9th', single: 'Full HP restore', mass: 'Full HP restore (group)' },
]
