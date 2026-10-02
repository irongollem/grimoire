import type { CharacterClass } from "@/types/multiclass.types";

/** The slice of a system or custom class definition a hit die is read from. */
export interface HitDieDefinitionLike {
  id: string;
  hit_die: number;
}

export interface HitDieDefinitions {
  system: readonly HitDieDefinitionLike[];
  custom: readonly HitDieDefinitionLike[];
}

/**
 * The hit die a class row plays, read from the definition the row is pinned
 * to. Never looked up by class name: a custom class carries its own die, and a
 * name lookup would hand it a built-in's. Returns null while the definitions
 * have not loaded (or the pinned one is not among them), so callers show
 * nothing rather than a guessed die.
 */
export function hitDieForClassRow(
  row: Pick<CharacterClass, "class_definition_id" | "class_definition_kind">,
  definitions: HitDieDefinitions,
): number | null {
  const pool = row.class_definition_kind === "custom" ? definitions.custom : definitions.system;
  return pool.find((definition) => definition.id === row.class_definition_id)?.hit_die ?? null;
}
