import { computeSpellcastingPerClass, type AbilityScores, type CharacterClass, type SpellcastingClassStats } from "@/types/multiclass.types";
import { getSpellPreparationPolicy } from "@/lib/spellPreparationPolicy";
import type { CasterType } from "@/types/spell.types";
import type { RulesetKey } from "@/types/ruleset.types";

/** The subset of a system/custom class definition this module needs. */
export interface SpellcastingClassDefinitionLike {
  id: string;
  prepared_ability?: "int" | "wis" | "cha" | null;
  primary_ability?: string | null;
  caster_type?: CasterType | null;
}

export interface SpellcastingClassDefinitions {
  system: SpellcastingClassDefinitionLike[];
  custom: SpellcastingClassDefinitionLike[];
}

function definitionFor(
  entry: CharacterClass,
  definitions: SpellcastingClassDefinitions,
): SpellcastingClassDefinitionLike | undefined {
  if (!entry.class_definition_id) return undefined;
  const pool = entry.class_definition_kind === "custom" ? definitions.custom : definitions.system;
  return pool.find((candidate) => candidate.id === entry.class_definition_id);
}

/**
 * Per-class spellcasting stats (DC/attack + effective caster type) for a
 * character's classes, resolving each class's definition (system or custom)
 * to determine its casting ability and caster-type override.
 *
 * Casting ability precedence: definition's explicit `prepared_ability` →
 * a text match on `primary_ability` (Intelligence/Wisdom/Charisma) → the
 * class-name default in `computeSpellcastingPerClass`.
 *
 * Caster-type precedence: the ruleset's spell-preparation policy (system
 * classes only) → the definition's `caster_type` → the class-name default.
 *
 * Shared by RunnerPcPanel (encounter runner) and PlayerSpellsView (player
 * portal) so multiclass casters see the correct per-class DC in both places.
 */
export function computeSpellcastingByClass(
  member: AbilityScores & { proficiency_bonus: number },
  classEntries: CharacterClass[],
  definitions: SpellcastingClassDefinitions,
  ruleset: RulesetKey,
): SpellcastingClassStats[] {
  const stats = computeSpellcastingPerClass(member, classEntries, (entry) => {
    const definition = definitionFor(entry, definitions);
    if (!entry.class_definition_id) return undefined;
    const explicit = definition?.prepared_ability;
    if (explicit) return explicit;
    const primary = definition?.primary_ability?.toLowerCase() ?? null;
    if (primary?.includes("intelligence")) return "int";
    if (primary?.includes("wisdom")) return "wis";
    if (primary?.includes("charisma")) return "cha";
    return null;
  });

  return stats.map((stat) => {
    const entry = classEntries.find((candidate) => candidate.id === stat.classId);
    const definition = entry ? definitionFor(entry, definitions) : undefined;
    const policy = entry?.class_definition_kind === "custom"
      ? null
      : getSpellPreparationPolicy(stat.className, ruleset);
    return {
      ...stat,
      casterType: policy?.casterType ?? definition?.caster_type ?? stat.casterType,
    };
  });
}
