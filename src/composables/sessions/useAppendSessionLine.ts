import { useCreateNote, useNotes, useUpdateNote } from "@/composables/notes/useNotes";
import { appendParagraph } from "@/lib/sessions/sessionLog";
import { sessionLabel } from "@/lib/sessions/sessionLabel";
import type { CampaignSession } from "@/types/session.types";

/**
 * Add one line to a session's note, creating the note (linked to the session) on
 * first use. Backs the dashboard widget's quick input: the DM jots a line during
 * play and finds it in the session note afterwards.
 *
 * Content that is not an editor document (a legacy HTML note) is never
 * overwritten: the append refuses and says why, so the DM opens the note instead.
 */
export function useAppendSessionLine() {
  const { data: notes } = useNotes();
  const create = useCreateNote();
  const update = useUpdateNote();

  async function append(session: CampaignSession, line: string): Promise<void> {
    const text = line.trim();
    if (text === "") return;
    const existing = (notes.value ?? []).find((n) => n.session_id === session.id);
    if (existing) {
      const content = appendParagraph(existing.content, text);
      if (content === null) {
        throw new Error("This session's note is in an older format. Open it to add the line.");
      }
      await update.mutateAsync({ id: existing.id, update: { content } });
      return;
    }
    const content = appendParagraph(null, text);
    if (content === null) throw new Error("The line could not be added");
    await create.mutateAsync({
      title: sessionLabel(session),
      content,
      category: "session",
      tags: [],
      session_id: session.id,
      is_pinned: false,
      player_visible_to: [],
      session_start_year: null,
      session_start_month: null,
      session_start_day: null,
      session_end_year: null,
      session_end_month: null,
      session_end_day: null,
      session_real_date: session.played_on,
      linked_calendar_event_id: null,
    });
  }

  return { append, pending: () => create.isPending.value || update.isPending.value };
}
