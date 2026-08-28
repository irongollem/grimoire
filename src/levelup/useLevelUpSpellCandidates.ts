import { computed } from "vue";
import type { ComputedRef, Ref } from "vue";
import { useAllSpells } from "@/composables/spells/useSpells";
import type { Spell } from "@/types/spell.types";

/**
 * The spells the level-up wizard may offer for a single picker.
 *
 * Kept apart from the wizard component so the selection rules are unit-testable:
 * an empty list here is not a cosmetic problem but an unconfirmable level-up,
 * because `apply_level_up` (migration 20260720000026) rejects any submission
 * whose class spell/cantrip count differs from the server-derived requirement.
 */
export interface SpellCandidates {
  spells: Spell[];
  /**
   * How many spells this picker could offer before the search box narrowed
   * them. Zero means the level-up is unconfirmable, not that the reader
   * mistyped — the two need different messages.
   */
  available: number;
  /**
   * True when no spell in the library lists this class, so the unfiltered list
   * is being offered instead. Custom classes are the usual cause — a DM-built
   * "Bloodhunter" appears in no library spell's `classes` array, and a
   * class-filtered picker would leave the wizard demanding picks it cannot
   * satisfy.
   */
  usedClassFallback: boolean;
}

export function pickSpellCandidates(
  all: Spell[],
  opts: { className: string; search: string; isCantrip: boolean; maxCastableLevel: number },
): SpellCandidates {
  const inLevelRange = all.filter((spell) =>
    opts.isCantrip
      ? spell.level === 0
      : spell.level > 0 && spell.level <= opts.maxCastableLevel,
  );

  const forClass = opts.className
    ? inLevelRange.filter((spell) => spell.classes.includes(opts.className))
    : inLevelRange;

  // Decided before the search term is applied: a query that happens to match
  // nothing must read as "no results", not silently widen the class list.
  const usedClassFallback = !!opts.className && forClass.length === 0 && inLevelRange.length > 0;
  const base = usedClassFallback ? inLevelRange : forClass;

  const term = opts.search.trim().toLowerCase();
  const spells = term ? base.filter((spell) => spell.name.toLowerCase().includes(term)) : base;

  return { spells, available: base.length, usedClassFallback };
}

/**
 * Spell and cantrip candidates for the level-up wizard's pickers.
 *
 * Reads the same merged source as the Spellbook (`useAllSpells`: the campaign's
 * enabled library sources plus the player's own custom spells). The wizard used
 * to query the `spells` table alone, which holds only user-authored spells —
 * effectively empty for everyone — so both pickers rendered "No spells found
 * for this class" and Confirm stayed disabled forever (#736).
 */
export function useLevelUpSpellCandidates(opts: {
  className: ComputedRef<string>;
  maxCastableLevel: ComputedRef<number>;
  spellSearch: Ref<string>;
  cantripSearch: Ref<string>;
}) {
  const { data: allSpells, isLoading } = useAllSpells();

  const spellCandidates = computed(() =>
    pickSpellCandidates(allSpells.value, {
      className: opts.className.value,
      search: opts.spellSearch.value,
      isCantrip: false,
      maxCastableLevel: opts.maxCastableLevel.value,
    }),
  );

  const cantripCandidates = computed(() =>
    pickSpellCandidates(allSpells.value, {
      className: opts.className.value,
      search: opts.cantripSearch.value,
      isCantrip: true,
      maxCastableLevel: opts.maxCastableLevel.value,
    }),
  );

  return { spellCandidates, cantripCandidates, isLoading };
}
