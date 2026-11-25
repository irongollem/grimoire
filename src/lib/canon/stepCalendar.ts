import { EVENT_TYPE_COLORS, type CalendarEventInsert } from "@/types/calendar.types";
import type { CanonForceStep } from "@/types/canon.types";

/**
 * A force step on the Calendar (#1279 item 32). A step is put there as an ordinary world event on the step's due date,
 * titled with the step's words, and the Calendar owns it from then on (the DM can move, rename or delete it there). The
 * step remembers which event it became (`canon_force_steps.calendar_event_id`, emptied when the event is deleted), so it
 * is found however either is renamed or moved, and the Calendar draws the event instead of the step's own "A step due".
 */

/** Whether a step has a world date to put on the Calendar. */
export const stepHasDate = (step: Pick<CanonForceStep, "due_year">): boolean => step.due_year !== null;

/** Whether the step is on the Calendar: it points at the event it became. */
export const stepOnCalendar = (step: Pick<CanonForceStep, "calendar_event_id">): boolean => step.calendar_event_id !== null;

/** The event that puts a dated step on the Calendar, for the DM only (it is not shown to players). */
export function stepEventInsert(
  step: Pick<CanonForceStep, "title" | "due_year" | "due_month" | "due_day">,
  forceTitle: string,
): Omit<CalendarEventInsert, "campaign_id"> {
  if (step.due_year === null) throw new Error("a step without a date cannot be put on the Calendar");
  return {
    title: step.title,
    description: `A step of “${forceTitle}”.`,
    event_type: "world",
    year: step.due_year,
    month: step.due_month,
    day: step.due_day,
    festival_day: null,
    is_multi_day: false,
    end_year: null,
    end_month: null,
    end_day: null,
    color: EVENT_TYPE_COLORS.world,
    linked_quest_id: null,
    linked_encounter_id: null,
    linked_location_id: null,
    travel_party_member_ids: [],
    player_visible: false,
  };
}

/** Where the Calendar shows a date's month (or its year, for a date with no month): the event's own date once it is read. */
export function calendarPathAt(at: { year: number; month: number | null }): { path: string; query: Record<string, string> } {
  const year = String(at.year);
  return { path: "/calendar", query: at.month === null ? { year } : { year, month: String(at.month) } };
}
