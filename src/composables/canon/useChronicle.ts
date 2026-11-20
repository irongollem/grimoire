import { computed } from "vue";
import { chronicleItems, writtenCount } from "@/lib/canon/canonChronicle";
import { useCampaignSessions } from "@/composables/sessions/useCampaignSessions";
import { useNotes } from "@/composables/notes/useNotes";

/**
 * The Chronicle's entries (#1226): the campaign's sessions, each with the note linked to it. Both reads are the ones the
 * Sessions page and the notes use, so this adds no request of its own, and the campaign doorbell refreshes them.
 */
export function useChronicle() {
  const sessions = useCampaignSessions();
  const notes = useNotes();
  const items = computed(() => chronicleItems(sessions.data.value ?? [], notes.data.value ?? []));
  return {
    items,
    written: computed(() => writtenCount(items.value)),
    isLoading: computed(() => sessions.isLoading.value || notes.isLoading.value),
    isError: computed(() => sessions.isError.value || notes.isError.value),
  };
}
