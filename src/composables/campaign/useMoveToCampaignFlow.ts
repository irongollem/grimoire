import { useToast } from "@/composables/useToast";
import { pluralizeCount } from "@/lib/utils";
import { useBulkCampaignScope, type BulkScopeTable } from "@/composables/campaign/useBulkCampaignScope";
import type { Ref } from "vue";

export interface MoveToCampaignFlowOptions {
  /**
   * The table the bulk write lands on. `undefined` only for a caller like
   * `DungeonCraftEntityGrid`, which constructs this composable unconditionally
   * before its own optional `table` prop is known to be set — `move()` is a
   * no-op until it is, mirroring the same guard `handleCopyOpen` already
   * keeps for its own `table` check.
   */
  table: BulkScopeTable | undefined;
  /** Singular noun for the toast, e.g. "monster". */
  noun: string;
  /** Plural, for a noun `${noun}s` gets wrong — "species" is its own plural. */
  nounPlural?: string;
  /**
   * What could be selected right now: the same set the bar counts. A getter,
   * for the same reason `useCopyToCampaignFlow` reads one — the five lists
   * reach it differently, and reading it lazily here means `move` always
   * prunes against the current value rather than one captured when the flow
   * was set up.
   */
  selectableIds: () => readonly string[];
  /** This list's own `useBulkSelection` handles. */
  pruneTo: (ids: readonly string[]) => string[];
  stop: () => void;
  /** The active campaign's name, for the "moved to X" toast — a getter for
   *  the same staleness reason as `selectableIds`. */
  campaignName: () => string | null;
}

export interface MoveToCampaignFlow {
  /** True while the batched update is in flight — wire straight to
   *  `BulkScopeBar`'s `busy` prop. */
  moving: Ref<boolean>;
  move: (campaignId: string | null) => Promise<void>;
}

/**
 * The bulk "Move to campaign…" flow shared by every list that mounts
 * `BulkScopeBar` (#596/#875/#598) — five call sites hand-rolled the same
 * prune/mutate/toast/stop block, with the toast wording drifting three ways
 * between them (and `DungeonCraftEntityGrid` never branching on `campaignId`
 * at all, always reporting "Moved N entries." even when the destination was
 * "all campaigns"). This is the one place it now lives, mirroring
 * `useCopyToCampaignFlow`'s shape.
 */
export function useMoveToCampaignFlow(options: MoveToCampaignFlowOptions): MoveToCampaignFlow {
  const { table, noun, nounPlural, selectableIds, pruneTo, stop, campaignName } = options;
  const toast = useToast();
  const bulkScope = useBulkCampaignScope();

  async function move(campaignId: string | null): Promise<void> {
    if (!table) return;
    const ids = pruneTo(selectableIds());
    if (!ids.length) return;
    try {
      const { moved } = await bulkScope.mutateAsync({ table, ids, campaignId });
      const phrase = pluralizeCount(moved, noun, nounPlural);
      toast.success(
        campaignId
          ? `Moved ${phrase} to ${campaignName() ?? "the campaign"}.`
          : `${phrase} ${moved === 1 ? "is" : "are"} now available in all campaigns.`,
      );
      stop();
    } catch (e) {
      toast.error(toast.fromError(e));
    }
  }

  return { moving: bulkScope.isPending, move };
}
