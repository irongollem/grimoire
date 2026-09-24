import { ref } from "vue";
import { useAiCredits } from "@/composables/ai/useAiCredits";

// Module-level singleton, like useConfirm: one dialog, mounted once in App.vue,
// opened from any generator. Holds the credits the blocked action needed.
const needed = ref<number | null>(null);

/**
 * The credit gate every AI action goes through before it spends anything.
 *
 * `requireCredits(cost, byok)` returns true when the action may run; otherwise
 * it opens the "not enough credits" dialog and returns false. The dialog lets
 * the DM buy a pack on the spot (and, on Free, subscribe) — being blocked
 * mid-prep is exactly when they want to buy, and a disabled button that sends
 * them hunting for Billing loses that moment. A generate button therefore stays
 * clickable when the balance is short; the click is what opens the dialog.
 */
export function useOutOfCredits() {
  const { affordable } = useAiCredits();

  function openOutOfCredits(credits: number) {
    needed.value = credits;
  }

  function requireCredits(credits: number, byok = false): boolean {
    if (affordable(credits, byok)) return true;
    openOutOfCredits(credits);
    return false;
  }

  function closeOutOfCredits() {
    needed.value = null;
  }

  return { needed, requireCredits, openOutOfCredits, closeOutOfCredits };
}
