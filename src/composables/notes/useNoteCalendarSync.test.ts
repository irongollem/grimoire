import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createCalEvent: vi.fn(),
  updateCalEvent: vi.fn(),
  deleteCalEvent: vi.fn(),
  updateNote: vi.fn(),
}));

vi.mock("@/composables/calendar/useCalendarEvents", () => ({
  useCreateCalendarEvent: () => ({ mutateAsync: mocks.createCalEvent }),
  useUpdateCalendarEvent: () => ({ mutateAsync: mocks.updateCalEvent }),
  useDeleteCalendarEvent: () => ({ mutateAsync: mocks.deleteCalEvent }),
}));
vi.mock("@/composables/notes/useNotes", () => ({
  useUpdateNote: () => ({ mutateAsync: mocks.updateNote }),
}));

import { useNoteCalendarSync, type SyncSessionCalendarEventInput } from "./useNoteCalendarSync";
import type { NoteSessionDates } from "@/types/notes.types";

function dates(patch: Partial<NoteSessionDates> = {}): NoteSessionDates {
  return {
    startYear: null, startMonth: null, startDay: null,
    endYear: null, endMonth: null, endDay: null,
    realDate: null,
    ...patch,
  };
}

function input(patch: Partial<SyncSessionCalendarEventInput> = {}): SyncSessionCalendarEventInput {
  return {
    noteId: "note-1",
    title: "The Sunken Road",
    sessionNum: 7,
    dates: dates(),
    isSession: true,
    existingEventId: null,
    campaignId: "campaign-1",
    ...patch,
  };
}

describe("useNoteCalendarSync", () => {
  beforeEach(() => {
    mocks.createCalEvent.mockReset();
    mocks.updateCalEvent.mockReset();
    mocks.deleteCalEvent.mockReset();
    mocks.updateNote.mockReset();
  });

  it("creates an event and patches the note when a session note gains a start date", async () => {
    mocks.createCalEvent.mockResolvedValue({ id: "event-new" });
    const { syncSessionCalendarEvent } = useNoteCalendarSync();

    await syncSessionCalendarEvent(
      input({ dates: dates({ startYear: 1492, startMonth: 3, startDay: 12 }) }),
    );

    expect(mocks.createCalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Session 7: The Sunken Road",
        harptos_year: 1492,
        harptos_month: 3,
        harptos_day: 12,
        is_multi_day: false,
        end_year: null,
        end_month: null,
        end_day: null,
        linked_note_id: "note-1",
        campaign_id: "campaign-1",
      }),
    );
    // The write-back happens only after the insert resolves — the circular-FK
    // ordering the composable exists to preserve.
    expect(mocks.updateNote).toHaveBeenCalledWith({
      id: "note-1",
      update: { linked_calendar_event_id: "event-new" },
    });
    expect(mocks.updateCalEvent).not.toHaveBeenCalled();
    expect(mocks.deleteCalEvent).not.toHaveBeenCalled();
  });

  it("updates the existing event in place when one is already linked", async () => {
    const { syncSessionCalendarEvent } = useNoteCalendarSync();

    await syncSessionCalendarEvent(
      input({
        dates: dates({ startYear: 1492, startMonth: 3, startDay: 12, endYear: 1492, endMonth: 3, endDay: 14 }),
        existingEventId: "event-existing",
      }),
    );

    expect(mocks.updateCalEvent).toHaveBeenCalledWith({
      id: "event-existing",
      update: expect.objectContaining({
        is_multi_day: true,
        end_year: 1492,
        end_month: 3,
        end_day: 14,
      }),
    });
    expect(mocks.createCalEvent).not.toHaveBeenCalled();
    expect(mocks.deleteCalEvent).not.toHaveBeenCalled();
    // An update never needs the write-back — the link is already correct.
    expect(mocks.updateNote).not.toHaveBeenCalled();
  });

  it("deletes the event and nulls the link when the dates are cleared", async () => {
    const { syncSessionCalendarEvent } = useNoteCalendarSync();

    await syncSessionCalendarEvent(
      input({ dates: dates(), existingEventId: "event-existing" }),
    );

    expect(mocks.deleteCalEvent).toHaveBeenCalledWith("event-existing");
    expect(mocks.updateNote).toHaveBeenCalledWith({
      id: "note-1",
      update: { linked_calendar_event_id: null },
    });
    expect(mocks.createCalEvent).not.toHaveBeenCalled();
    expect(mocks.updateCalEvent).not.toHaveBeenCalled();
  });

  it("deletes the event and nulls the link when the note stops being a session note", async () => {
    const { syncSessionCalendarEvent } = useNoteCalendarSync();

    await syncSessionCalendarEvent(
      input({
        dates: dates({ startYear: 1492 }), // dates left behind by an earlier session category
        isSession: false,
        existingEventId: "event-existing",
      }),
    );

    expect(mocks.deleteCalEvent).toHaveBeenCalledWith("event-existing");
    expect(mocks.updateNote).toHaveBeenCalledWith({
      id: "note-1",
      update: { linked_calendar_event_id: null },
    });
  });

  it("does nothing when there is no date and nothing linked", async () => {
    const { syncSessionCalendarEvent } = useNoteCalendarSync();

    await syncSessionCalendarEvent(input({ dates: dates(), existingEventId: null }));

    expect(mocks.createCalEvent).not.toHaveBeenCalled();
    expect(mocks.updateCalEvent).not.toHaveBeenCalled();
    expect(mocks.deleteCalEvent).not.toHaveBeenCalled();
    expect(mocks.updateNote).not.toHaveBeenCalled();
  });
});
