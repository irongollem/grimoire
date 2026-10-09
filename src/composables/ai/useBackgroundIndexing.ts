import { onScopeDispose, watch, type Ref } from "vue";
import { supabase } from "@/lib/supabase";
import { queueEmbeddings, type EmbedManyEntity } from "@/lib/queueEmbeddings";
import { afterFirstPaint } from "@/lib/afterFirstPaint";
import { reportHandledError } from "@/lib/observability/sentry";
import { useCampaignStore } from "@/stores/campaign";

/**
 * Keeps a campaign's search index whole without asking the DM.
 *
 * Saving a record already embeds it (embed-on-write), whatever the plan or the
 * campaign's AI switch (context/compliance/ai-act.md: indexing is not
 * generation). What that misses is content that never went through a save:
 * rows `transfer_campaign_ownership` clones in SQL (#841), content from before
 * a kind was indexed, a vector left behind by a failed embed, and every row
 * after the embed-text builder or the platform embedding model changes (#848).
 *
 * Those used to wait on an offer, a card in Settings → AI and a dashboard
 * banner with an "Index these" button. The maintainer retired it on 9 Oct 2026:
 * search by meaning helps every DM, not only those who generate, and the offer
 * asked a question in vocabulary ("indexing", "vectors") no DM should need.
 * That reverses #841's call that indexing a handed-over campaign was the new
 * DM's to make; it costs them nothing (0 credits, the platform key) and the
 * index only ever serves their own search and retrieval.
 *
 * So when a DM opens a campaign, once per campaign per session and only after
 * the page has painted, the same audit the offer ran (`embed-content` /
 * `embed-monsters` in `audit` mode, which compare each row's text hash and the
 * model against its vector) lists what is missing or out of date, and it is
 * embedded in `many` batches, one request at a time. The daily allowance
 * stopping a large backlog is not an error: search falls back to keywords
 * meanwhile, and the next session picks up where this one stopped.
 */

const KIND_ORDER: EmbedManyEntity[] = ["item", "npc", "faction", "location", "note", "monster", "quest"];

interface AuditKind {
  kind: EmbedManyEntity;
  missing: string[];
  outdated: string[];
}

/** `skipped` is a child account, which is never indexed. */
type AuditReply = { kinds: AuditKind[] } | { skipped: string };

async function audit(fn: "embed-content" | "embed-monsters", campaignId: string): Promise<AuditKind[]> {
  const { data, error } = await supabase.functions.invoke<AuditReply>(fn, {
    body: { mode: "audit", campaign_id: campaignId },
  });
  if (error) throw error;
  if (!data || "skipped" in data) return [];
  return data.kinds;
}

export interface IndexCampaignResult {
  indexed: number;
  failed: number;
  /** Left for a later session because the daily allowance ran out; 0 otherwise. */
  remaining: number;
}

/** Embed everything this campaign has no current vector for. Rejects only when the audit itself fails. */
export async function indexCampaign(campaignId: string): Promise<IndexCampaignResult> {
  const [content, monsters] = await Promise.all([
    audit("embed-content", campaignId),
    audit("embed-monsters", campaignId),
  ]);
  const stale = [...content, ...monsters]
    .map((entry) => ({ kind: entry.kind, ids: [...entry.missing, ...entry.outdated] }))
    .filter((entry) => entry.ids.length > 0)
    .sort((x, y) => KIND_ORDER.indexOf(x.kind) - KIND_ORDER.indexOf(y.kind));

  const total = stale.reduce((sum, entry) => sum + entry.ids.length, 0);
  let indexed = 0;
  let failed = 0;
  for (const entry of stale) {
    const outcome = await queueEmbeddings(entry.kind, entry.ids);
    // `processed` includes rows another path embedded meanwhile.
    indexed += outcome.processed;
    failed += outcome.failed;
    // The ceiling is the account's: every later batch would hit it too.
    if (outcome.rateLimited) break;
  }
  return { indexed, failed, remaining: total - indexed - failed };
}

/** Campaigns this session has already started indexing; a reload starts afresh. */
const started = new Set<string>();
/** One run at a time, so two campaigns opened in quick succession never interleave their batches. */
let queue: Promise<unknown> = Promise.resolve();

/** For tests: forget which campaigns this session has indexed. */
export function resetBackgroundIndexing() {
  started.clear();
  queue = Promise.resolve();
}

/** For tests: settles once every run started so far has finished. */
export function backgroundIndexingSettled(): Promise<unknown> {
  return queue;
}

/**
 * Index the active campaign in the background while `isDm` holds. Called once,
 * from the DM layout. Players never run it: the audit is DM-only, and player
 * content is never indexed (context/features/world-building.md).
 */
export function useBackgroundIndexing(isDm: Readonly<Ref<boolean>>) {
  const campaign = useCampaignStore();
  let cancel: (() => void) | null = null;

  watch(
    [() => campaign.activeCampaignId, isDm],
    ([campaignId, dm]) => {
      cancel?.();
      cancel = null;
      if (!dm || !campaignId || started.has(campaignId)) return;
      cancel = afterFirstPaint(() => {
        cancel = null;
        if (started.has(campaignId)) return;
        started.add(campaignId);
        queue = queue.then(() =>
          indexCampaign(campaignId).catch((error: unknown) => {
            reportHandledError(error, "background-indexing", { campaignId });
          }),
        );
      }, 10_000);
    },
    { immediate: true },
  );

  onScopeDispose(() => cancel?.());
}
