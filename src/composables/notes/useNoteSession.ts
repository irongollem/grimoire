import { computed } from "vue";
import { useCampaignSessions } from "@/composables/sessions/useCampaignSessions";
import { sessionOf } from "@/lib/notes/noteSessions";

/** The session a note records, from the DM's session log; null while it loads or when unlinked. */
export function useNoteSession(sessionId: () => string | null | undefined) {
  const { data: log } = useCampaignSessions();
  return computed(() => sessionOf(log.value, sessionId() ?? null));
}
