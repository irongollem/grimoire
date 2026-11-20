import { computed } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { storeToRefs } from "pinia";
import { CANON_KEY, NOTE_SORTING_KEY } from "@/lib/campaignLiveSync/registry";
import { sortNote, type SortChoice, type SortWrites } from "@/lib/notes/noteSorting";
import {
  appendToBackstory,
  appendToDmNote,
  fetchNotesToSort,
  linkNoteToSession,
  removeFromSortingList,
  writeLoreEntry,
} from "@/lib/notes/noteSortingWrites";
import { useCampaignStore } from "@/stores/campaign";
import type { Note } from "@/types/notes.types";
import { queueNoteEmbedding, useDeleteNote } from "./useNotes";

/**
 * The notes still to sort into canon (#1226 story 6), scoped to the active campaign here, never left to RLS. Live
 * through the doorbell: `note_sorting` rings and refreshes this root.
 */
export function useNoteSorting() {
  const { activeCampaignId } = storeToRefs(useCampaignStore());
  return useQuery({
    queryKey: computed(() => [NOTE_SORTING_KEY, activeCampaignId.value] as const),
    queryFn: ({ queryKey: [, campaignId] }) => {
      if (!campaignId) throw new Error("useNoteSorting fetched without a campaign");
      return fetchNotesToSort(campaignId);
    },
    enabled: () => !!activeCampaignId.value,
  });
}

/**
 * Sends one note where the DM chose, writing the destination before deleting the note (`sortNote`). Rejects with a
 * `SortStepError` naming the step that failed.
 */
export function useSortNote() {
  const queryClient = useQueryClient();
  const { mutateAsync: deleteNote } = useDeleteNote();
  const campaign = useCampaignStore();
  function currentCampaign(): string {
    if (!campaign.activeCampaignId) throw new Error("No campaign is open.");
    return campaign.activeCampaignId;
  }

  const writes: SortWrites = {
    createLoreEntry: writeLoreEntry,
    linkToSession: async (noteId, sessionId) => {
      await linkNoteToSession(noteId, sessionId);
      queueNoteEmbedding(noteId);
    },
    appendBackstory: appendToBackstory,
    // The DM's note is filed under the note's own campaign, which is the party member's.
    appendDmNote: (partyMemberId, content) => appendToDmNote(partyMemberId, currentCampaign(), content),
    deleteNote: async (noteId) => {
      await deleteNote(noteId);
    },
    removeFromList: removeFromSortingList,
  };

  return useMutation({
    mutationFn: ({ note, choice }: { note: Note; choice: SortChoice }) => sortNote(note, choice, writes),
    // A failed step may have written the destination already, so every root is refreshed either way.
    onSettled: () =>
      Promise.all(
        ["notes", NOTE_SORTING_KEY, CANON_KEY, "party", "entity-notes"].map((root) =>
          queryClient.invalidateQueries({ queryKey: [root] }),
        ),
      ),
  });
}
