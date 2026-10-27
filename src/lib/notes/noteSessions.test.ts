import { describe, expect, it } from "vitest";
import { sessionOf, pickerName, previousSessionNote, sessionPickerOptions } from "./noteSessions";
import type { Note } from "@/types/notes.types";
import type { CampaignSession } from "@/types/session.types";

describe("sessionOf", () => {
  const log = [{ id: "a" }, { id: "b" }];
  it("finds the linked session", () => expect(sessionOf(log, "b")).toEqual({ id: "b" }));
  it("is null when unlinked, unknown or still loading", () => {
    expect(sessionOf(log, null)).toBeNull();
    expect(sessionOf(log, "z")).toBeNull();
    expect(sessionOf(undefined, "a")).toBeNull();
  });
});

function row(id: string, playedOn: string, over: Partial<CampaignSession> = {}): CampaignSession {
  return {
    id, campaign_id: "c", user_id: "u", number: null, title: null, played_on: playedOn,
    started_at: null, ended_at: null, created_at: `${playedOn}T00:00:00Z`, updated_at: "", ...over,
  };
}

describe("pickerName", () => {
  it("joins number and title", () => expect(pickerName({ number: 13, title: "Bells" })).toBe("Session 13 · Bells"));
  it("copes with either missing", () => {
    expect(pickerName({ number: 13, title: null })).toBe("Session 13");
    expect(pickerName({ number: null, title: " Bells " })).toBe("Bells");
    expect(pickerName({ number: null, title: null })).toBe("Unnumbered session");
    // Session zero is a real session, not a missing number.
    expect(pickerName({ number: 0, title: null })).toBe("Session 0");
  });
});

describe("sessionPickerOptions", () => {
  const log = [
    row("old", "2026-01-01", { number: 1 }),
    row("mid", "2026-02-01", { number: 2 }),
    row("new", "2026-03-01", { number: 3 }),
    row("live", "2026-04-01", { number: 4, started_at: "2026-04-01T18:00:00Z" }),
  ];
  const notes = [
    { id: "n1", category: "session" as const, session_id: "mid" },
    { id: "n2", category: "general" as const, session_id: "old" },
  ];

  it("puts sessions without a note first, newest first, then those with one", () => {
    const options = sessionPickerOptions(log, notes, null);
    expect(options.map((o) => [o.id, o.state])).toEqual([
      ["live", "running"], ["new", "no-note"], ["old", "no-note"], ["mid", "has-note"],
    ]);
  });

  it("does not count the note being edited as having taken its own session", () => {
    const options = sessionPickerOptions(log, notes, "n1");
    expect(options.find((o) => o.id === "mid")?.state).toBe("no-note");
  });

  it("calls a session that has started and ended finished, not running", () => {
    const finished = row("f", "2026-03-01", { started_at: "2026-03-01T18:00:00Z", ended_at: "2026-03-01T22:00:00Z" });
    expect(sessionPickerOptions([finished], [], null)[0]?.state).toBe("no-note");
  });

  it("shows no day for an unreadable date", () => {
    expect(sessionPickerOptions([row("bad", "not-a-date")], [], null)[0]?.day).toBe("");
  });

  it("shows no day for a session with neither a start nor a played date", () => {
    const undated = row("u", "2026-03-01", { played_on: null, created_at: "2026-05-05T10:00:00Z" });
    expect(sessionPickerOptions([undated], [], null)[0]?.day).toBe("");
  });

  it("formats the day as a short weekday", () => {
    expect(sessionPickerOptions(log, [], null).find((o) => o.id === "new")?.day).toBe("Sun 1 Mar");
  });
});

describe("previousSessionNote", () => {
  const dated = (id: string, sessionId: string): Note =>
    ({ id, category: "session", session_id: sessionId, session_start_year: 1490, session_end_year: null } as Note);

  it("orders by the log, not by number", () => {
    const log = [row("a", "2026-01-01", { number: 9 }), row("b", "2026-02-01", { number: 2 })];
    expect(previousSessionNote([dated("na", "a"), dated("nb", "b")], log)?.id).toBe("nb");
  });
  it("skips a session that is still running and offers the one before it", () => {
    const log = [
      row("done", "2026-01-01", { number: 1, started_at: "2026-01-01T18:00:00Z", ended_at: "2026-01-01T22:00:00Z" }),
      row("live", "2026-02-01", { number: 2, started_at: "2026-02-01T18:00:00Z" }),
    ];
    expect(previousSessionNote([dated("nd", "done"), dated("nl", "live")], log)?.id).toBe("nd");
  });
  it("ignores a note of another category even when it carries a session and dates", () => {
    const other = { ...dated("x", "a"), category: "general" } as Note;
    expect(previousSessionNote([other], [row("a", "2026-01-01")])).toBeNull();
  });
  it("is null with no dated session note", () => {
    expect(previousSessionNote([], [row("a", "2026-01-01")])).toBeNull();
  });
});
