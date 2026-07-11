import type { Monster } from "@/types/monster.types";
import { parseCr } from "@/lib/utils";

// Shared wild shape eligibility rules. These live here (not inlined per-view) so the
// DM encounter runner, the player character sheet and the player bestiary all agree
// on which beasts a druid may assume — see combat-encounters.md.

/**
 * Maximum wild shape CR a druid of the given level can assume.
 * Circle of the Moon uses the faster level/3 progression; other circles level/2.
 */
export function wildshapeMaxCr(level: number, isCircleOfMoon: boolean): number {
  if (isCircleOfMoon) return Math.max(1, Math.floor(level / 3));
  return Math.max(0.125, Math.floor(level / 2) * 0.5);
}

/** Human-readable CR label, rendering fractional CRs as fractions. */
export function wildshapeCrDisplay(cr: number): string {
  if (cr === 0.125) return "1/8";
  if (cr === 0.25) return "1/4";
  if (cr === 0.5) return "1/2";
  return String(cr);
}

/**
 * Whether a monster is a legal wild shape form for a druid of the given level:
 * a beast within the CR cap; below level 8 a druid cannot take forms with a fly or
 * swim speed.
 */
export function isEligibleWildshapeForm(monster: Monster, level: number, maxCr: number): boolean {
  if ((monster.monster_type ?? "").toLowerCase() !== "beast") return false;
  if (parseCr(monster.stat_block?.challenge_rating) > maxCr) return false;
  if (level < 8) {
    const speed = (monster.stat_block?.speed ?? "").toLowerCase();
    if (speed.includes("fly") || speed.includes("swim")) return false;
  }
  return true;
}
