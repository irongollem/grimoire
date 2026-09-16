import { computed, ref, type ComputedRef, type Ref } from "vue";
import { useToast } from "@/composables/useToast";
import { pluralizeCount } from "@/lib/utils";

export interface CopyEntityToCampaignOptions {
  /**
   * A getter, not a value: the eight detail views reach their record three
   * different ways (a prop that starts null, a fetched ref, a computed over
   * route params), and reading it lazily here means `openCopy`/`onCopied`
   * always see the current record rather than one captured when the flow
   * was set up.
   */
  entity: () => { id: string; name: string } | null | undefined;
  /** Singular noun for the toast fallback, e.g. "monster", "puzzle". */
  noun: string;
  /**
   * Called after the dialog closes on a quota_exceeded rejection, for the
   * two surfaces with their own quota (monsters, puzzle_rooms) to open their
   * existing `showPaywall` ref — the paywall itself stays with the caller,
   * per `CopyToCampaignDialog`'s own docstring; this composable must not
   * own one.
   */
  onQuotaExceeded?: () => void;
}

export interface CopyEntityToCampaignFlow {
  copyOpen: Ref<boolean>;
  copyIds: ComputedRef<string[]>;
  openCopy: () => void;
  onCopied: (result: { copied: number; linked: number; targetName: string }) => void;
  onQuotaExceeded: () => void;
}

/**
 * The single-entity "Copy to campaign…" flow shared by every detail view
 * that mounts `CopyToCampaignDialog` for its own record (#598, #875) — eight
 * call sites hand-rolled the same open/toast/close block, four of them
 * repeating the same multi-line rationale comment verbatim. This is the one
 * place it now lives.
 *
 * Not `useCopyToCampaignFlow`: that composable is the bulk flow a *list*
 * drives — it prunes a selection against what is still on screen and ends
 * selection mode when the copy lands, because bulk callers have a selection
 * to prune and to end. A detail view has exactly one row and no selection
 * concept at all, so there is nothing to prune and nothing to stop; the
 * shapes only look similar from the outside.
 *
 * Post-Mutation Navigation: this deliberately does NOT navigate on success.
 * That is a documented Sanctioned Exception in CLAUDE.md, not an oversight —
 * the copy lands in another campaign, which neither the page the DM is
 * standing on nor its list can show, so the toast naming the destination is
 * the only confirmation there can be; navigating away from the record the DM
 * is still looking at would be strictly worse. See CLAUDE.md's "Copy to
 * campaign…" Sanctioned Exception for the full reasoning — it lives there
 * once rather than being re-explained at each of the eight call sites.
 */
export function useCopyEntityToCampaign(options: CopyEntityToCampaignOptions): CopyEntityToCampaignFlow {
  const { entity, noun, onQuotaExceeded: notifyQuotaExceeded } = options;
  const toast = useToast();

  const copyOpen = ref(false);
  const copyIds = computed<string[]>(() => {
    const current = entity();
    return current ? [current.id] : [];
  });

  function openCopy(): void {
    if (!entity()) return;
    copyOpen.value = true;
  }

  function onCopied({ linked, targetName }: { copied: number; linked: number; targetName: string }): void {
    const name = entity()?.name;
    const label = name ? `"${name}"` : `the ${noun}`;
    // One row still travels with its links (#885): an NPC copied alone keeps
    // the relationships and memberships whose other end the target campaign
    // can already see, and its inventory. `copied` stays unread here — it is
    // always 1 on this flow, and the record's own name says more than the
    // number does. Omitted at zero, which is every one of the eight original
    // tables, none of which has a join row to carry.
    const withLinks = linked > 0 ? ` with ${pluralizeCount(linked, "link")}` : "";
    toast.success(`Copied ${label}${withLinks} to ${targetName}.`);
    copyOpen.value = false;
  }

  function onQuotaExceededHandler(): void {
    copyOpen.value = false;
    notifyQuotaExceeded?.();
  }

  return { copyOpen, copyIds, openCopy, onCopied, onQuotaExceeded: onQuotaExceededHandler };
}
