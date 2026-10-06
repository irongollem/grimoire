import { describe, expect, it } from "vitest";
import {
  appendParagraph,
  logSummaryParts,
  quickNoteTarget,
  sessionDuration,
  sessionEndedMessage,
  sessionMeta,
  sessionPlayedLine,
  sessionRecap,
  sessionShortDate,
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

describe("sessionMeta", () => {
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
  it("refuses content that is not a TipTap document", () => {
    expect(appendParagraph("<p>old html</p>", "x")).toBeNull();
    expect(appendParagraph('{"foo":1}', "x")).toBeNull();
  });
});

describe("sessionEndedMessage", () => {
  it("names what ending the session stopped", () => {
    expect(sessionEndedMessage({ encounters_ended: 1, chains_paused: 2 })).toBe("Session ended: 1 encounter stopped, 2 quests paused.");
    expect(sessionEndedMessage({ encounters_ended: 0, chains_paused: 0 })).toBe("Session ended.");
  });
});
