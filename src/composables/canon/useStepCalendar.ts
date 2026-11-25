import { computed } from "vue";
import { useCalendarEventsRange, useCreateCalendarEvent, useDeleteCalendarEvent } from "@/composables/calendar/useCalendarEvents";
import { updateForceStep } from "@/composables/canon/useCanonForces";
import { calendarPathAt, stepEventInsert, stepOnCalendar } from "@/lib/canon/stepCalendar";
import { toast } from "@/lib/toast";
import type { CanonEntry, CanonForceStep } from "@/types/canon.types";

/**
 * Which of a force's steps are on the Calendar, where each one's event is now, and the write that puts one there
 * (#1279 item 32). A step on the Calendar points at its event; the events of the years the steps are due in are read
 * only to say which month to open, since the DM may have moved one, and a step whose event lies outside that span opens
 * on its own date instead.
 */
export function useStepCalendar(force: () => CanonEntry, steps: () => readonly CanonForceStep[]) {
  const linked = computed(() => steps().filter(stepOnCalendar));
  const years = computed(() => {
    const due = linked.value.flatMap((s) => (s.due_year === null ? [] : [s.due_year]));
    return due.length === 0 ? null : { from: Math.min(...due), to: Math.max(...due) };
  });
  // No step on the Calendar with a year, the common case: no span to read, so no request (a year-0 read finds nothing).
  const { data: events } = useCalendarEventsRange(
    computed(() => years.value?.from ?? 0),
    computed(() => years.value?.to ?? 0),
    computed(() => years.value !== null),
  );
  const { mutateAsync: create } = useCreateCalendarEvent();
  const { mutateAsync: removeEvent } = useDeleteCalendarEvent();

  /** Where "On the Calendar" opens for a step that is there; null for a step that is not. */
  function calendarPathOf(step: CanonForceStep): ReturnType<typeof calendarPathAt> | null {
    if (!stepOnCalendar(step)) return null;
    const event = (events.value ?? []).find((e) => e.id === step.calendar_event_id);
    if (event !== undefined) return calendarPathAt({ year: event.year, month: event.month });
    return step.due_year === null ? { path: "/calendar", query: {} } : calendarPathAt({ year: step.due_year, month: step.due_month });
  }

  /**
   * Puts a dated step on the Calendar once: the event, then the step's pointer to it. If the pointer cannot be written
   * the event is taken back, so a retry never leaves two. False when it failed (the DM has been told).
   */
  async function putOnCalendar(step: CanonForceStep): Promise<boolean> {
    if (stepOnCalendar(step)) return true;
    let eventId: string;
    try {
      eventId = (await create({ ...stepEventInsert(step, force().title), campaign_id: force().campaign_id })).id;
    } catch (e) {
      toast.error(toast.fromError(e));
      return false;
    }
    try {
      await updateForceStep(step.id, { calendar_event_id: eventId });
      return true;
    } catch (e) {
      await removeEvent(eventId).catch(() => undefined);
      toast.error(toast.fromError(e));
      return false;
    }
  }

  return { calendarPathOf, putOnCalendar };
}
