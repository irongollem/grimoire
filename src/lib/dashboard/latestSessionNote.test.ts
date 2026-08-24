import { describe, it, expect } from "vitest";
import type { Note, NoteCategory } from "@/types/notes.types";
import { latestSessionNote } from "./latestSessionNote";

function note(over: Partial<Note> & { id: string }): Note {
  return {
    user_id: "dm",
    campaign_id: "c1",
    title: over.id,
    content: null,
    category: "session" as NoteCategory,
    tags: [],
    session_num: null,
    is_pinned: false,
    player_visible_to: [],
    session_start_year: null,
    session_start_month: null,
    session_start_day: null,
    session_end_year: null,
    session_end_month: null,
    session_end_day: null,
    session_real_date: null,
    linked_calendar_event_id: null,
    sort_order: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

describe("latestSessionNote", () => {
  it("has no answer when the campaign has no notes", () => {
    expect(latestSessionNote([])).toBeUndefined();
  });

  it("ignores every category but session", () => {
    const notes = [note({ id: "lore", category: "lore" }), note({ id: "quest", category: "quest" })];
    expect(latestSessionNote(notes)).toBeUndefined();
  });

  it("prefers the highest session number", () => {
    const notes = [
      note({ id: "one", session_num: 1 }),
      note({ id: "twelve", session_num: 12 }),
      note({ id: "two", session_num: 2 }),
    ];
    expect(latestSessionNote(notes)?.id).toBe("twelve");
  });

  // An unnumbered session is not session zero — it is a session that did not
  // say, and it must not beat a numbered one.
  it("ranks a numbered session above an unnumbered one", () => {
    const notes = [
      note({ id: "unnumbered", created_at: "2026-08-01T00:00:00Z" }),
      note({ id: "one", session_num: 1, created_at: "2020-01-01T00:00:00Z" }),
    ];
    expect(latestSessionNote(notes)?.id).toBe("one");
  });

  it("falls back to the date it was played when nothing is numbered", () => {
    const notes = [
      note({ id: "march", session_real_date: "2026-03-04" }),
      note({ id: "august", session_real_date: "2026-08-19" }),
    ];
    expect(latestSessionNote(notes)?.id).toBe("august");
  });

  // Three recaps typed on one Sunday: created_at cannot order them, the played
  // date can.
  it("uses the played date over the row's creation time", () => {
    const notes = [
      note({ id: "early", session_real_date: "2026-01-05", created_at: "2026-08-20T12:00:00Z" }),
      note({ id: "late", session_real_date: "2026-08-01", created_at: "2026-08-20T09:00:00Z" }),
    ];
    expect(latestSessionNote(notes)?.id).toBe("late");
  });

  it("falls back to creation time when nothing else is recorded", () => {
    const notes = [
      note({ id: "older", created_at: "2026-02-01T00:00:00Z" }),
      note({ id: "newer", created_at: "2026-07-01T00:00:00Z" }),
    ];
    expect(latestSessionNote(notes)?.id).toBe("newer");
  });

  // NaN compares false against everything, so an unparseable date left in the
  // sort would win or lose at random depending on argument order.
  it("treats an unparseable played date as absent rather than letting NaN decide", () => {
    const notes = [
      note({ id: "broken", session_real_date: "not-a-date" }),
      note({ id: "real", session_real_date: "2026-05-05" }),
    ];
    expect(latestSessionNote(notes)?.id).toBe("real");
  });

  it("does not mutate the array it was given", () => {
    const notes = [note({ id: "a", session_num: 1 }), note({ id: "b", session_num: 9 })];
    latestSessionNote(notes);
    expect(notes.map((n) => n.id)).toEqual(["a", "b"]);
  });
});
