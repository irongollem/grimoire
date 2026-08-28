import type { Deity, Pantheon } from "@/types/deity.types";

/**
 * The "Deity quick lookup" widget's join, ordering and formatting (#764).
 *
 * `useAllDeities()` (src/composables/deities/useDeities.ts:98) already returns each
 * deity joined with just its pantheon's `{ id, name }` — this module takes
 * that shape directly rather than accepting a separate `Pantheon[]` and
 * re-deriving the join from `useAllDeities()`'s own `pantheon_id` column,
 * which would just repeat work Supabase already did once. A pantheon with no
 * deities in it (a bare `Pantheon` row from `useAllPantheons()`) has nothing
 * for this card to look up, so that composable is never called here.
 */

export type DeityWithPantheon = Deity & {
  pantheon: Pick<Pantheon, "id" | "name"> | null;
};

export interface DeityLookupRow {
  id: string;
  name: string;
  /** `null` once blank strings are trimmed away — the widget omits the line
   *  entirely for a `null` field rather than rendering an empty one. */
  titles: string | null;
  alignment: string | null;
  symbol: string | null;
  /** Trimmed of blank entries; `[]` is a real, renderable state — the widget
   *  shows "No domains recorded" for it rather than an empty pill row. */
  domains: string[];
  to: string;
}

export interface DeityLookupGroup {
  /** `null` for the single ungrouped section, and for the "Unaffiliated"
   *  section when grouping is on — see `buildDeityLookupGroups`. */
  pantheonId: string | null;
  /** `null` means "render no header" — the ungrouped case. Every grouped
   *  section (including "Unaffiliated") always has a label. */
  pantheonLabel: string | null;
  rows: DeityLookupRow[];
}

/** Sorts last, after every real pantheon name — see `buildDeityLookupGroups`. */
const UNAFFILIATED_LABEL = "Unaffiliated";
const UNAFFILIATED_KEY = "__unaffiliated__";

/** Blank-after-trim collapses to `null` so a deity record with `""` saved in
 *  a text field reads the same as one that was never filled in — the point
 *  raised in CLAUDE.md's null-coercion rule cuts both ways: `??` that hides a
 *  real absence is banned, but so is treating `""` as meaningfully different
 *  from absence when the UI's only options are "show a line" or "don't". */
function normalizeText(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * One deity, formatted for the card.
 */
export function formatDeityLookupRow(deity: DeityWithPantheon): DeityLookupRow {
  return {
    id: deity.id,
    name: deity.name,
    titles: normalizeText(deity.titles),
    alignment: normalizeText(deity.alignment),
    symbol: normalizeText(deity.symbol),
    domains: deity.domains.map((domain) => domain.trim()).filter((domain) => domain.length > 0),
    to: `/deities/${deity.id}`,
  };
}

/**
 * Groups + orders deities for the card.
 *
 * Whether to show pantheon headers at all was the judgement call #764 asked
 * for. A campaign built from Populate Setting has a dozen named pantheons
 * (Faerûn alone ships thirteen) and rendering every deity unlabeled would be
 * a wall of unrelated gods with no way to tell which court a name belongs to.
 * But the common homebrew campaign is a handful of deities with no
 * `Pantheon` rows at all — for that shape, a single "Unaffiliated" header
 * repeated over every row would be pure noise on top of what the flat list
 * already says just by having no headers.
 *
 * The rule: group only when the deities span more than one *bucket*, where a
 * bucket is a real pantheon or the "no pantheon" set. That also covers the
 * one-pantheon-plus-a-few-strays case, which is neither of the two obvious
 * shapes above — a lone unaffiliated deity mixed into an otherwise
 * single-pantheon campaign still gets grouped, because folding it silently
 * under the pantheon header would misattribute it, and leaving every row
 * unlabeled would hide that the party has a deity outside the pantheon at
 * all. Two buckets is already "more than one", so it groups.
 *
 * Named groups sort alphabetically; "Unaffiliated" always sorts last
 * regardless of where its label would fall alphabetically, because it is not
 * a named thing to alphabetize against real pantheons — it is "everything
 * else", the same convention an "Other" bucket gets in any filtered list.
 */
export function buildDeityLookupGroups(deities: readonly DeityWithPantheon[]): DeityLookupGroup[] {
  if (deities.length === 0) return [];

  const buckets = new Map<string, { label: string | null; rows: DeityLookupRow[] }>();
  for (const deity of deities) {
    const key = deity.pantheon?.id ?? UNAFFILIATED_KEY;
    const bucket = buckets.get(key);
    const row = formatDeityLookupRow(deity);
    if (bucket) {
      bucket.rows.push(row);
    } else {
      buckets.set(key, { label: deity.pantheon?.name ?? null, rows: [row] });
    }
  }

  const sortedRows = (rows: DeityLookupRow[]) =>
    [...rows].sort((a, b) => a.name.localeCompare(b.name));

  // Only one bucket in play (every deity shares a pantheon, or none has one
  // at all): render flat, no header needed to disambiguate anything.
  if (buckets.size === 1) {
    const [[, bucket]] = buckets;
    return [{ pantheonId: null, pantheonLabel: null, rows: sortedRows(bucket.rows) }];
  }

  const named: DeityLookupGroup[] = [];
  let unaffiliated: DeityLookupGroup | null = null;

  for (const [key, bucket] of buckets) {
    if (key === UNAFFILIATED_KEY) {
      unaffiliated = { pantheonId: null, pantheonLabel: UNAFFILIATED_LABEL, rows: sortedRows(bucket.rows) };
      continue;
    }
    named.push({ pantheonId: key, pantheonLabel: bucket.label, rows: sortedRows(bucket.rows) });
  }

  named.sort((a, b) => (a.pantheonLabel ?? "").localeCompare(b.pantheonLabel ?? ""));
  if (unaffiliated) named.push(unaffiliated);

  return named;
}
