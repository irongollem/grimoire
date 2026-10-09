import { ref, type Ref } from "vue";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useToast } from "@/composables/useToast";

// Module-level singleton, like useConfirm: one dialog, mounted once in App.vue,
// opened from any generator. Holds the credits the blocked action needed.
const needed = ref<number | null>(null);

/**
 * Read-only view of the open state for App.vue's dialog shell. Exported apart
 * from `useOutOfCredits()` on purpose (#999): that composable calls
 * `useAiCredits()`, which issues the balance, bucket and cost queries, and the
 * shell is mounted for every signed-in user on every page. The shell only needs
 * to know whether the dialog is open; the queries belong where AI is used.
 */
export const outOfCreditsNeeded: Readonly<Ref<number | null>> = needed;

/**
 * The credit gate every AI action goes through before it spends anything.
 *
 * `requireCredits(cost, byok)` returns true when the action may run; otherwise
 * it opens the "not enough credits" dialog and returns false. The dialog lets
 * the DM buy a pack on the spot (and, on Free, subscribe) — being blocked
 * mid-prep is exactly when they want to buy, and a disabled button that sends
 * them hunting for Billing loses that moment. A generate button therefore stays
 * clickable when the balance is short; the click is what opens the dialog.
 *
 * A null cost is a price that is not known yet (`useCampaignProviders` before
 * provider_config loads, or with no provider the campaign could use). The
 * action is refused with a toast rather than sent to a server that would only
 * answer "not available". A read that failed recovers by itself: TanStack
 * refetches an errored query with no data when the next component mounts it
 * and on window focus.
 */
export function useOutOfCredits() {
  const { affordable } = useAiCredits();
  const toast = useToast();

  function openOutOfCredits(credits: number) {
    needed.value = credits;
  }

  function requireCredits(credits: number | null, byok = false): boolean {
    if (credits === null) {
      toast.error("AI generation isn't available right now. Try again in a moment.");
      return false;
    }
    if (affordable(credits, byok)) return true;
    openOutOfCredits(credits);
    return false;
  }

  function closeOutOfCredits() {
    needed.value = null;
  }

  return { needed, requireCredits, openOutOfCredits, closeOutOfCredits };
}
