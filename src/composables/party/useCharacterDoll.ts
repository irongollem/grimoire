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
 * Make a character's own paper doll from its portrait (#975). The function
 * answers at once with a job; the doll lands on `party_members.doll` when the
 * job settles (about 90 s), and the party caches are invalidated here as well
 * so a missed realtime event cannot leave the old doll on screen.
 */
export function useCharacterDoll() {
  const queryClient = useQueryClient();
  const { ensureLikenessAck } = useLikenessGate();
  const { costOf } = useAiCredits();
  const { requireCredits } = useOutOfCredits();

  const isGenerating = ref(false);
  const error = ref<string | null>(null);

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

  /** The player asks their DM to draw the doll. */
  const ask = (memberId: string) => setAsk(memberId, new Date().toISOString(), "useCharacterDoll.ask");
  /** The player takes the ask back, or the DM declines it: both clear it. */
  const clearAsk = (memberId: string) => setAsk(memberId, null, "useCharacterDoll.clearAsk");
  const isAskPending = (memberId: string) => pendingAskIds.value.has(memberId);

  return { isGenerating, error, make, ask, clearAsk, isAskPending };
}
