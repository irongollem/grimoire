import type { CustomSubclass } from "@/levelup/customTypes";

/**
 * What a subclass does to a character's spells, read-only. The server writes the
 * rows (`private.sync_subclass_spells`); the client only describes them, so a
 * level-up can say "you gain Bless and Cure Wounds" and a picker can offer a
 * Warlock patron's expanded list.
 */
export type SubclassSpellSource = Pick<
  CustomSubclass,
  "granted_spells" | "spell_variants" | "spell_variant_label" | "expanded_spells" | "expanded_spell_variants"
>;

/**
 * The options a subclass makes the character choose between (Circle of the
 * Land's terrains, an Animal Lords affinity): the keys of its granted and its
 * expanded variants, which share one choice, in authored order.
 */
export function subclassVariantOptions(subclass: SubclassSpellSource | null | undefined): string[] {
  if (!subclass) return [];
  return [...new Set([...Object.keys(subclass.spell_variants), ...Object.keys(subclass.expanded_spell_variants)])];
}

/** What the choice is called on screen; "Option" only when the author left it unnamed. */
export function subclassVariantLabel(subclass: SubclassSpellSource | null | undefined): string {
  return subclass?.spell_variant_label || "Option";
}

/**
 * The spell ids a subclass grants always prepared at one class level: the
 * subclass's own list plus the chosen option's. An option the subclass does not
 * have contributes nothing (the database refuses to store one).
 */
export function subclassGrantedSpellIds(
  subclass: SubclassSpellSource | null | undefined,
  classLevel: number,
  variant: string | null,
): string[] {
  if (!subclass) return [];
  const level = String(classLevel);
  const fromVariant = variant !== null && Object.hasOwn(subclass.spell_variants, variant)
    ? subclass.spell_variants[variant][level] ?? []
    : [];
  return [...new Set([...(subclass.granted_spells[level] ?? []), ...fromVariant])];
}

/**
 * Every spell id on the subclass's expanded list, across spell levels: its own
 * list plus the chosen option's. These are choices the class picks from, never
 * grants. An option the subclass does not have adds nothing.
 */
export function subclassExpandedSpellIds(
  subclass: SubclassSpellSource | null | undefined,
  variant: string | null,
): string[] {
  if (!subclass) return [];
  const fromVariant = variant !== null && Object.hasOwn(subclass.expanded_spell_variants, variant)
    ? Object.values(subclass.expanded_spell_variants[variant]).flat()
    : [];
  return [...new Set([...Object.values(subclass.expanded_spells).flat(), ...fromVariant])];
}

/**
 * Whether the character still owes a choice of option: the subclass has options
 * and the class row holds none. Asked at the level the subclass is chosen, and
 * at the first level-up after that for a character who has no pick.
 */
export function subclassVariantDue(
  subclass: SubclassSpellSource | null | undefined,
  currentVariant: string | null,
): boolean {
  return subclassVariantOptions(subclass).length > 0 && currentVariant === null;
}
