import { computed, ref } from "vue";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { queueEmbeddings } from "@/lib/queueEmbeddings";
import { useCampaignStore } from "@/stores/campaign";

/**
 * What this campaign has no usable vector for, so AI retrieval cannot see it
 * (#841, widened by #848).
 *
 * #841: `transfer_campaign_ownership` clones referenced items and NPCs into
 * the new owner's account rather than repointing them, and a clone is a
 * brand-new row with a brand-new id, so it has no row in its embedding side
 * table. Embed-on-write is a client-side hook that a `SECURITY DEFINER` SQL
 * function cannot reach, so the clone is invisible to every retrieval-backed
 * generator with no error anywhere. The decided fix is not to re-embed
 * automatically on transfer (a handed-over campaign is not settled content,
 * and spending the new DM's retrieval corpus on rows they have not looked at
 * yet is their call), so this composable backs an *offer*.
 *
 * #848: "no vector" was too narrow. A row that already had a vector keeps the
 * old one when an embed fails, or when the embed-text builder or the platform
 * embedding model changes, and the old vector then matches text the row no
 * longer holds. The missing-vector count could not see that. Sentry showed
 * zero loud embed failures in Sep-Oct 2026, so the realistic source is silent
 * drift, which only a comparison of the stored text hash against the row's
 * current text catches. That comparison lives in the `audit` mode of
 * `embed-content` and `embed-monsters`, which list each kind's `missing` and
 * `outdated` ids; this composable merges the two replies.
 *
 * Embedding is free (`ai_generation_credit_costs.entity_embedding` /
 * `monster_embedding` are both 0.00), so this never shows a credit cost.
 *
 * `EmbedStaleContentCard` (permanent, in the campaign's AI settings) and
 * `EmbedStaleContentBanner` (dismissible, on the dashboard) both call this
 * composable rather than running their own audit, so they can never show
 * divergent numbers or copy. The query itself is shared (TanStack Query
 * dedupes identical keys), but the run state (isRunning/progress) is a
 * MODULE-LEVEL singleton, same pattern as `useEmbeddingBackfill.ts`: there is
 * only ever one indexing run at a time, and if both surfaces are mounted at
 * once they must render the same run rather than risk two independent loops
 * hitting the same rows.
 */

const QUERY_KEY = "stale-embeddings";

export type StaleEmbeddingKind = "item" | "npc" | "faction" | "location" | "note" | "monster" | "quest";

export interface StaleEmbeddingRow {
  kind: StaleEmbeddingKind;
  /** Rows with no vector at all. */
  missing: number;
  /** Rows whose vector was built from text or a model they no longer have. */
  outdated: number;
  /** Missing ids first, then outdated ones: exactly what `many` mode is fed. */
  ids: string[];
}

export const STALE_EMBEDDING_KIND_LABELS: Record<StaleEmbeddingKind, string> = {
  item: "items",
  npc: "NPCs",
  faction: "factions",
  location: "locations",
  note: "notes",
  monster: "monsters",
  quest: "quests",
};

/** Stable display and run order, whatever order the functions answer in. */
const KIND_ORDER: StaleEmbeddingKind[] = ["item", "npc", "faction", "location", "note", "monster", "quest"];

interface AuditKind {
  kind: StaleEmbeddingKind;
  missing: string[];
  outdated: string[];
}

/** `skipped` is a child account: nothing is ever offered to one. */
type AuditReply = { kinds: AuditKind[] } | { skipped: string };

export interface IndexAllResult {
  indexed: number;
  failed: number;
  /** Left undone because the daily allowance ran out mid-run; 0 otherwise. */
  remaining: number;
}

async function audit(fn: "embed-content" | "embed-monsters", campaignId: string): Promise<AuditKind[]> {
  const { data, error } = await supabase.functions.invoke<AuditReply>(fn, {
    body: { mode: "audit", campaign_id: campaignId },
  });
  if (error) throw error;
  if (!data || "skipped" in data) return [];
  return data.kinds;
}

async function fetchStale(campaignId: string): Promise<StaleEmbeddingRow[]> {
  const [content, monsters] = await Promise.all([audit("embed-content", campaignId), audit("embed-monsters", campaignId)]);
  const rows = [...content, ...monsters].map<StaleEmbeddingRow>((entry) => ({
    kind: entry.kind,
    missing: entry.missing.length,
    outdated: entry.outdated.length,
    ids: [...entry.missing, ...entry.outdated],
  }));
  return rows
    .filter((row) => row.ids.length > 0)
    .sort((x, y) => KIND_ORDER.indexOf(x.kind) - KIND_ORDER.indexOf(y.kind));
}

// Module-level singleton run state — see the doc comment above for why.
const isRunning = ref(false);
const progressDone = ref(0);
const progressTotal = ref(0);
const lastResult = ref<IndexAllResult | null>(null);

export function useStaleEmbeddings() {
  const campaign = useCampaignStore();
  const queryClient = useQueryClient();

  const queryKey = computed(() => [QUERY_KEY, campaign.activeCampaignId] as const);

  const query = useQuery({
    queryKey,
    queryFn: ({ queryKey: [, campaignId] }) => {
      if (campaignId === null) throw new Error("useStaleEmbeddings fetched without an active campaign");
      return fetchStale(campaignId);
    },
    enabled: () => !!campaign.activeCampaignId,
    // Each fetch is two edge calls that rebuild every row's text to hash it.
    // Not live data, and indexAll invalidates it when it matters.
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const counts = computed<StaleEmbeddingRow[]>(() => query.data.value ?? []);
  const total = computed(() => counts.value.reduce((sum, row) => sum + row.ids.length, 0));
  const outdatedTotal = computed(() => counts.value.reduce((sum, row) => sum + row.outdated, 0));

  /**
   * Index every row this campaign is missing or has out of date, in batched `many` requests (up
   * to 100 rows each; monsters go to `embed-monsters`, the rest to
   * `embed-content`), strictly one request at a time so the provider is never
   * stampeded. A failed request is recorded and the run continues: "indexed
   * 34, 2 failed" is the normal outcome of many network calls, not a reason
   * to abort the rest. A failed batch counts every row in it as failed.
   */
  async function indexAll(): Promise<IndexAllResult> {
    if (isRunning.value) return { indexed: 0, failed: 0, remaining: 0 };
    const campaignId = campaign.activeCampaignId;
    if (!campaignId) return { indexed: 0, failed: 0, remaining: 0 };

    isRunning.value = true;
    progressDone.value = 0;
    lastResult.value = null;

    try {
      // Refetched here rather than trusting whatever the card/banner last
      // rendered: the offer can sit unacted-on for a while (dismissal is a
      // real answer, per #841), and re-checking right before spending N
      // network calls means a row embedded meanwhile by some other path
      // (another tab, a stray save) is not redundantly re-embedded.
      const fresh = await fetchStale(campaignId);
      const jobs = fresh.flatMap((row) => row.ids.map((id) => ({ kind: row.kind, id })));
      progressTotal.value = jobs.length;

      // Counted, not derived. An earlier cut computed `indexed` as
      // "attempted minus failed", which quietly counted the rate-limited row
      // as indexed — it was attempted, and it was not a failure. Three
      // outcomes need three counters.
      let indexed = 0;
      let failed = 0;
      let stopped = false;
      // Every kind goes through the batched many mode, one kind at a time and
      // up to 100 rows per request (#972), so progress moves a chunk at a time.
      for (const row of fresh) {
        if (stopped) break;
        const base = progressDone.value;
        const outcome = await queueEmbeddings(row.kind, row.ids, (handled) => {
          progressDone.value = base + handled;
        });
        // `processed` includes rows the server found already current (another
        // path embedded them meanwhile): neither a failure nor remaining.
        indexed += outcome.processed;
        failed += outcome.failed;
        // The ceiling applies to the account, not the row: the chunk it
        // rejected and everything after stay unindexed, and nothing more is sent.
        if (outcome.rateLimited) stopped = true;
        progressDone.value = base + outcome.processed + outcome.failed;
      }
      const result: IndexAllResult = {
        indexed,
        failed,
        // Everything still without a vector: the row the ceiling rejected and
        // every row after it. Not lost — they stay listed, and tomorrow's run
        // picks them up.
        remaining: jobs.length - indexed - failed,
      };
      lastResult.value = result;
      return result;
    } finally {
      isRunning.value = false;
      // Both surfaces read this one query key, so one invalidation updates
      // the card and the banner together — the whole point of sharing this
      // composable instead of each surface running its own count query.
      await queryClient.invalidateQueries({ queryKey: queryKey.value });
    }
  }

  return {
    counts,
    total,
    outdatedTotal,
    isLoading: query.isLoading,
    isError: query.isError,
    isRunning,
    progress: computed(() => ({ done: progressDone.value, total: progressTotal.value })),
    lastResult,
    indexAll,
  };
}
