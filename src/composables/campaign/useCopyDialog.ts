import { ref, type Ref } from "vue";
import { useToast } from "@/composables/useToast";

export interface CopyDialogOptions {
  /**
   * Called after the dialog closes on a quota_exceeded rejection, for the
   * surfaces with their own quota (monsters, puzzle_rooms) to open their
   * existing `showPaywall` ref — the paywall itself stays with the caller,
   * per `CopyToCampaignDialog`'s own docstring; this composable must not
   * own one.
   */
  onQuotaExceeded?: () => void;
}

export interface CopyDialog {
  copyOpen: Ref<boolean>;
  /** Toasts `message` as a success and closes the dialog. */
  finish: (message: string) => void;
  onQuotaExceeded: () => void;
}

/**
 * The open / success-toast-and-close / quota-paywall block that the bulk list
 * flow (`useCopyToCampaignFlow`) and the single-record flow
 * (`useCopyEntityToCampaign`) both end in. What differs between them (which
 * ids, what the toast says, whether selection mode ends) stays with each flow.
 *
 * Post-Mutation Navigation: deliberately does NOT navigate on success — see
 * the "Copy to campaign…" Sanctioned Exception in CLAUDE.md.
 */
export function useCopyDialog(options: CopyDialogOptions = {}): CopyDialog {
  const toast = useToast();
  const copyOpen = ref(false);

  function finish(message: string): void {
    toast.success(message);
    copyOpen.value = false;
  }

  function onQuotaExceeded(): void {
    copyOpen.value = false;
    options.onQuotaExceeded?.();
  }

  return { copyOpen, finish, onQuotaExceeded };
}
