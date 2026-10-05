import type { CustomFeatures } from "@/levelup/customTypes";

/** A character_spells row a subclass grants: prepared and never counted against the prepared limit. */
export interface SubclassGrantedSpellRow {
  spell_id: string;
  is_prepared: true;
  always_prepared: true;
}

/** The spell ids a subclass grants at one class level. */
export function subclassGrantedSpellIds(
  grantedSpells: CustomFeatures | null | undefined,
  classLevel: number,
): string[] {
  return grantedSpells?.[String(classLevel)] ?? [];
}

/**
 * The rows for spells a subclass grants (always prepared), minus any the
 * character already has. The one place this is decided, for the level-up payload
 * and for a subclass chosen at creation, so a level-1 domain cleric gets exactly
 * what a level-up to that level would have given.
 */
export function subclassGrantedSpellRows(
  spellIds: readonly string[],
  existingSpellIds: ReadonlySet<string>,
): SubclassGrantedSpellRow[] {
  return spellIds
    .filter((spell_id) => !existingSpellIds.has(spell_id))
    .map((spell_id) => ({ spell_id, is_prepared: true, always_prepared: true }));
}
