import { computed, onScopeDispose, toValue, watch, type ComputedRef, type MaybeRefOrGetter } from "vue";
import { useToast } from "@/composables/useToast";
import type { useMapMemory } from "@/composables/locations/useMapMemory";
import type { FogCellKey } from "@/lib/battlemap/fogMask";
import { newlySeen } from "@/lib/battlemap/partySight";
import { useCampaignStore } from "@/stores/campaign";

const SETTLE_MS = 300;

/**
 * Writes what the party sees into the map's memory (epic #1133), once a drag has settled. Only the DM's controlling
 * window passes `enabled`; a follower, the Table screen or a phone never writes. Nothing is written in "strict" mode.
 */
export function useRememberSight(opts: {
  memory: ReturnType<typeof useMapMemory>;
  sight: ComputedRef<ReadonlySet<FogCellKey>>;
  enabled: MaybeRefOrGetter<boolean>;
}): void {
  const campaign = useCampaignStore();
  const toast = useToast();
  const remembering = computed(() => toValue(opts.enabled) && campaign.activeCampaign?.map_memory === "remembered");
  const pending = computed(() => (opts.memory.isLoading.value || !remembering.value ? [] : newlySeen(opts.memory.memory.value, opts.sight.value)));

  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  // The payload that last failed: the same squares are not retried in a loop, a different set is.
  let failedKey: string | null = null;

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = null;
    if (pending.value.length === 0) return;
    timer = setTimeout(flush, SETTLE_MS);
  }

  async function flush() {
    timer = null;
    const cells = pending.value;
    if (inFlight || cells.length === 0) return;
    const key = cells.join(";");
    if (key === failedKey) return;
    inFlight = true;
    try {
      await opts.memory.remember(cells);
      failedKey = null;
    } catch (e) {
      failedKey = key;
      toast.error(toast.fromError(e, "Could not save what the party has seen."));
    } finally {
      inFlight = false;
      // Sight may have moved on while the write was in flight.
      schedule();
    }
  }

  watch(pending, schedule, { immediate: true });
  onScopeDispose(() => {
    if (timer) clearTimeout(timer);
  });
}
