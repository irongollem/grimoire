// weaponAttack.ts — pure weapon-attack math extracted from PlayerCombatTab.vue.
// Used by PlayerCombatTab.vue (live, player-facing combat rolls) and
// sheetData.ts (illustrated character-sheet PDF export) so both agree on the
// same numbers. No Vue dependency — plain data in, plain data out.
//
// Behavior is preserved EXACTLY from the original inline implementation;
// this is a pure extraction, not a redesign.

import { parseExpression } from "@/lib/dice";
import type { DamageRoll, ParsedExpression } from "@/lib/dice";

/** Minimal shape of an `Item` this module needs — avoids coupling to the full Item type. */
export interface WeaponLike {
  properties: string[];
  damage_rolls: DamageRoll[] | null;
}

export interface WeaponAttackScores {
  str: number;
  dex: number;
  proficiencyBonus: number;
}

export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function signedNum(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

/**
 * Ability modifier used for a weapon's attack/damage roll.
 * - `item === null` (equipped custom item with no vault stats — treated the
 *   same as an improvised weapon): better of STR/DEX.
 * - `ammunition` property: DEX.
 * - `finesse` property: better of STR/DEX.
 * - Otherwise: STR.
 */
export function weaponAbilityMod(item: WeaponLike | null, scores: Pick<WeaponAttackScores, "str" | "dex">): number {
  const strMod = abilityMod(scores.str);
  const dexMod = abilityMod(scores.dex);
  // Custom weapon (no vault stats): use the better of STR/DEX, like an improvised weapon.
  if (!item) return Math.max(strMod, dexMod);
  const itemProps = item.properties ?? [];
  if (itemProps.includes("ammunition")) return dexMod;
  if (itemProps.includes("finesse")) return dexMod > strMod ? dexMod : strMod;
  return strMod;
}

/** Attack roll modifier: weapon ability mod + proficiency bonus (equipped weapons are assumed proficient). */
export function weaponAttackMod(item: WeaponLike | null, scores: WeaponAttackScores): number {
  return weaponAbilityMod(item, scores) + scores.proficiencyBonus;
}

/**
 * Display string for a weapon's damage expression, e.g. "1d8+2". A weapon
 * with no vault stats (`item === null`) is treated as improvised: base "1d4".
 */
export function weaponDamageExpr(item: WeaponLike | null, scores: Pick<WeaponAttackScores, "str" | "dex">): string {
  const raw = item?.damage_rolls?.[0]?.dice ?? "1d4"; // custom weapon → improvised 1d4
  const abilMod = weaponAbilityMod(item, scores);
  if (abilMod === 0) return raw;
  const parsed = parseExpression(raw);
  if (!parsed) return raw;
  const totalMod = parsed.modifier + abilMod;
  const parts: string[] = parsed.terms.map((t) => `${t.count}d${t.sides}`);
  if (totalMod > 0) parts.push(`+${totalMod}`);
  else if (totalMod < 0) parts.push(String(totalMod));
  return parts.join("") || raw;
}

/** Damage type label for a weapon, defaulting to bludgeoning for improvised/custom weapons. */
export function weaponDamageType(item: WeaponLike | null): string {
  return item?.damage_rolls?.[0]?.type ?? "bludgeoning";
}

/**
 * Parsed damage expression used for the live dice roller (counts + modifier
 * separately, rather than the pre-rendered display string). A weapon with no
 * vault stats rolls as an improvised 1d4. Returns `null` when the item has
 * real damage_rolls but its dice string fails to parse — callers should bail
 * out of the roll in that case, matching the original inline behavior.
 */
export function weaponDamageParsedExpression(item: WeaponLike | null): ParsedExpression | null {
  if (!item?.damage_rolls?.length) return { terms: [{ count: 1, sides: 4 }], modifier: 0 };
  return parseExpression(item.damage_rolls[0].dice);
}

// ── Unarmed / improvised — always-available combat options, not tied to an equipped item ──

/** Unarmed strike attack modifier: STR + proficiency bonus (always proficient). */
export function unarmedAttackMod(str: number, proficiencyBonus: number): number {
  return abilityMod(str) + proficiencyBonus;
}

/** Unarmed strike damage: 1 + STR mod, minimum 1. */
export function unarmedDamage(str: number): number {
  return Math.max(1, 1 + abilityMod(str));
}

/**
 * Improvised weapon attack modifier: better of STR/DEX, with NO proficiency
 * bonus (unlike an equipped custom weapon via `weaponAttackMod(null, …)`,
 * which is assumed proficient because it's equipped in a weapon-hand slot).
 */
export function improvisedAttackMod(str: number, dex: number): number {
  return weaponAbilityMod(null, { str, dex });
}
