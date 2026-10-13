import { computeSpellcastingPerClass, type AbilityScores, type CharacterClass, type SpellcastingClassStats } from "@/types/multiclass.types";
import { getSpellPreparationPolicy } from "@/rules/spellPreparationPolicy";
import { castingFor, classCastingAbility, type ClassCastingLike, type SubclassCastingLike } from "@/rules/subclassCasting";
import type { RulesetKey } from "@/types/ruleset.types";

/** The subset of a system/custom class definition this module needs. */
export interface SpellcastingClassDefinitionLike extends ClassCastingLike {
  id: string;
}

/** The subset of a subclass definition this module needs. */
export interface SpellcastingSubclassDefinitionLike extends SubclassCastingLike {
  id: string;
}

export interface SpellcastingClassDefinitions {
  system: SpellcastingClassDefinitionLike[];
  custom: SpellcastingClassDefinitionLike[];
  subclasses: SpellcastingSubclassDefinitionLike[];
}

function definitionFor(
  entry: CharacterClass,
  definitions: SpellcastingClassDefinitions,
): SpellcastingClassDefinitionLike | undefined {
  const pool = entry.class_definition_kind === "custom" ? definitions.custom : definitions.system;
  return pool.find((candidate) => candidate.id === entry.class_definition_id);
}

function subclassFor(
  entry: CharacterClass,
  definitions: SpellcastingClassDefinitions,
): SpellcastingSubclassDefinitionLike | undefined {
  if (!entry.subclass_definition_id) return undefined;
  return definitions.subclasses.find((candidate) => candidate.id === entry.subclass_definition_id);
}

/**
 * Per-class spellcasting stats (DC/attack + effective caster type) for a
 * character's classes, resolving each class's definition (system or custom)
 * to determine its casting ability and caster-type override.
 *
 * A row casts from its class when the class casts, else from its subclass's
 * own spellcasting (`castingFor`: an Eldritch Knight casts off Intelligence).
 *
 * Casting ability precedence: definition's explicit `prepared_ability` →
 * a text match on `primary_ability` (Intelligence/Wisdom/Charisma); a class
 * with neither casts nothing.
 *
 * Caster-type precedence: the ruleset's spell-preparation policy (system
 * classes only) → the effective casting's type. A row whose definition did
 * not resolve and holds no casting subclass is a non-caster.
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
  return computeSpellcastingPerClass(member, classEntries, (entry) => {
    const definition = definitionFor(entry, definitions);
    const casting = castingFor(definition, subclassFor(entry, definitions));
    const policy = casting?.source !== "subclass" && entry.class_definition_kind !== "custom"
      ? getSpellPreparationPolicy(entry.class_name, ruleset)
      : null;
    return {
      // A class that does not cast keeps the ability its definition names (a Monk's Wisdom DC).
      ability: casting ? casting.ability : classCastingAbility(definition),
      casterType: policy?.casterType ?? casting?.casterType ?? "none",
    };
  });
}
