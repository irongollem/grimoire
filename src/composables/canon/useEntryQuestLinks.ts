import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useCanonForceData } from "@/composables/canon/useCanonForces";

/** The quests one canon entry is tied to, out of the campaign's links already read for the forces. */
export function useEntryQuestLinks(entryId: MaybeRefOrGetter<string | null>) {
  const { data } = useCanonForceData();
  return computed(() => (data.value?.quests ?? []).filter((q) => q.entry_id === toValue(entryId)));
}
