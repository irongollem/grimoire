import { computed, ref } from "vue";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";

/**
 * What a transferred (or otherwise stranded) campaign leaves unindexed for
 * AI retrieval (#841). `transfer_campaign_ownership` clones referenced items
 * and NPCs into the new owner's account rather than repointing them — the
 * old owner keeps their copy — and a clone is a brand-new row with a
 * brand-new id, so it has no matching row in its embedding side table.
 * Embed-on-write is a client-side hook (queueItemEmbedding, queueNpcEmbedding,
 * queueMonsterEmbedding) that a `SECURITY DEFINER` SQL function cannot reach,
 * so the clone is invisible to every retrieval-backed generator with no error
 * anywhere.
 *
 * The decided fix is not to re-embed automatically on transfer — a
 * handed-over campaign is not settled content, and spending the new DM's
 * retrieval corpus on rows they have not looked at yet is a judgement call
 * only they can make. So this composable backs an *offer*: how much is
 * unindexed right now, and a one-click action to index it.
 *
 * Defined as "everything in this campaign with no vector", not "rows the
 * last transfer cloned" (see get_unembedded_content_counts,
 * 20260907120124) — self-healing, and needs nothing recorded by the
 * transfer RPC itself.
 *
 * Embedding is free (`ai_generation_credit_costs.entity_embedding` /
 * `monster_embedding` are both 0.00) — this never shows a credit cost.
 *
 * `EmbedMissingContentCard` (permanent, in the campaign's AI settings) and
 * `EmbedMissingContentBanner` (dismissible, on the dashboard) both call this
 * composable rather than running their own count query, so they can never
 * show divergent numbers or copy. The counts query itself is naturally
 * shared — TanStack Query dedupes identical query keys across every
 * `useQuery` call — but the run state (isRunning/progress) is a MODULE-LEVEL
 * singleton, same pattern as `useEmbeddingBackfill.ts`: there is only ever
 * one indexing run at a time, and if both surfaces are mounted at once
 * (settings open in one tab, dashboard in another) they must render the same
 * run rather than risk two independent loops hitting the same rows.
 */

const QUERY_KEY = "unembedded-content-counts";

export type UnembeddedKind = "item" | "npc" | "faction" | "location" | "note" | "monster";

export interface UnembeddedCountRow {
  kind: UnembeddedKind;
  missing: number;
  ids: string[];
}

export const UNEMBEDDED_KIND_LABELS: Record<UnembeddedKind, string> = {
  item: "items",
  npc: "NPCs",
  faction: "factions",
  location: "locations",
  note: "notes",
  monster: "monsters",
};

export interface IndexAllResult {
  indexed: number;
  failed: number;
  /** Left undone because the daily allowance ran out mid-run; 0 otherwise. */
  remaining: number;
}

async function fetchCounts(campaignId: string): Promise<UnembeddedCountRow[]> {
  const { data, error } = await supabase.rpc("get_unembedded_content_counts", {
    p_campaign_id: campaignId,
  });
  if (error) throw error;
  return (data ?? []) as UnembeddedCountRow[];
}

/**
 * One row's embed call, routed to the edge function that owns its kind.
 * Monsters go through `embed-monsters` with `monster_id`; every other kind
 * shares `embed-content`'s registry via `entity` — same two functions as
 * `queueItemEmbedding` (useItems.ts) and `queueMonsterEmbedding`
 * (useMonsters.ts), just awaited here instead of fire-and-forget, so a
 * failure can be counted rather than silently swallowed.
 */
/** Thrown when the daily embedding allowance is spent — see RATE_LIMITS. */
class RateLimitedError extends Error {}

async function embedRow(kind: UnembeddedKind, id: string): Promise<void> {
  const { data, error } =
    kind === "monster"
      ? await supabase.functions.invoke("embed-monsters", { body: { mode: "single", monster_id: id } })
      : await supabase.functions.invoke("embed-content", { body: { mode: "single", entity: kind, id } });

  // A 429 is not a failure of this row — it is the account's daily ceiling,
  // and every remaining row would hit it too. Distinguished so the loop can
  // stop and say so, rather than grinding through a thousand more calls to
  // report a thousand mysterious failures. `functions.invoke` surfaces a
  // non-2xx as `error` with the body on `data`, so both are checked.
  const payload = (data ?? null) as { error?: unknown } | null;
  const rateLimited =
    payload?.error === "rate_limited" ||
    (error !== null && /rate.?limit|429/i.test(error.message ?? ""));
  if (rateLimited) throw new RateLimitedError("rate_limited");

  if (error) throw error;
}

// Module-level singleton run state — see the doc comment above for why.
const isRunning = ref(false);
const progressDone = ref(0);
const progressTotal = ref(0);
const lastResult = ref<IndexAllResult | null>(null);

export function useUnembeddedContent() {
  const campaign = useCampaignStore();
  const queryClient = useQueryClient();

  const queryKey = computed(() => [QUERY_KEY, campaign.activeCampaignId]);

  const query = useQuery({
    queryKey,
    queryFn: () => fetchCounts(campaign.activeCampaignId as string),
    enabled: () => !!campaign.activeCampaignId,
  });

  const counts = computed<UnembeddedCountRow[]>(() => query.data.value ?? []);
  const total = computed(() => counts.value.reduce((sum, row) => sum + row.missing, 0));

  /**
   * Index every row this campaign is missing, one edge-function call at a
   * time. Sequential, not `Promise.all` — this is N provider calls (one text
   * embedding request per row), and firing them all at once would stampede
   * whichever provider is configured with everything a large transfer left
   * unembedded in one burst. A failed row is recorded and the loop
   * continues: with N independent network calls, "indexed 34, 2 failed" is
   * the normal outcome, not an exceptional one worth aborting the rest over.
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
      const fresh = await fetchCounts(campaignId);
      const jobs = fresh.flatMap((row) => row.ids.map((id) => ({ kind: row.kind, id })));
      progressTotal.value = jobs.length;

      // Counted, not derived. An earlier cut computed `indexed` as
      // "attempted minus failed", which quietly counted the rate-limited row
      // as indexed — it was attempted, and it was not a failure. Three
      // outcomes need three counters.
      let indexed = 0;
      let failed = 0;
      for (const job of jobs) {
        try {
          await embedRow(job.kind, job.id);
          indexed += 1;
        } catch (e) {
          // The ceiling applies to the account, not the row, so continuing
          // would just spend the rest of the list on certain rejections.
          if (e instanceof RateLimitedError) break;
          failed += 1;
        } finally {
          progressDone.value += 1;
        }
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
    isLoading: query.isLoading,
    isRunning,
    progress: computed(() => ({ done: progressDone.value, total: progressTotal.value })),
    lastResult,
    indexAll,
  };
}
