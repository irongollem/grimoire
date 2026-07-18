import { ref } from "vue";
import { useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { edgeErrorMessage } from "@/lib/edgeError";
import { waitForImageJob } from "@/ai/useImageJob";
import { waitForRow } from "@/ai/waitForRow";
import type { Mini, MiniFormat, MiniSourceTable, MiniStatus } from "@/types/mini.types";

export interface StylizeInput {
  campaign_id: string;
  source_table: MiniSourceTable;
  source_id: string;
  format: MiniFormat;
  /** Resume an existing mini (re-roll / tweak) instead of creating a new one. */
  mini_id?: string;
  instructions?: string;
}

interface StylizeResponse {
  mini_id: string;
  job_id: string;
}

interface ActionResponse {
  mini_id: string;
  status: MiniStatus;
}

// 15 min: real Meshy tasks run multi-minute; the pg_cron poller (every 1 min)
// is the authority that fails a truly-stuck sculpt, so the client window is
// generous — it should never "time out" a job that's about to succeed.
const SCULPT_TIMEOUT_MS = 15 * 60 * 1000;
const SCULPT_POLL_MS = 4_000;

/**
 * Waits for a `minis` row to leave the sculpting/downloading states. Realtime
 * UPDATE subscription + 4s poll fallback via waitForRow — select "*" so the
 * resolved row is the full mini, ready to hand straight back to the caller.
 * Resolves with the full mini row on "ready", rejects on "failed" or timeout.
 */
export function waitForSculpt(miniId: string): Promise<Mini> {
  return waitForRow<Mini>({
    table: "minis",
    id: miniId,
    select: "*",
    resolveWhen: (row) => row.status === "ready",
    rejectWhen: (row) => (row.status === "failed" ? (row.error ?? "The sculpt failed.") : null),
    timeoutMs: SCULPT_TIMEOUT_MS,
    timeoutMessage: "The sculpt is taking longer than expected. It may still finish — check back on this mini shortly.",
    pollIntervalMs: SCULPT_POLL_MS,
  });
}

// forge-mini returns its structured reasons on non-2xx responses, which
// supabase.functions.invoke surfaces via `error` (data is null) — so this maps
// the code AFTER edgeErrorMessage extracts it from the response body. Unknown
// strings (incl. edgeErrorMessage's own friendly sentences) pass through.
function friendlyError(error: string): string {
  switch (error) {
    case "no_portrait":
      return "This entity has no portrait yet — add one before forging a mini.";
    case "invalid_state":
      return "This mini isn't in a state that allows that action right now.";
    case "meshy_unavailable":
      return "The sculpting service is temporarily unavailable. Please try again shortly.";
    case "feature_disabled":
      return "The Simulacrum ritual isn't open yet.";
    default:
      return error;
  }
}

/** Thin client for the forge-mini edge function (stylize/sculpt/resculpt/cancel/delete). */
export function useMiniForge() {
  const queryClient = useQueryClient();

  const isStylizing = ref(false);
  const isSculpting = ref(false);
  const isCancelling = ref(false);

  function invalidateMini(miniId: string) {
    void queryClient.invalidateQueries({ queryKey: ["minis", miniId] });
    void queryClient.invalidateQueries({ queryKey: ["minis"] });
  }

  /** Kicks off (or re-rolls) the stylized 2D render and waits for the image job to settle. */
  async function stylize(input: StylizeInput): Promise<Mini> {
    isStylizing.value = true;
    try {
      const { data, error } = await supabase.functions.invoke("forge-mini", {
        body: { action: "stylize", ...input },
      });
      if (error) throw new Error(friendlyError(await edgeErrorMessage(error)));
      const res = data as StylizeResponse;

      await waitForImageJob(res.job_id);

      const { data: mini, error: fetchError } = await supabase
        .from("minis")
        .select("*")
        .eq("id", res.mini_id)
        .single();
      if (fetchError) throw fetchError;

      invalidateMini(res.mini_id);
      return mini as Mini;
    } finally {
      isStylizing.value = false;
    }
  }

  /** Fires a sculpt-flavored request — does NOT wait for completion. Call waitForSculpt separately. */
  async function runSculptAction(action: "sculpt" | "resculpt", miniId: string): Promise<ActionResponse> {
    isSculpting.value = true;
    try {
      const { data, error } = await supabase.functions.invoke("forge-mini", {
        body: { action, mini_id: miniId },
      });
      if (error) throw new Error(friendlyError(await edgeErrorMessage(error)));
      invalidateMini(miniId);
      return data as ActionResponse;
    } finally {
      isSculpting.value = false;
    }
  }

  /** The paid first sculpt (reserves mini_sculpt credits, creates the Meshy task). */
  const sculpt = (miniId: string) => runSculptAction("sculpt", miniId);
  /** Free re-sculpt (capped at MAX_SCULPTS). */
  const resculpt = (miniId: string) => runSculptAction("resculpt", miniId);

  /**
   * Abandon an in-flight sculpt, dropping back to image_ready. NOT a refund:
   * the hold settles as a real charge and the attempt counts against the cap
   * (refund policy — credits only come back when the failure is ours). Any
   * future Cancel button must say so.
   */
  async function cancel(miniId: string): Promise<void> {
    isCancelling.value = true;
    try {
      const { error } = await supabase.functions.invoke("forge-mini", {
        body: { action: "cancel", mini_id: miniId },
      });
      if (error) throw new Error(friendlyError(await edgeErrorMessage(error)));
      invalidateMini(miniId);
    } finally {
      isCancelling.value = false;
    }
  }

  return {
    stylize,
    sculpt,
    resculpt,
    cancel,
    waitForSculpt,
    isStylizing,
    isSculpting,
    isCancelling,
  };
}
