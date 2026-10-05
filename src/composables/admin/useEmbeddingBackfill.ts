import { ref } from "vue";
import { supabase } from "@/lib/supabase";

// Shared driver for the semantic-search batch backfill: monsters (#595),
// campaign entities -- NPCs, factions, locations and notes (#600) -- and both
// item corpora (#602). Each edge function only does ONE bounded batch per call
// (see supabase/functions/embed-monsters and embed-content, handleBatch) --
// someone has to call it repeatedly until `remaining` hits zero, for every
// target in turn.
//
// State is a MODULE-LEVEL singleton (same pattern as useConfirm.ts's dialog
// ref) rather than per-composable-call refs: there is only ever one backfill
// run at a time, and it can be started either from the standalone "Re-embed"
// button (MonsterEmbeddingBackfill.vue) or automatically after a
// vendor/model change (EmbeddingVendorControl.vue). Sharing the refs is what
// makes "one continuous progress state across every target" literally true --
// both components render the same run instead of two independent copies
// that could drift or double-run.

export type EmbedTarget =
  | "library" | "custom" | "npc" | "faction" | "location" | "note" | "item" | "library_item";

export const EMBED_TARGETS: readonly EmbedTarget[] =
  ["library", "custom", "npc", "faction", "location", "note", "item", "library_item"];
export const EMBED_TARGET_LABELS: Record<EmbedTarget, string> = {
  library: "library monsters (shared bestiary)",
  custom: "custom monsters (per-user)",
  npc: "NPCs",
  faction: "factions",
  location: "locations",
  note: "notes (sessions & chronicles)",
  item: "vault items (per-user)",
  library_item: "library items (shared vault)",
};

// The two monster targets go through embed-monsters (body param `target`);
// every other target shares embed-content (body param `entity`, #600/#602)
// -- same batch response shape, different edge function.
const MONSTER_TARGETS = new Set<EmbedTarget>(["library", "custom"]);

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
/**
 * What a failed or stopped run leaves behind. Semantic search filters on the
 * embedding model, never on whether the text changed: after a model switch a
 * row not yet redone is left out, after a text change it keeps matching on its
 * previous vector. The old wording claimed every waiting row was skipped.
 */
const WAITING_ROWS_NOTE =
  "The provider config is already saved. Until you retry, rows embedded with a different model are left out " +
  "of semantic search, and rows whose text changed keep matching on their previous embedding.";

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

/** One bounded batch call for `target`, routed to the edge function that owns it. */
function invokeBatch(target: EmbedTarget, limit: number) {
  return MONSTER_TARGETS.has(target)
    ? supabase.functions.invoke("embed-monsters", { body: { mode: "batch", target, limit } })
    : supabase.functions.invoke("embed-content", { body: { mode: "batch", entity: target, limit } });
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

        const { data, error } = await invokeBatch(target, BATCH_LIMIT);
        if (error) {
          // The config change (if any) that led here is already committed --
          // it is not rolled back by a backfill failure. Degraded but safe,
          // not broken: see WAITING_ROWS_NOTE for what waiting rows do.
          errorMsg.value =
            `Failed on ${EMBED_TARGET_LABELS[target]}: ${await extractErrorMessage(error)}. ${WAITING_ROWS_NOTE}`;
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
            `try again. ${WAITING_ROWS_NOTE}`;
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
            `Stopped after ${totalProcessed.value} row${totalProcessed.value === 1 ? "" : "s"} re-embedded. ` +
            `${WAITING_ROWS_NOTE} Safe to resume any time: click Re-embed again.`,
        }
      : { kind: "success", text: `Done -- ${totalProcessed.value} row${totalProcessed.value === 1 ? "" : "s"} re-embedded across all ${EMBED_TARGETS.length} tables.` };
  } catch (err) {
    errorMsg.value =
      `${err instanceof Error ? err.message : "Backfill failed."} ${WAITING_ROWS_NOTE}`;
  } finally {
    isRunning.value = false;
    currentTarget.value = null;
  }
}

export function useEmbeddingBackfill() {
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
