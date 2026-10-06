import { ref } from "vue";
import { useQueryClient } from "@tanstack/vue-query";
import { edgeErrorMessage } from "@edge-shared/edgeError.ts";
import { supabase } from "@/lib/supabase";
import { reportHandledError } from "@/lib/observability/sentry";
import { startAiQuotes, stopAiQuotes } from "@/ai/aiGenerationState";
import { waitForImageJob } from "@/ai/useImageJob";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useLikenessGate } from "@/composables/ai/useLikenessGate";
import { useOutOfCredits } from "@/composables/ai/useOutOfCredits";
import { DOLL_ASK_ERROR, dollErrorMessage } from "@/composables/party/characterDollErrors";

/**
 * Manage a character's own paper doll from its portrait (#975). `make` starts
 * an async job, waits for completion, and invalidates the party caches so a
 * missed realtime event cannot leave the old doll on screen.
 * Also exposes ask/clear actions and reactive generation, request, and error state.
 */
export function useCharacterDoll() {
  const queryClient = useQueryClient();
  const { ensureLikenessAck } = useLikenessGate();
  const { costOf } = useAiCredits();
  const { requireCredits } = useOutOfCredits();

  const isGenerating = ref(false);
  const error = ref<string | null>(null);

  /**
   * Request a doll after likeness consent and the credit check, then wait for
   * the job and refresh party caches. Return false when already generating,
   * consent is declined, credits are insufficient, or generation/cache refresh
   * fails; caught failures also set `error`. Return true after refresh succeeds.
   */
  async function make(memberId: string): Promise<boolean> {
    if (isGenerating.value) return false;
    if (!(await ensureLikenessAck())) return false;
    if (!requireCredits(costOf("character_doll"), false)) return false;

    isGenerating.value = true;
    error.value = null;
    startAiQuotes("image");
    try {
      const { data, error: fnError } = await supabase.functions.invoke("generate-character-doll", {
        body: { party_member_id: memberId },
      });
      if (fnError) throw new Error(await edgeErrorMessage(fnError));
      const res = data as { job_id?: string; error?: string } | null;
      if (res?.error) throw new Error(res.error);
      if (!res?.job_id) throw new Error("The doll generator returned no job.");
      await waitForImageJob(res.job_id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["party"] }),
        queryClient.invalidateQueries({ queryKey: ["my-characters"] }),
      ]);
      return true;
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      error.value = dollErrorMessage(raw);
      reportHandledError(e, "useCharacterDoll.make", { memberId });
      return false;
    } finally {
      isGenerating.value = false;
      stopAiQuotes();
    }
  }

  /** Member ids with a set/clear of the ask in flight, so each button shows its own loading. */
  const pendingAskIds = ref<ReadonlySet<string>>(new Set());

  /**
   * Store an ISO request timestamp, or null to clear it, then refresh party
   * caches. Return false for a duplicate pending request or a caught update/
   * refresh failure; failures set `error`. `where` identifies the error context.
   */
  async function setAsk(memberId: string, requestedAt: string | null, where: string): Promise<boolean> {
    if (pendingAskIds.value.has(memberId)) return false;
    pendingAskIds.value = new Set(pendingAskIds.value).add(memberId);
    error.value = null;
    try {
      const { error: updateError } = await supabase
        .from("party_members")
        .update({ doll_requested_at: requestedAt })
        .eq("id", memberId);
      if (updateError) throw updateError;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["party"] }),
        queryClient.invalidateQueries({ queryKey: ["my-characters"] }),
      ]);
      return true;
    } catch (e) {
      error.value = DOLL_ASK_ERROR;
      reportHandledError(e, where, { memberId });
      return false;
    } finally {
      const next = new Set(pendingAskIds.value);
      next.delete(memberId);
      pendingAskIds.value = next;
    }
  }

  /** Ask the DM to draw the doll; resolve with whether the update and cache refresh succeeded. */
  const ask = (memberId: string) => setAsk(memberId, new Date().toISOString(), "useCharacterDoll.ask");
  /** Withdraw or decline an ask; resolve with whether the update and cache refresh succeeded. */
  const clearAsk = (memberId: string) => setAsk(memberId, null, "useCharacterDoll.clearAsk");
  /** Whether this instance has an ask update in flight for the member. */
  const isAskPending = (memberId: string) => pendingAskIds.value.has(memberId);

  return { isGenerating, error, make, ask, clearAsk, isAskPending };
}
