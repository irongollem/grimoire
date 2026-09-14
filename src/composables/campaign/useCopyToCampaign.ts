import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useInvalidateQuota } from "@/composables/billing/useQuota";
import { queueItemEmbedding } from "@/composables/items/useItems";
import { queueMonsterEmbedding } from "@/composables/monsters/useMonsters";
import { chunkArray } from "@/lib/utils";
import { BULK_SCOPE_QUERY_KEY, type BulkScopeTable } from "@/composables/campaign/useBulkCampaignScope";
import { buildCopyPlan, libraryReferencedIds, referencedIds, type DroppedReference, type ReferencedRow } from "@/lib/campaign/copyToCampaign";

/**
 * The copy-to-campaign mutation (#598, wave 1; reworked #875 wave 2 to fetch
 * sources once and plan per target purely — see `loadCopySources`/
 * `planCopyFor` below). Copies a selection of rows from one of the eight
 * bulk-scope tables into another campaign the account DMs (or into "every
 * campaign", targetCampaignId null). The planning — what to drop, what to
 * clear, what travels — lives in `copyToCampaign.ts`; this module only
 * fetches what that planner needs and performs the write.
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

/** How many `queueItemEmbedding`/`queueMonsterEmbedding` calls to fire before
 *  yielding to the next group — see `queueEmbeddingsInGroups` below. */
const EMBED_GROUP_SIZE = 10;

export interface LoadCopySourcesInput {
  table: BulkScopeTable;
  ids: readonly string[];
}

/**
 * Everything a copy plan needs that does NOT depend on which target campaign
 * is picked: the source rows themselves, every row they reference (so
 * visibility in any candidate target is decidable locally, no further
 * fetch), and the account doing the copying. Fetched once when the dialog
 * opens; `planCopyFor` below can then be called synchronously for however
 * many times the DM changes the target picker.
 */
export interface CopySources {
  table: BulkScopeTable;
  sourceRows: Record<string, unknown>[];
  referenced: ReadonlyMap<string, ReferencedRow>;
  userId: string;
}

export interface CopyPlanForTarget {
  payloads: Record<string, unknown>[];
  dropped: DroppedReference[];
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

export interface CopyToCampaignInput {
  table: BulkScopeTable;
  /** Already-planned insert payloads for the chosen target, from `planCopyFor`. */
  payloads: Record<string, unknown>[];
  /** The plan's own drop report, carried straight through to the result — the
   *  write does not change what was dropped, only whether it happened. */
  dropped: DroppedReference[];
  /** The plan's own unenabled-sources notice, carried straight through. */
  needsSources: LibrarySourceNotice | null;
}

export interface CopyToCampaignResult {
  copied: number;
  dropped: DroppedReference[];
  needsSources: LibrarySourceNotice | null;
}

async function fetchRows(table: string, ids: readonly string[], columns: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (const chunk of chunkArray(ids, CHUNK_SIZE)) {
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
 *  costs one request per distinct referenced table, not one per row. The
 *  per-table reads run concurrently: nothing here depends on another
 *  referenced table's result. */
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
  const results = await Promise.all(
    [...idsByTable].map(([refTable, idSet]) => fetchRows(refTable, [...idSet], "id, name, campaign_id")),
  );
  for (const rows of results) {
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
      byLabel.set(entry.label, {
        label: entry.label,
        names: [...entry.names],
        removedEntries: entry.removedEntries,
        entryNoun: entry.entryNoun,
      });
    }
  }
  return [...byLabel.values()];
}

/**
 * Fetches everything a copy plan needs that does not depend on the target
 * campaign: the source rows (`select *`) and every row they reference. Called
 * once when the copy dialog opens — `planCopyFor` can then run synchronously
 * for each target the DM tries in the picker, with no further request.
 */
export async function loadCopySources({ table, ids }: LoadCopySourcesInput): Promise<CopySources> {
  const sourceRows = await fetchRows(table, ids, "*");
  const referenced = await resolveReferencedRows(table, sourceRows);
  // The copy is owned by whoever is copying (see buildCopyPlan). No session
  // means no owner to give it, and RLS would reject the insert anyway — say
  // so here rather than letting a non-null assertion throw a TypeError two
  // frames later with nothing in it a reader can act on.
  const user = getCurrentUser();
  if (!user) throw new Error("Sign in again to copy content to another campaign.");
  return { table, sourceRows, referenced, userId: user.id };
}

/**
 * Pure: plans every source row's copy against one target campaign. No
 * fetching — `sources.referenced` already carries enough (each row's own
 * `campaignId`) to decide visibility in ANY target locally, which is what
 * lets this run synchronously every time the DM changes the picker.
 */
export function planCopyFor(sources: CopySources, targetCampaignId: string | null): CopyPlanForTarget {
  const payloads: Record<string, unknown>[] = [];
  const dropped: DroppedReference[] = [];
  for (const row of sources.sourceRows) {
    const plan = buildCopyPlan(sources.table, row, targetCampaignId, sources.userId, sources.referenced);
    payloads.push(plan.payload);
    dropped.push(...plan.dropped);
  }
  return { payloads, dropped: mergeDropped(dropped) };
}

/**
 * Every shared-library row this copy carries whose source the target campaign
 * has not enabled. One `library_spells` read and one `campaign_enabled_sources`
 * read, both skipped entirely when nothing in the selection points at library
 * content — which is the ordinary case. Stays async and per-target (unlike
 * `planCopyFor`) because it is the one part of the preview that genuinely
 * depends on a fetch the target's own id gates.
 */
export async function resolveUnenabledSources(
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
 * Queues the embed call for each id, at most `EMBED_GROUP_SIZE` in flight: a
 * group is started only once every call in the previous group has settled.
 * `queueItemEmbedding`/`queueMonsterEmbedding` report their own failures and
 * resolve either way, so a rejected embed never stops the rest of the queue.
 * Without this a 150-row copy opened 150 edge-function invocations at once.
 */
async function queueEmbeddingsInGroups(
  ids: readonly string[],
  queue: (id: string) => Promise<void>,
): Promise<void> {
  for (const group of chunkArray(ids, EMBED_GROUP_SIZE)) {
    await Promise.all(group.map((id) => queue(id)));
  }
}

async function copyToCampaign(input: CopyToCampaignInput): Promise<CopyToCampaignResult> {
  const { table, payloads, dropped, needsSources } = input;

  const insertedIds: string[] = [];
  // One background chain for the whole copy, so the in-flight bound holds
  // across chunks too. Never awaited by the copy itself: the rows exist once
  // the inserts commit, and making the DM wait on ~20 sequential embed groups
  // would turn a two-second copy into a minute for no feedback they can use.
  let embedding: Promise<void> = Promise.resolve();
  for (const chunk of chunkArray(payloads, CHUNK_SIZE)) {
    if (!chunk.length) continue;
    // A quota_exceeded error from the enforce_quota trigger (monsters,
    // puzzle_rooms) rejects here uncaught — the caller turns it into the
    // paywall, this mutation does not own that decision.
    const { data, error } = await supabase.from(table).insert(chunk).select("id");
    if (error) throw error;
    const chunkIds = (data ?? []).map((r) => r.id as string);
    insertedIds.push(...chunkIds);

    // Bulk insert bypasses the owning composable's create-mutation hook, so
    // each new row needs its own embed call — otherwise these rows stay
    // unretrievable until the next admin backfill (mirrors useNpcs.ts:409 and
    // useLocations.ts:513). Queued right after THIS chunk's insert succeeds,
    // not after the whole loop, so a later chunk's failure cannot leave an
    // earlier chunk's rows unembedded. Only items and monsters have an
    // embedding corpus among the eight bulk-scope tables.
    if (table === "items") embedding = embedding.then(() => queueEmbeddingsInGroups(chunkIds, queueItemEmbedding));
    if (table === "monsters") embedding = embedding.then(() => queueEmbeddingsInGroups(chunkIds, queueMonsterEmbedding));
  }
  void embedding;

  return { copied: insertedIds.length, dropped, needsSources };
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
