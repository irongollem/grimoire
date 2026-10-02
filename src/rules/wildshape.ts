import type { PlayerVisibleMonster } from "@/types/monster.types";
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

/** What Wild Shape needs to know about a character's druid class. */
export interface DruidProfile {
  isDruid: boolean;
  /** Levels in the Druid CLASS, not the character's total level. 0 if none. */
  druidLevel: number;
  isCircleOfMoon: boolean;
}

/**
 * Derive druid-ness, druid class level and circle from the `character_classes`
 * rows (the source of truth for a multiclass character), falling back to the
 * legacy `party_members` class/subclass/level fields for a character that has
 * no rows.
 *
 * Reading `member.class` and `member.level` directly is the bug this replaces:
 * taking Druid as a second class never rewrites `member.class`, so the druid
 * was not recognised at all, and the CR cap was computed from TOTAL level, so a
 * Fighter 6 / Druid 2 was offered CR 1½ forms instead of ¼. One function, so
 * the sheet, the bestiary and the encounter runner cannot disagree about it.
 */
export function druidProfile(
  member: { class?: string | null; subclass?: string | null; level?: number | null } | null | undefined,
  classRows: readonly { class_name: string; subclass_name: string | null; levels: number }[],
): DruidProfile {
  const druidRow = classRows.find((row) => row.class_name.toLowerCase().includes("druid"));
  const legacyDruid = member?.class?.toLowerCase().includes("druid") ?? false;
  return {
    isDruid: !!druidRow || legacyDruid,
    druidLevel: druidRow?.levels ?? (legacyDruid ? (member?.level ?? 1) : 0),
    isCircleOfMoon: (druidRow?.subclass_name ?? member?.subclass)?.toLowerCase().includes("moon") ?? false,
  };
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
 *
 * Takes `PlayerVisibleMonster` because this runs on the player's own bestiary,
 * where an unrevealed creature arrives with a null `stat_block` (#842) — which
 * the body below has always handled, optional-chaining it twice. The parameter
 * type was the only part that claimed otherwise. A full `Monster` still
 * satisfies it, so every DM caller is unaffected.
 */
export function isEligibleWildshapeForm(monster: PlayerVisibleMonster, level: number, maxCr: number): boolean {
  if ((monster.monster_type ?? "").toLowerCase() !== "beast") return false;
  if (parseCr(monster.stat_block?.challenge_rating) > maxCr) return false;
  if (level < 8) {
    const speed = (monster.stat_block?.speed ?? "").toLowerCase();
    if (speed.includes("fly") || speed.includes("swim")) return false;
  }
  return true;
}
