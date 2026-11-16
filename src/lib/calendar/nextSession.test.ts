import { describe, expect, it } from "vitest";
import type { SessionCadence, SessionProposal } from "@/types/scheduling.types";
import {
  absenceTally,
  countdownLabel,
  daysUntil,
  myRsvp,
  pickNextSession,
  rsvpTally,
  scheduledEvenings,
  sessionTimeRange,
  todaysScheduledSession,
} from "./nextSession";

const p = (id: string, proposed_date: string, status: SessionProposal["status"] = "confirmed", replaces_date: string | null = null) =>
  ({ id, proposed_date, status, replaces_date, proposed_time: "19:00", title: id }) as SessionProposal;

// Every Thursday from Monday 16 Nov 2026: the 19th, 26th, 3 Dec … (`cal 11 2026`).
const thursdays = {
  repeat: "weekly",
  every_weeks: 1,
  weekday: 4,
  week_of_month: null,
  starts_on: "2026-11-16",
  ends_on: null,
  start_time: "19:30:00",
  duration_minutes: 240,
  title: "Session",
} as SessionCadence;

describe("pickNextSession", () => {
  it("picks the earliest non-cancelled on or after today", () => {
    const list = [p("a", "2026-10-01"), p("b", "2026-10-12", "cancelled"), p("c", "2026-10-20"), p("d", "2026-10-05")];
    expect(pickNextSession(null, list, "2026-10-05")?.key).toBe("d");
    expect(pickNextSession(null, list, "2026-10-06")?.key).toBe("c");
  });
  it("returns null when nothing is upcoming", () => {
    expect(pickNextSession(null, [p("a", "2026-01-01")], "2026-10-05")).toBeNull();
  });
  it("is the next regular evening when nothing deviates (#1213)", () => {
    expect(pickNextSession(thursdays, [], "2026-11-20")).toMatchObject({ date: "2026-11-26", status: "regular" });
  });
  it("skips a cancelled regular evening rather than showing it", () => {
    expect(pickNextSession(thursdays, [p("x", "2026-11-19", "cancelled", "2026-11-19")], "2026-11-16")?.date).toBe("2026-11-26");
  });
  it("shows the moved evening on its new date in place of the regular one", () => {
    const moved = p("m", "2026-11-21", "proposed", "2026-11-19");
    expect(pickNextSession(thursdays, [moved], "2026-11-16")).toMatchObject({ key: "m", date: "2026-11-21", status: "proposed" });
  });
  it("orders a one-off before a regular evening later the same week", () => {
    expect(pickNextSession(thursdays, [p("o", "2026-11-17")], "2026-11-16")?.key).toBe("o");
  });
});

describe("scheduledEvenings", () => {
  it("still fills the limit when the first evenings were all replaced", () => {
    const cancelled = ["2026-11-19", "2026-11-26"].map((d) => p(d, d, "cancelled", d));
    expect(scheduledEvenings(thursdays, cancelled, "2026-11-16", null, 2).map((e) => e.date)).toEqual([
      "2026-12-03",
      "2026-12-10",
    ]);
  });
});

describe("todaysScheduledSession", () => {
  it("is today's regular evening, or a confirmed date, never a mere suggestion", () => {
    expect(todaysScheduledSession(thursdays, [], "2026-11-19")?.status).toBe("regular");
    expect(todaysScheduledSession(null, [p("x", "2026-11-19", "proposed")], "2026-11-19")).toBeNull();
    expect(todaysScheduledSession(null, [p("y", "2026-11-19")], "2026-11-19")?.key).toBe("y");
  });
});

describe("sessionTimeRange", () => {
  it("adds the duration", () => {
    expect(sessionTimeRange({ time: "19:30", durationMinutes: 210 })).toBe("19:30 to 23:00");
    // What the database actually returns for a `time` column.
    expect(sessionTimeRange({ time: "19:30:00", durationMinutes: 210 })).toBe("19:30 to 23:00");
    expect(sessionTimeRange({ time: "19:30:00", durationMinutes: 0 })).toBe("19:30");
  });
  it("shows only the start for a negative duration or a time that is not a clock", () => {
    expect(sessionTimeRange({ time: "19:30", durationMinutes: -30 })).toBe("19:30");
    expect(sessionTimeRange({ time: "late", durationMinutes: 30 })).toBeNull();
  });
  it("wraps past midnight", () => {
    expect(sessionTimeRange({ time: "22:00", durationMinutes: 180 })).toBe("22:00 to 01:00");
  });
  it("is null without a time", () => {
    expect(sessionTimeRange({ time: null, durationMinutes: 180 })).toBeNull();
  });
});

describe("absenceTally", () => {
  it("counts everyone as coming except those out that evening", () => {
    const rows = [{ absent_on: "2026-11-19" }, { absent_on: "2026-11-26" }];
    expect(absenceTally(rows, "2026-11-19", 4)).toEqual({ yes: 3, answered: 1, total: 4 });
  });
});

describe("daysUntil / countdownLabel", () => {
  it("counts calendar days across month and DST boundaries", () => {
    expect(daysUntil("2026-11-01", "2026-10-25")).toBe(7);
    expect(daysUntil("2026-10-05", "2026-10-05")).toBe(0);
    expect(daysUntil("2026-10-04", "2026-10-05")).toBe(-1);
  });
  it("words the countdown", () => {
    expect(countdownLabel(0)).toBe("today");
    expect(countdownLabel(1)).toBe("tomorrow");
    expect(countdownLabel(6)).toBe("in 6 days");
  });
});

describe("rsvp", () => {
  const rows = [
    { session_proposal_id: "a", user_id: "u1", available: true },
    { session_proposal_id: "a", user_id: "u2", available: false },
    { session_proposal_id: "b", user_id: "u1", available: true },
    { session_proposal_id: "b", user_id: "u2", available: true },
  ];
  it("tallies", () => {
    expect(rsvpTally(rows, "a", 4)).toEqual({ yes: 1, answered: 2, total: 4 });
    expect(rsvpTally(rows, "b", 4)).toEqual({ yes: 2, answered: 2, total: 4 });
    expect(rsvpTally(rows, "z", 4)).toEqual({ yes: 0, answered: 0, total: 4 });
  });
  it("reads my answer, null when unanswered", () => {
    expect(myRsvp(rows, "a", "u2")).toBe(false);
    expect(myRsvp(rows, "a", "u1")).toBe(true);
    // The same player answered the other session differently.
    expect(myRsvp(rows, "b", "u2")).toBe(true);
    expect(myRsvp(rows, "a", "u3")).toBeNull();
    expect(myRsvp(rows, "a", undefined)).toBeNull();
  });
});
