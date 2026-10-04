import { ref, shallowRef, watch, type Ref } from "vue";
import { useCampaignStore } from "@/stores/campaign";

/**
 * A paid AI result whose save failed. The generation is already paid for, so
 * the result is kept and the DM can save it again without generating twice.
 *
 * A result belongs to the campaign it was generated under. Every create reads
 * the *active* campaign, so a retry after the DM switched campaigns would
 * file the result in the wrong one: the retained result is dropped, with
 * nothing saved, the moment the active campaign changes.
 */
export function useRetainedGeneration<T>() {
  const campaign = useCampaignStore();
  const unsaved = shallowRef<T | null>(null) as Ref<T | null>;
  const isSaving = ref(false);
  let retainedIn: string | null = null;

  function clear() {
    unsaved.value = null;
    retainedIn = null;
  }

  watch(
    () => campaign.activeCampaignId,
    () => clear(),
  );

  /**
   * Save `result` through `persist`, which returns what it created or `null`
   * when the save failed (it reports the failure itself). A failure keeps the
   * result for a retry; a success clears it. A retry keeps the campaign the
   * result was first generated under; if the active campaign changed while
   * the save was in flight, a failed result is dropped rather than retained.
   */
  async function run<R>(result: T, persist: (result: T) => Promise<R | null>): Promise<R | null> {
    const startedIn = unsaved.value !== null ? retainedIn : campaign.activeCampaignId;
    isSaving.value = true;
    let saved: R | null;
    try {
      saved = await persist(result);
    } finally {
      isSaving.value = false;
    }
    if (saved !== null) {
      clear();
    } else if (startedIn === campaign.activeCampaignId) {
      unsaved.value = result;
      retainedIn = startedIn;
    }
    return saved;
  }

  return { unsaved, isSaving, run, clear };
}
