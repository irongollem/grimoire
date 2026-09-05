import {
  useCreateCalendarEvent,
  useUpdateCalendarEvent,
  useDeleteCalendarEvent,
} from "@/composables/calendar/useCalendarEvents";
import { useUpdateNote } from "@/composables/notes/useNotes";
import type { NoteSessionDates } from "@/types/notes.types";

export interface SyncSessionCalendarEventInput {
  noteId: string;
  title: string;
  sessionNum: number | null;
  dates: NoteSessionDates;
  isSession: boolean;
  existingEventId: string | null;
  campaignId: string | null;
}

/**
 * Keeps a session note's linked calendar event in step with its session-date
 * fields: creates one when a session note first gains a start date, updates it
 * in place while linked, and deletes + unlinks it when the dates are cleared or
 * the note stops being a session note. Lifted out of NoteEditor.vue (#814) so
 * the sync logic can be exercised without mounting the whole editor.
 */
export function useNoteCalendarSync() {
  const { mutateAsync: createCalEvent } = useCreateCalendarEvent();
  const { mutateAsync: updateCalEvent } = useUpdateCalendarEvent();
  const { mutateAsync: deleteCalEvent } = useDeleteCalendarEvent();
  const { mutateAsync: updateNote } = useUpdateNote();

  // Avoids circular FK: insert note first → insert event with linked_note_id
  // → patch note.linked_calendar_event_id.
  async function syncSessionCalendarEvent(input: SyncSessionCalendarEventInput): Promise<void> {
    const { noteId, title, sessionNum, dates, isSession, existingEventId, campaignId } = input;
    const hasDate = isSession && dates.startYear !== null;

    if (hasDate) {
      const isMultiDay = dates.endYear !== null;
      const eventPayload = {
        title: `Session ${sessionNum ?? "?"}: ${title.trim()}`,
        event_type: "session" as const,
        color: "#C9920A",
        harptos_year:  dates.startYear!,
        harptos_month: dates.startMonth,
        harptos_day:   dates.startDay,
        festival_day:  null,
        is_multi_day:  isMultiDay,
        end_year:      isMultiDay ? dates.endYear : null,
        end_month:     isMultiDay ? dates.endMonth : null,
        end_day:       isMultiDay ? dates.endDay : null,
        description:   null,
        linked_quest_id: null,
        linked_encounter_id: null,
        linked_location_id: null,
        linked_note_id: noteId,
        travel_party_member_ids: [],
        player_visible: false,
        campaign_id: campaignId,
      };

      if (existingEventId) {
        await updateCalEvent({ id: existingEventId, update: eventPayload });
      } else {
        const newEvt = await createCalEvent(eventPayload);
        await updateNote({ id: noteId, update: { linked_calendar_event_id: newEvt.id } });
      }
    } else if (existingEventId) {
      await deleteCalEvent(existingEventId);
      await updateNote({ id: noteId, update: { linked_calendar_event_id: null } });
    }
  }

  return { syncSessionCalendarEvent };
}
