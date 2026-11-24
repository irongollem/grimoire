/**
 * Ask Grimoire (#1270): the sessions a recap can be written about, as the record picker of the Scriptorium draft card.
 *
 * A recap is about a Chronicle entry, a note linked to a session, so the pick lists those notes (a loose note is no
 * session), each labelled with its session as the old dialog's picker was ("Session 4: The ferry"). The kind of
 * record is the contract's `note`; `askOptions.ts` (Ask's lists and pickers) wires this in as the `note` picker.
 * Both the card's picker and the adapter's lookup read it here, so the two cannot name a session differently.
 */
import { computed, type ComputedRef } from "vue";
import { useNotes } from "@/composables/notes/useNotes";
import { useCampaignSessions } from "@/composables/sessions/useCampaignSessions";
import { sessionLabel } from "@/lib/sessions/sessionLabel";
import { sessionOf } from "@/lib/notes/noteSessions";

export interface SessionNoteOption {
  id: string;
  name: string;
}

/** The recap's subjects; nothing is read until `enabled` is true. `loading` is true until the notes have arrived. */
export function useChronicleSessionOptions(enabled: () => boolean): { options: ComputedRef<SessionNoteOption[]>; loading: ComputedRef<boolean> } {
  const { data: notes } = useNotes(enabled);
  const { data: sessions } = useCampaignSessions({ enabled });
  const options = computed(() =>
    (notes.value ?? [])
      .filter((n) => n.session_id !== null)
      .map((n) => {
        const linked = sessionOf(sessions.value, n.session_id);
        return { id: n.id, name: linked ? `${sessionLabel(linked)}: ${n.title}` : n.title };
      }),
  );
  return { options, loading: computed(() => enabled() && notes.value === undefined) };
}
