import { computeSpellcastingByClass, type SpellcastingClassDefinitionLike } from "@/rules/spellcastingByClass";
import { hitDieForClassRow, type HitDieDefinitionLike } from "@/rules/classHitDie";
import type { AbilityScores, CharacterClass } from "@/types/multiclass.types";
import type { RulesetKey } from "@/types/ruleset.types";

/**
 * What a printed character sheet needs to know about a character's classes:
 * the class rows and the definitions they are pinned to. Passed in whole so
 * the sheet components and the pure `toFront` read class data one way, from
 * the pinned definitions, never from the `party_members.class` mirror text.
 * An empty `rows` is a classless character.
 */
export interface SheetClassInput {
  rows: CharacterClass[];
  definitions: {
    system: (HitDieDefinitionLike & SpellcastingClassDefinitionLike)[];
    custom: (HitDieDefinitionLike & SpellcastingClassDefinitionLike)[];
  };
}

export interface SheetHitDie {
  die: number;
  /** Levels taken on this die, summed across every class row that plays it. */
  count: number;
}

/**
 * The hit dice a character owns, grouped by die size, largest first. A
 * multiclass character has one entry per kind of die. Rows whose pinned
 * definition is not among the loaded ones add nothing, so the sheet shows
 * less rather than a guessed die. Empty for a classless character.
 */
export function sheetHitDice(input: SheetClassInput): SheetHitDie[] {
  const byDie = new Map<number, number>();
  for (const row of input.rows) {
    const die = hitDieForClassRow(row, input.definitions);
    if (die === null) continue;
    byDie.set(die, (byDie.get(die) ?? 0) + row.levels);
  }
  return Array.from(byDie.entries())
    .map(([die, count]) => ({ die, count }))
    .sort((a, b) => b.die - a.die);
}

/** "3d10+2d6": the compact pool label, compact because the printed box is narrow. */
export function formatHitDicePool(pool: readonly SheetHitDie[]): string {
  return pool.map((entry) => `${entry.count}d${entry.die}`).join("+");
}

/**
 * The casting ability the sheet's spell DC / attack is printed from: the
 * primary class's when it casts, else the first casting class's. Resolved
 * through each row's pinned definition. Null when no class casts (including a
 * classless character).
 */
export function sheetCastingAbility(
  member: AbilityScores & { proficiency_bonus: number },
  input: SheetClassInput,
  ruleset: RulesetKey,
): "int" | "wis" | "cha" | null {
  const casters = computeSpellcastingByClass(member, input.rows, input.definitions, ruleset);
  const primaryId = input.rows.find((row) => row.is_primary)?.id;
  const lead = casters.find((stat) => stat.classId === primaryId) ?? casters[0];
  return lead?.castingAbility ?? null;
}
