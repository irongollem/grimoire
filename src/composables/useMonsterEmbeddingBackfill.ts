import { ref } from "vue";
import { supabase } from "@/lib/supabase";

// Shared driver for the embed-monsters batch backfill (#595). The edge
// function itself only does ONE bounded batch per call (see
// supabase/functions/embed-monsters/index.ts, handleBatch) -- someone has to
// call it repeatedly until `remaining` hits zero, for both monster tables.
// At 100 rows/call and ~3,600 total monsters that is dozens of round trips,
// so this is a real feature, not a manual curl loop.
//
// State is a MODULE-LEVEL singleton (same pattern as useConfirm.ts's dialog
// ref) rather than per-composable-call refs: there is only ever one backfill
// run at a time, and it can be started either from the standalone "Re-embed
// monsters" button (MonsterEmbeddingBackfill.vue) or automatically after a
// vendor/model change (EmbeddingVendorControl.vue). Sharing the refs is what
// makes "one continuous progress state across both phases" literally true --
// both components render the same run instead of two independent copies
// that could drift or double-run.

export type EmbedTarget = "library" | "custom";

export const EMBED_TARGETS: readonly EmbedTarget[] = ["library", "custom"];
export const EMBED_TARGET_LABELS: Record<EmbedTarget, string> = {
  library: "library monsters (shared bestiary)",
  custom: "custom monsters (per-user)",
};

export const BATCH_LIMIT = 100;

interface EmbedBatchResponse {
  processed: number;
  skipped: number;
  remaining: number;
}

export interface BackfillResult {
  kind: "success" | "stopped";
  text: string;
}

const isRunning = ref(false);
const stopRequested = ref(false);
const errorMsg = ref<string | null>(null);
const resultMessage = ref<BackfillResult | null>(null);
const currentTarget = ref<EmbedTarget | null>(null);
const processedThisTarget = ref(0);
const remainingThisTarget = ref<number | null>(null);
const totalProcessed = ref(0);

/** Reads {error, detail} off a FunctionsHttpError body, falling back to the
 * generic message. Deliberately not the shared edgeErrorMessage() helper --
 * that one's vocabulary (account_suspended, rate_limited, insufficient_credits)
 * is for user-facing generation errors; this admin-only endpoint's own error
 * shape (`embedding_provider_unavailable` + a `detail` string, see
 * resolveEmbeddingProvider) needs `detail` surfaced, which the generic helper
 * discards. */
async function extractErrorMessage(err: unknown): Promise<string> {
  const fnError = err as { message?: string; context?: Response };
  let body: { error?: string; detail?: string; message?: string } | null = null;
  try {
    body = (await fnError.context?.json()) ?? null;
  } catch {
    /* response had no JSON body */
  }
  return body?.detail ?? body?.error ?? body?.message ?? fnError.message ?? "The request failed.";
}

function stopBackfill() {
  stopRequested.value = true;
}

async function runBackfill(): Promise<void> {
  if (isRunning.value) return;
  isRunning.value = true;
  stopRequested.value = false;
  errorMsg.value = null;
  resultMessage.value = null;
  totalProcessed.value = 0;

  try {
    for (const target of EMBED_TARGETS) {
      if (stopRequested.value) break;
      currentTarget.value = target;
      processedThisTarget.value = 0;
      remainingThisTarget.value = null;
      let prevRemaining: number | null = null;

      for (;;) {
        if (stopRequested.value) break;

        const { data, error } = await supabase.functions.invoke("embed-monsters", {
          body: { mode: "batch", target, limit: BATCH_LIMIT },
        });
        if (error) {
          // The config change (if any) that led here is already committed --
          // it is not rolled back by a backfill failure. Un-re-embedded rows
          // are simply ineligible for semantic search (they fall back to the
          // compact candidate list, exactly like a monster that was never
          // embedded) until the backfill is retried, so this is degraded but
          // safe, not broken.
          errorMsg.value =
            `Failed on ${EMBED_TARGET_LABELS[target]}: ${await extractErrorMessage(error)}. ` +
            "The provider config is already saved -- monsters not yet re-embedded are simply skipped by " +
            "semantic search until you retry.";
          return;
        }
        const res = data as EmbedBatchResponse;

        // Nothing progressed and there is still declared work left: something
        // is wrong upstream (no/misconfigured embedding provider, missing
        // platform key, ...) rather than merely slow. Stop instead of
        // spinning forever -- a loop that never terminates in an admin panel
        // is worse than a visible error.
        if (prevRemaining !== null && res.processed === 0 && res.remaining === prevRemaining && res.remaining > 0) {
          errorMsg.value =
            `No progress on ${EMBED_TARGET_LABELS[target]} (0 processed, ${res.remaining} still remaining). ` +
            "Check that exactly one embedding provider is enabled above with a platform key configured, then " +
            "try again. The provider config is already saved -- un-re-embedded rows are simply skipped by " +
            "semantic search in the meantime.";
          return;
        }

        processedThisTarget.value += res.processed;
        totalProcessed.value += res.processed;
        remainingThisTarget.value = res.remaining;
        prevRemaining = res.remaining;

        if (res.remaining <= 0) break;
      }
    }

    resultMessage.value = stopRequested.value
      ? {
          kind: "stopped",
          text:
            `Stopped after ${totalProcessed.value} monster${totalProcessed.value === 1 ? "" : "s"} re-embedded. ` +
            "The provider config is already saved -- monsters not yet re-embedded are simply skipped by semantic " +
            "search (falling back to the compact candidate list) until you resume. Safe to resume any time -- " +
            "click Re-embed monsters again.",
        }
      : { kind: "success", text: `Done -- ${totalProcessed.value} monster${totalProcessed.value === 1 ? "" : "s"} re-embedded across both tables.` };
  } catch (err) {
    errorMsg.value =
      (err instanceof Error ? err.message : "Backfill failed.") +
      " The provider config is already saved -- monsters not yet re-embedded are simply skipped by semantic " +
      "search until the backfill is retried.";
  } finally {
    isRunning.value = false;
    currentTarget.value = null;
  }
}

export function useMonsterEmbeddingBackfill() {
  return {
    isRunning,
    stopRequested,
    errorMsg,
    resultMessage,
    currentTarget,
    processedThisTarget,
    remainingThisTarget,
    totalProcessed,
    runBackfill,
    stopBackfill,
  };
}
