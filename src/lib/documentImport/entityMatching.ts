/**
 * Turns the output of the two entity-resolution RPCs (#837 monsters, #838
 * items) into per-entity match state the review wizard can show and default
 * from — "this creature/item you're about to create already exists, link to
 * it instead."
 *
 * Pure by the same rule as importPlan.ts and normalize.ts: no Supabase
 * client, no network. The wizard calls `resolve_monster_references` /
 * `resolve_item_references` once per kind, when that kind's review step
 * opens, and hands the raw rows here.
 *
 * Deliberately named "matching" rather than "resolution" — `importPlan.ts`
 * already owns `resolveLinks`/`LinkResolution` for a different thing
 * (wiring a freshly-inserted row's own FK, by name, against rows from the
 * *same* import). This is "does an entity about to be created already exist
 * somewhere," which produces no insert and no FK write at all — the DM just
 * reuses the row that's already there. Same vocabulary for two different
 * ideas is how the next reader confuses them.
 */

export type EntityMatchSource = "campaign" | "library";
export type EntityMatchKind = "exact" | "contains";

/**
 * One resolved candidate for a name the wizard asked about — the caller's
 * own vault or the shared library, never both (own always wins a tie, per
 * the RPCs' own rank order).
 */
export interface EntityMatch {
  /** A campaign row's uuid, or a library row's stable text id — never both;
   *  the two RPCs return exactly one non-null id column per row, and the
   *  `normalize*MatchRow` functions below pick whichever is populated. */
  targetId: string;
  source: EntityMatchSource;
  /** The existing row's own name, which may differ from what the page
   *  printed ("Icewind kobold" query -> "Kobold" matched). */
  matchedName: string;
  matchKind: EntityMatchKind;
}

/** One row of `resolve_monster_references` / `resolve_item_references`,
 *  already narrowed to whichever id column the source RPC populated. */
export interface RawMatchRow {
  queryName: string;
  match: EntityMatch;
}

function asMatchSource(value: unknown): EntityMatchSource | null {
  return value === "campaign" || value === "library" ? value : null;
}

function asMatchKind(value: unknown): EntityMatchKind | null {
  return value === "exact" || value === "contains" ? value : null;
}

/**
 * Shared shape check for both RPCs' rows. A row failing any check is
 * dropped rather than surfaced with a guessed value — an unmatched name is
 * simply "no match", the same outcome as if the RPC had never returned that
 * row at all (the same non-guessing rule `resolveLinks` follows).
 */
function normalizeMatchRows(
  rows: readonly unknown[],
  campaignIdKey: string,
  libraryIdKey: string,
): RawMatchRow[] {
  const out: RawMatchRow[] = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const rec = raw as Record<string, unknown>;
    const queryName = rec.query_name;
    const source = asMatchSource(rec.source);
    const matchKind = asMatchKind(rec.match_kind);
    const matchedName = rec.matched_name;
    if (typeof queryName !== "string" || !source || !matchKind || typeof matchedName !== "string") {
      continue;
    }
    const targetId = rec[source === "campaign" ? campaignIdKey : libraryIdKey];
    if (typeof targetId !== "string" || targetId.length === 0) continue;
    out.push({ queryName, match: { targetId, source, matchedName, matchKind } });
  }
  return out;
}

/** `resolve_monster_references` rows: `monster_id` (uuid) or `library_monster_id` (text). */
export function normalizeMonsterMatchRows(rows: readonly unknown[]): RawMatchRow[] {
  return normalizeMatchRows(rows, "monster_id", "library_monster_id");
}

/** `resolve_item_references` rows: `item_id` (uuid) or `library_item_id` (text). */
export function normalizeItemMatchRows(rows: readonly unknown[]): RawMatchRow[] {
  return normalizeMatchRows(rows, "item_id", "library_item_id");
}

/**
 * Assigns each entity its match, keyed by its *current extraction* heading —
 * never a DM edit made after the review step opened, since the resolver ran
 * once, against the exact names it was actually asked about (the wizard
 * calls this immediately after building `p_names` from those same
 * headings). Entities that printed the same name share one match, exactly
 * as the RPCs' own `distinct on (query_name)` intends.
 *
 * A name with no match is simply absent from `rows` (the RPCs' own
 * contract) and so absent from the returned map — the caller's existing
 * "create fresh" default already handles that by doing nothing differently.
 */
export function matchEntitiesByName(
  entities: readonly { ref: string; heading: string }[],
  rows: readonly RawMatchRow[],
): Map<string, EntityMatch> {
  const byName = new Map(rows.map((row) => [row.queryName, row.match] as const));
  const result = new Map<string, EntityMatch>();
  for (const entity of entities) {
    const match = byName.get(entity.heading);
    if (match) result.set(entity.ref, match);
  }
  return result;
}
