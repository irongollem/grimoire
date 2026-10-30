import { describe, expect, it } from "vitest";
import {
  appendParagraph,
  logSummaryParts,
  quickNoteTarget,
  sessionDuration,
  sessionMeta,
  sessionPlayedLine,
  sessionRecap,
  sessionShortDate,
  sessionTitle,
  sessionsSharingANumber,
  sessionsWithoutNotes,
} from "@/lib/sessions/sessionLog";
import type { CampaignSession } from "@/types/session.types";

function session(over: Partial<CampaignSession> & { id: string }): CampaignSession {
  return {
    campaign_id: "c",
    user_id: "u",
    number: null,
    title: null,
    played_on: null,
    started_at: null,
    ended_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

describe("sessionRecap", () => {
  it("is running for the open session whatever notes exist", () => {
    expect(sessionRecap({ started_at: "2026-10-04T19:00:00Z", ended_at: null }, true)).toBe("running");
  });
  it("is recap or none for a finished or never-run session", () => {
    expect(sessionRecap({ started_at: null, ended_at: null }, true)).toBe("recap");
    expect(sessionRecap({ started_at: "2026-10-04T19:00:00Z", ended_at: "2026-10-04T22:00:00Z" }, false)).toBe("none");
  });
});

describe("sessionDuration", () => {
  it("reads hours and zero-padded minutes", () => {
    expect(sessionDuration({ started_at: "2026-10-04T19:30:00Z", ended_at: "2026-10-04T23:10:00Z" })).toBe("3h 40m");
    expect(sessionDuration({ started_at: "2026-10-04T19:30:00Z", ended_at: "2026-10-04T20:15:00Z" })).toBe("45m");
    expect(sessionDuration({ started_at: "2026-10-04T19:00:00Z", ended_at: "2026-10-04T20:05:00Z" })).toBe("1h 05m");
  });
  it("is null for an end that comes before the start", () => {
    expect(sessionDuration({ started_at: "2026-10-04T20:00:00Z", ended_at: "2026-10-04T19:00:00Z" })).toBeNull();
  });
  it("is null without a closed run", () => {
    expect(sessionDuration({ started_at: null, ended_at: null })).toBeNull();
    expect(sessionDuration({ started_at: "2026-10-04T19:00:00Z", ended_at: null })).toBeNull();
  });
});

describe("sessionShortDate", () => {
  it("reads a played_on date as a local calendar day", () => {
    expect(sessionShortDate(session({ id: "a", played_on: "2026-10-06" }))).toBe("Tue 6 Oct");
  });
});

describe("sessionPlayedLine", () => {
  it("is the day alone for a session never run", () => {
    expect(sessionPlayedLine(session({ id: "a", played_on: "2026-09-27" }))).toBe("Sunday 27 September");
  });
  it("adds the span and its length for a run session", () => {
    const line = sessionPlayedLine(
      session({ id: "a", started_at: "2026-09-27T10:00:00", ended_at: "2026-09-27T13:10:00" }),
    );
    expect(line).toBe("Sunday 27 September, 10:00 to 13:10 (3h 10m)");
  });
});

describe("a running session", () => {
  it("says when it began, without an end", () => {
    const line = sessionPlayedLine(session({ id: "a", started_at: "2026-09-27T19:30:00" }));
    expect(line).toBe("Sunday 27 September, from 19:30");
  });
  it("is Under way in the meta line, with no duration yet", () => {
    expect(sessionMeta(session({ id: "a", started_at: "2026-10-04T19:30:00Z" }), { people: 0, encounters: 0 })).toBe("Under way");
  });
});

describe("sessionMeta", () => {
  it("leaves out the people and encounters that are zero", () => {
    const row = session({ id: "a", started_at: "2026-10-04T19:30:00Z", ended_at: "2026-10-04T23:10:00Z" });
    expect(sessionMeta(row, { people: 0, encounters: 2 })).toBe("3h 40m · 2 encounters");
    expect(sessionMeta(row, { people: 2, encounters: 0 })).toBe("3h 40m · 2 people met");
  });
  it("joins duration, people and encounters", () => {
    const row = session({ id: "a", started_at: "2026-10-04T19:30:00Z", ended_at: "2026-10-04T23:10:00Z" });
    expect(sessionMeta(row, { people: 2, encounters: 1 })).toBe("3h 40m · 2 people met · 1 encounter");
    expect(sessionMeta(row, { people: 1, encounters: 3 })).toBe("3h 40m · 1 person met · 3 encounters");
  });
  it("says an unrun session predates the log, or gives its day", () => {
    expect(sessionMeta(session({ id: "a" }), { people: 0, encounters: 0 })).toBe("Played before the log began");
    expect(sessionMeta(session({ id: "a", played_on: "2026-10-06" }), { people: 0, encounters: 0 })).toBe("Tue 6 Oct");
  });
});

describe("sessionsWithoutNotes", () => {
  const log = [
    session({ id: "new", started_at: "2026-10-04T19:00:00Z", ended_at: "2026-10-04T22:00:00Z" }),
    session({ id: "old", played_on: "2026-08-01" }),
    session({ id: "mid", started_at: "2026-09-01T19:00:00Z", ended_at: "2026-09-01T22:00:00Z" }),
    session({ id: "live", started_at: "2026-10-06T19:00:00Z" }),
  ];
  it("lists unnoted played sessions oldest first and skips the running one", () => {
    expect(sessionsWithoutNotes(log, new Set()).map((s) => s.id)).toEqual(["old", "mid", "new"]);
  });
  it("drops sessions that have a note", () => {
    expect(sessionsWithoutNotes(log, new Set(["old"])).map((s) => s.id)).toEqual(["mid", "new"]);
  });
});

describe("quickNoteTarget", () => {
  it("prefers the running session, else the last played", () => {
    const done = session({ id: "done", started_at: "2026-10-04T19:00:00Z", ended_at: "2026-10-04T22:00:00Z" });
    const live = session({ id: "live", started_at: "2026-10-06T19:00:00Z" });
    expect(quickNoteTarget([done, live])?.id).toBe("live");
    expect(quickNoteTarget([done])?.id).toBe("done");
    expect(quickNoteTarget([])).toBeNull();
  });
});

describe("logSummaryParts", () => {
  it("leaves out what is zero", () => {
    expect(logSummaryParts(1, 0, 0)).toEqual(["1 session"]);
    expect(logSummaryParts(16, 2, 23)).toEqual([
      "16 sessions",
      "2 without notes",
      "23 things learned outside any session",
    ]);
  });
});

describe("appendParagraph", () => {
  it("starts a document when the note is empty", () => {
    const out = appendParagraph(null, "Met the smith");
    expect(JSON.parse(out ?? "")).toEqual({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Met the smith" }] }],
    });
  });
  it("appends to an existing document without losing it", () => {
    const before = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "One" }] }] });
    const parsed = JSON.parse(appendParagraph(before, "Two") ?? "") as { content: unknown[] };
    expect(parsed.content).toHaveLength(2);
  });
  it("treats a blank string as an empty note", () => {
    expect(JSON.parse(appendParagraph("  ", "Met the smith") ?? "")).toMatchObject({ type: "doc" });
  });
  it("refuses content that is not a TipTap document", () => {
    expect(appendParagraph("<p>old html</p>", "x")).toBeNull();
    expect(appendParagraph('{"foo":1}', "x")).toBeNull();
  });
});

describe("sessionsSharingANumber", () => {
  const run = session({ id: "run", number: 14, started_at: "2026-10-02T18:00:00Z", ended_at: "2026-10-02T23:20:00Z", created_at: "2026-10-02T18:00:00Z" });
  const recap = session({ id: "recap", number: 14, title: "The Wolves", played_on: "2026-10-02", created_at: "2026-09-01T00:00:00Z" });

  it("finds one evening logged twice and keeps the row that was run", () => {
    const [group] = sessionsSharingANumber([recap, run, session({ id: "13", number: 13 })]);
    expect(group.number).toBe(14);
    expect(group.keep.id).toBe("run");
    expect(group.absorb.map((r) => r.id)).toEqual(["recap"]);
  });

  it("keeps the first logged when neither was run", () => {
    const later = session({ id: "later", number: 3, created_at: "2026-02-01T00:00:00Z" });
    const first = session({ id: "first", number: 3, created_at: "2026-01-01T00:00:00Z" });
    expect(sessionsSharingANumber([later, first])[0].keep.id).toBe("first");
  });

  it("ignores unnumbered sessions and the one running now", () => {
    const open = session({ id: "open", number: 14, started_at: "2026-10-06T18:00:00Z" });
    expect(sessionsSharingANumber([run, open, session({ id: "a" }), session({ id: "b" })])).toEqual([]);
  });

  it("lists the highest number first", () => {
    const groups = sessionsSharingANumber([
      session({ id: "a", number: 2 }), session({ id: "b", number: 2 }), run, recap,
    ]);
    expect(groups.map((g) => g.number)).toEqual([14, 2]);
  });
});

describe("sessionTitle", () => {
  it("prefers the title, then the number, then a placeholder", () => {
    expect(sessionTitle({ title: "  The Mine  ", number: 3 })).toBe("The Mine");
    expect(sessionTitle({ title: null, number: 3 })).toBe("Session 3");
    expect(sessionTitle({ title: " ", number: null })).toBe("Untitled session");
  });
});
