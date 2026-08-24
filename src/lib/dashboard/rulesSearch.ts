import type { LibraryRule } from "@/types/rule.types";

/**
 * Matching, ranking and limiting for the dashboard's Rules search widget (#764).
 *
 * The predicate itself is lifted unchanged from `CompendiumTab.vue`'s own
 * sidebar filter (`searchResults`, CompendiumTab.vue:119-125): a case-folded
 * substring test against the rule's name OR its plain-text content. That tab
 * still owns its own copy rather than importing this one — the task was to
 * build the widget, not refactor a file outside this change's ownership — but
 * the two should read identically, and `CompendiumTab` could switch to
 * `searchLibraryRules` (with a high `limit`) with no behaviour change if a
 * later pass wants one filter implementation instead of two.
 *
 * What this module adds on top of that predicate, because a dashboard card has
 * neither the sidebar's height nor its scroll: rows whose *name* matches sort
 * ahead of rows that only match in body text, and the result is cut to a
 * fixed count. Ranking is a stable partition, not a score — "does the title
 * match" is the only signal worth ordering on for a handful of results, and a
 * numeric relevance score would be a second, untested opinion about the same
 * predicate.
 */

/** Small enough that a card can show every row without its own scroll doing
 *  the work — the point of a dashboard widget is the answer at a glance, not
 *  a second copy of the compendium's sidebar. */
export const RULES_SEARCH_RESULT_LIMIT = 5;

export function searchLibraryRules(
  rules: readonly LibraryRule[],
  query: string,
  limit: number = RULES_SEARCH_RESULT_LIMIT,
): LibraryRule[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const titleMatches: LibraryRule[] = [];
  const bodyMatches: LibraryRule[] = [];
  for (const rule of rules) {
    if (rule.name.toLowerCase().includes(q)) {
      titleMatches.push(rule);
    } else if (rule.content.toLowerCase().includes(q)) {
      // Only reached when the title did NOT match, so a rule never appears
      // twice — once would be a title hit read as two different results.
      bodyMatches.push(rule);
    }
  }
  return [...titleMatches, ...bodyMatches].slice(0, limit);
}
