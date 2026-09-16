import { ref, type Ref } from "vue";
import { useToast } from "@/composables/useToast";
import { pluralizeCount } from "@/lib/utils";

export interface CopyToCampaignFlowOptions {
  /** Singular noun for the toast, e.g. "monster". */
  noun: string;
  /** Plural, for a noun `${noun}s` gets wrong — "species" is its own plural. */
  nounPlural?: string;
  /**
   * What could be selected right now: the same set the bar counts. A getter,
   * because the five lists reach it differently (a child component ref on
   * two of them, a local computed on two, a prop on one) — reading it lazily
   * here means `openCopy` always prunes against the current value rather
   * than one captured when the flow was set up.
   */
  selectableIds: () => readonly string[];
  /** This list's own `useBulkSelection` handles. */
  pruneTo: (ids: readonly string[]) => string[];
  stop: () => void;
  /**
   * Called after the dialog closes on a quota_exceeded rejection. Only the
   * two surfaces with their own quota (monsters, puzzle_rooms) need to pass
   * this, to open their existing `showPaywall` ref — the paywall itself
   * stays with the caller, per `CopyToCampaignDialog`'s own docstring; this
   * composable must not own one.
   */
  onQuotaExceeded?: () => void;
}

export interface CopyToCampaignFlow {
  copyOpen: Ref<boolean>;
  copyIds: Ref<string[]>;
  openCopy: () => void;
  onCopied: (result: { copied: number; linked: number; targetName: string }) => void;
  onQuotaExceeded: () => void;
}

/**
 * The bulk "Copy to campaign…" flow shared by every list that mounts
 * `CopyToCampaignDialog` (#598, #875) — five call sites hand-rolled the same
 * open/toast/close/stop block; this is the one place it now lives.
 */
export function useCopyToCampaignFlow(options: CopyToCampaignFlowOptions): CopyToCampaignFlow {
  const { noun, nounPlural, selectableIds, pruneTo, stop, onQuotaExceeded: notifyQuotaExceeded } = options;
  const toast = useToast();

  const copyOpen = ref(false);
  const copyIds = ref<string[]>([]);

  /**
   * Prunes before it opens: the selection can go stale (refetch, filter edit)
   * between the bar's click and the dialog opening, so it's pruned to what's
   * still shown before the dialog ever sees the ids — a stale selection
   * reaching a batched write is the bug a reviewer caught in #875.
   */
  function openCopy(): void {
    const ids = pruneTo(selectableIds());
    if (!ids.length) return;
    copyIds.value = ids;
    copyOpen.value = true;
  }

  function onCopied({ copied, linked, targetName }: { copied: number; linked: number; targetName: string }): void {
    // `linked` counts the join rows that travelled with the batch (#885) --
    // relationships, faction memberships, inventory. Saying it matters
    // because the dialog has just told the DM what was *left behind*, and a
    // bare "Copied 2 NPCs" after that reads as though nothing came with
    // them. Omitted entirely at zero rather than said as "and 0 links",
    // which is the case for all eight original tables, none of which has a
    // join row to carry.
    const withLinks = linked > 0 ? ` and ${pluralizeCount(linked, "link")}` : "";
    toast.success(`Copied ${pluralizeCount(copied, noun, nounPlural)}${withLinks} to ${targetName}.`);
    copyOpen.value = false;
    // Ends selection mode, matching what every `move` handler already does.
    // A copy does not remove the originals from this list, so keeping the
    // selection would be defensible — but the bulk surfaces have to agree on
    // what finishing a bulk action looks like, and every `move` already ends it.
    stop();
  }

  function onQuotaExceededHandler(): void {
    copyOpen.value = false;
    notifyQuotaExceeded?.();
  }

  return { copyOpen, copyIds, openCopy, onCopied, onQuotaExceeded: onQuotaExceededHandler };
}
