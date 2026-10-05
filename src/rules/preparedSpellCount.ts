/**
 * The number that is compared against a caster's prepared-spell limit.
 *
 * Cantrips are not prepared, and spells granted by a subclass, domain or oath
 * are prepared for free, so neither counts against the limit. The Prepared tab
 * badge and the banner inside the tab both read this one definition; before it
 * existed they disagreed (the badge counted cantrips and granted spells).
 */
export interface PreparedCountEntry {
  is_prepared: boolean;
  always_prepared?: boolean | null;
  spell: { level: number };
}

export function countPreparedAgainstLimit(entries: readonly PreparedCountEntry[]): number {
  return entries.filter((e) => e.spell.level > 0 && e.is_prepared && !e.always_prepared).length;
}
