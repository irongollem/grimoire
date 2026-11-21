// When a creature searches (#1021 row 13). Pure and edge-importable.

import type { TurnOption } from "../terrain/options/types.ts";

/**
 * RULE search-when-nothing-to-strike (APP CONVENTION; the books do not say how a monster spends its Action): a creature with no
 * attack and no damaging cast to make at a foe it can find, while some foe it cannot find is hidden near it, searches for that
 * foe rather than closing on one far off or standing in a Dodge. An attack or a damaging cast always comes first: the
 * search option exists only while a hostile holds Hidden, and an attack is never offered against one.
 */
export function chooseSearch(options: readonly TurnOption[]): { optionId: string; reason: string } | null {
  const search = options.find((o) => o.kind === "search");
  if (search === undefined) return null;
  return { optionId: search.id, reason: "Searches: there is nothing it can find to attack, and a foe is hiding nearby." };
}
