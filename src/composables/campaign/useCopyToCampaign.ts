import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useInvalidateQuota } from "@/composables/billing/useQuota";
import { queueItemEmbedding } from "@/composables/items/useItems";
import { queueMonsterEmbedding } from "@/composables/monsters/useMonsters";
import { BULK_SCOPE_QUERY_KEY, type BulkScopeTable } from "@/composables/campaign/useBulkCampaignScope";
import { buildCopyPlan, libraryReferencedIds, referencedIds, type DroppedReference, type ReferencedRow } from "@/lib/campaign/copyToCampaign";

/**
 * The copy-to-campaign mutation (#598, wave 1): copies a selection of rows
 * from one of the eight bulk-scope tables into another campaign the account
 * DMs (or into "every campaign", targetCampaignId null). The planning — what
 * to drop, what to clear, what travels — lives in `copyToCampaign.ts`; this
 * module only fetches what that planner needs and performs the write.
 *
 * No migration backs this: RLS's INSERT `WITH CHECK` is
 * `auth.uid() = user_id AND (campaign_id IS NULL OR private.is_campaign_dm(campaign_id))`
 * on all eight tables (verified in production 14 Sep 2026), so an insert into
 * any campaign the account DMs already works.
 */

/** A long `.in()` list travels in the URL — chunk exactly like
 *  useBulkCampaignScope's CHUNK_SIZE, so neither a source-row read nor a
 *  referenced-row lookup nor the insert itself trips a request-line limit. */
const CHUNK_SIZE = 200;

function chunkIds(ids: readonly string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
  return chunks;
}

function chunkArray<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export interface CopyToCampaignInput {
  table: BulkScopeTable;
  ids: readonly string[];
  targetCampaignId: string | null;
}

/**
 * Shared-library content the copy carries that the TARGET campaign has not
 * enabled the source for. Not a drop — the rows travel and the reference is
 * intact; the target simply cannot look them up until the DM enables that
 * source in its settings. #598 asks for this to be reported rather than
 * silently broken, and reporting beats dropping because the fix is one toggle
 * away. Always empty when the target is "all campaigns": there is no one
 * campaign whose enabled sources could be consulted.
 */
export interface LibrarySourceNotice {
  /** The library rows in question, by name. */
  names: string[];
  /** The distinct sources to enable, by title — what the DM actually acts on. */
  sources: string[];
}

export interface CopyPreview {
  dropped: DroppedReference[];
  needsSources: LibrarySourceNotice | null;
}

export interface CopyToCampaignResult extends CopyPreview {
  copied: number;
}

async function fetchRows(table: string, ids: readonly string[], columns: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (const chunk of chunkIds(ids, CHUNK_SIZE)) {
    if (!chunk.length) continue;
    const { data, error } = await supabase.from(table).select(columns).in("id", chunk);
    if (error) throw error;
    // `table` and `columns` are both runtime strings (one of the eight
    // bulk-scope tables, or one of the tables they reference), so supabase-js
    // cannot infer a row shape here — the cast is genuinely from `unknown`.
    rows.push(...((data ?? []) as unknown as Record<string, unknown>[]));
  }
  return rows;
}

/** One `id, name, campaign_id` lookup per referenced table, for the union of
 *  ids every source row's `referencedIds()` names — so a 50-row selection
 *  costs one request per distinct referenced table, not one per row. */
async function resolveReferencedRows(
  table: BulkScopeTable,
  sourceRows: readonly Record<string, unknown>[],
): Promise<Map<string, ReferencedRow>> {
  const idsByTable = new Map<string, Set<string>>();
  for (const row of sourceRows) {
    for (const [refTable, ids] of Object.entries(referencedIds(table, row))) {
      const set = idsByTable.get(refTable) ?? new Set<string>();
      for (const id of ids) set.add(id);
      idsByTable.set(refTable, set);
    }
  }

  const referenced = new Map<string, ReferencedRow>();
  for (const [refTable, idSet] of idsByTable) {
    const rows = await fetchRows(refTable, [...idSet], "id, name, campaign_id");
    for (const r of rows) {
      referenced.set(r.id as string, {
        id: r.id as string,
        name: r.name as string,
        campaignId: r.campaign_id as string | null,
      });
    }
  }
  return referenced;
}

/**
 * Groups a batch's per-row drops by label into one report — a DM copying 20
 * items sees one "Linked spells — …" line naming everything that stayed
 * behind across the whole selection, not 20 near-duplicate lines.
 */
function mergeDropped(entries: readonly DroppedReference[]): DroppedReference[] {
  const byLabel = new Map<string, DroppedReference>();
  for (const entry of entries) {
    const existing = byLabel.get(entry.label);
    if (existing) {
      existing.names.push(...entry.names);
      existing.removedEntries = existing.removedEntries || entry.removedEntries;
    } else {
      byLabel.set(entry.label, { label: entry.label, names: [...entry.names], removedEntries: entry.removedEntries });
    }
  }
  return [...byLabel.values()];
}

async function planEachRow(
  input: CopyToCampaignInput,
): Promise<{ sourceRows: Record<string, unknown>[]; payloads: Record<string, unknown>[]; dropped: DroppedReference[] }> {
  const { table, ids, targetCampaignId } = input;
  const sourceRows = await fetchRows(table, ids, "*");
  const referenced = await resolveReferencedRows(table, sourceRows);
  // The copy is owned by whoever is copying (see buildCopyPlan). No session
  // means no owner to give it, and RLS would reject the insert anyway — say
  // so here rather than letting a non-null assertion throw a TypeError two
  // frames later with nothing in it a reader can act on.
  const user = getCurrentUser();
  if (!user) throw new Error("Sign in again to copy content to another campaign.");
  const userId = user.id;

  const payloads: Record<string, unknown>[] = [];
  const dropped: DroppedReference[] = [];
  for (const row of sourceRows) {
    const plan = buildCopyPlan(table, row, targetCampaignId, userId, referenced);
    payloads.push(plan.payload);
    dropped.push(...plan.dropped);
  }
  return { sourceRows, payloads, dropped };
}

/**
 * Every shared-library row this copy carries whose source the target campaign
 * has not enabled. One `library_spells` read and one `campaign_enabled_sources`
 * read, both skipped entirely when nothing in the selection points at library
 * content — which is the ordinary case.
 */
async function resolveUnenabledSources(
  table: BulkScopeTable,
  sourceRows: readonly Record<string, unknown>[],
  targetCampaignId: string | null,
): Promise<LibrarySourceNotice | null> {
  // "All campaigns" has no enabled-source list to consult, so there is nothing
  // here that could be true — say nothing rather than guessing.
  if (targetCampaignId === null) return null;

  const slugs = new Set<string>();
  for (const row of sourceRows) {
    for (const ids of Object.values(libraryReferencedIds(table, row))) {
      for (const id of ids) slugs.add(id);
    }
  }
  if (!slugs.size) return null;

  const libraryRows = await fetchRows("library_spells", [...slugs], "id, name, source, source_title");
  if (!libraryRows.length) return null;

  const { data, error } = await supabase
    .from("campaign_enabled_sources")
    .select("source_slug")
    .eq("campaign_id", targetCampaignId);
  if (error) throw error;
  const enabled = new Set((data ?? []).map((r) => r.source_slug as string));

  const names: string[] = [];
  const sources = new Set<string>();
  for (const r of libraryRows) {
    const source = r.source as string | null;
    if (source === null || enabled.has(source)) continue;
    names.push(r.name as string);
    sources.add((r.source_title as string | null) ?? source);
  }
  return names.length ? { names, sources: [...sources] } : null;
}

/**
 * Read-only preview: what this copy would drop and what it would carry that
 * the target cannot yet resolve, without writing anything. The dialog calls
 * this as soon as a target is picked, so both reports are shown before the DM
 * confirms — not discovered after the write.
 */
export async function planCopy(input: CopyToCampaignInput): Promise<CopyPreview> {
  const { sourceRows, dropped } = await planEachRow(input);
  return {
    dropped: mergeDropped(dropped),
    needsSources: await resolveUnenabledSources(input.table, sourceRows, input.targetCampaignId),
  };
}

async function copyToCampaign(input: CopyToCampaignInput): Promise<CopyToCampaignResult> {
  const { table } = input;
  const { sourceRows, payloads, dropped } = await planEachRow(input);
  const needsSources = await resolveUnenabledSources(table, sourceRows, input.targetCampaignId);

  const insertedIds: string[] = [];
  for (const chunk of chunkArray(payloads, CHUNK_SIZE)) {
    if (!chunk.length) continue;
    // A quota_exceeded error from the enforce_quota trigger (monsters,
    // puzzle_rooms) rejects here uncaught — the caller turns it into the
    // paywall, this mutation does not own that decision.
    const { data, error } = await supabase.from(table).insert(chunk).select("id");
    if (error) throw error;
    for (const r of data ?? []) insertedIds.push(r.id as string);
  }

  // Bulk insert bypasses the owning composable's create-mutation hook, so each
  // new row needs its own embed call here — otherwise these rows stay
  // unretrievable until the next admin backfill (mirrors useNpcs.ts:409 and
  // useLocations.ts:513, which cite the same useCloneLibraryMonster comment in
  // useMonsters.ts). Only items and monsters have an embedding corpus among
  // the eight bulk-scope tables.
  if (table === "items") for (const id of insertedIds) queueItemEmbedding(id);
  if (table === "monsters") for (const id of insertedIds) queueMonsterEmbedding(id);

  return { copied: insertedIds.length, dropped: mergeDropped(dropped), needsSources };
}

export function useCopyToCampaign() {
  const queryClient = useQueryClient();
  const invalidateQuota = useInvalidateQuota();

  return useMutation({
    mutationFn: copyToCampaign,
    onSuccess: (_data, { table }) => {
      queryClient.invalidateQueries({ queryKey: [BULK_SCOPE_QUERY_KEY[table]] });
      // Only these two of the eight tables carry an enforce_quota trigger.
      if (table === "monsters" || table === "puzzle_rooms") invalidateQuota(table);
    },
  });
}
