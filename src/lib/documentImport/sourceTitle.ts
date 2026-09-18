/**
 * "Source book" for a document import (#site-workbench decision, 18 Sep
 * 2026): the maintainer's own content carries `source` = the book title
 * ("Icewind Dale: Rime of the Frostmaiden"), never the `Grimoire:AI` a
 * generator stamps on invented content. Before this the importer always
 * wrote `source: null` (`normalize.ts`'s monster/item/spell mappers) — every
 * item, monster and spell an import created had no book at all, unlike a
 * hand-created row or the maintainer's own library entries.
 *
 * This module is the pure half: normalizing a DM-typed title, and ranking the
 * DM's own existing `source` values so the review surface can offer them as
 * suggestions and pick a sensible prefill. The composable half —
 * `useImportSourceOptions` (`src/composables/campaign/`) — is what actually
 * queries `items`/`monsters`/`spells` for those rows.
 *
 * Deliberately excludes anything shared/library-sourced: `open5e_import` and
 * `source_document_key` both mark a row that came from Open5e or the shared
 * library rather than the DM's own hand, so neither belongs in "what has this
 * DM called a book before" — see `context/features/document-import.md`.
 */
import type { ImportDecision } from "./entityMatching";
import type { ImportEntityKind } from "@/types/documentImport.types";

/** One of the DM's own `items`/`monsters`/`spells` rows, reduced to the two
 *  facts this module's ranking needs. `campaignId` is `null` for a DM's
 *  global (campaign-less) row — see `KINDS_WITH_GLOBAL_ROWS`'s own reasoning
 *  in `useDocumentImportRunner.ts` for why that's a normal, expected shape. */
export interface SourceTitleRow {
  source: string;
  campaignId: string | null;
}

export interface SourceTitleOption {
  value: string;
  /** How many of the DM's own rows (across items/monsters/spells) use this
   *  title — shown so the review surface can hint "used 12 times" rather
   *  than presenting an unranked list. */
  count: number;
}

/**
 * Trims a DM-typed title, treating an all-whitespace string as no title at
 * all rather than a book literally named " " — the same "absence, not a
 * blank value" rule `capProse` (normalize.ts) already applies to prose
 * fields. `null`/`undefined` pass through as `null`.
 */
export function normalizeSourceTitle(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Distinct titles across `rows`, counted and ranked most-used first (ties
 * broken alphabetically, so the list is stable rather than depending on
 * whatever order the three tables' queries happened to return). A blank or
 * whitespace-only `source` contributes nothing — see `normalizeSourceTitle`.
 */
export function rankSourceOptions(rows: readonly SourceTitleRow[]): SourceTitleOption[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const title = normalizeSourceTitle(row.source);
    if (title === null) continue;
    counts.set(title, (counts.get(title) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/**
 * The review surface's prefill: the most-used title among rows in the
 * campaign being imported into, falling back to the most-used title overall
 * (a DM's global rows, or another campaign's), falling back to `null` (an
 * empty field) when the DM has never named a source book before.
 */
export function pickDefaultSourceTitle(rows: readonly SourceTitleRow[], campaignId: string): string | null {
  const inCampaign = rankSourceOptions(rows.filter((row) => row.campaignId === campaignId));
  if (inCampaign.length > 0) return inCampaign[0]!.value;
  const overall = rankSourceOptions(rows);
  return overall.length > 0 ? overall[0]!.value : null;
}

// ── Whether the review would create at least one item/monster/spell ────────

/** The only three kinds `source` (as a book title) applies to — a location,
 *  NPC, quest, faction or encounter has no `source` column at all. */
export const SOURCED_ENTITY_KINDS: readonly ImportEntityKind[] = ["monsters", "items", "spells"];

/**
 * Whether at least one `monsters`/`items`/`spells` entity is decided
 * `create` — the "Source book" field only makes sense when a row will
 * actually be written with it. Deliberately excludes `link`/`generate`/
 * `ignore`: a linked row keeps its own source, and a generated monster keeps
 * `Grimoire:AI` (it's invented, not sourced from this document) — see
 * `useGenerateMonster.ts`.
 */
export function hasSourcedCreate(
  decisionsByKind: Partial<Record<ImportEntityKind, ReadonlyMap<string, ImportDecision>>>,
): boolean {
  for (const kind of SOURCED_ENTITY_KINDS) {
    const decisions = decisionsByKind[kind];
    if (!decisions) continue;
    for (const decision of decisions.values()) {
      if (decision.action === "create") return true;
    }
  }
  return false;
}
