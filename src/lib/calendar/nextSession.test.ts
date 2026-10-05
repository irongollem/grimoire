import { describe, expect, it } from "vitest";
import { countdownLabel, daysUntil, myRsvp, pickNextSession, rsvpTally, sessionTimeRange } from "./nextSession";

const p = (id: string, proposed_date: string, status: "proposed" | "confirmed" | "cancelled" = "confirmed") => ({
  id,
  proposed_date,
  status,
});

describe("pickNextSession", () => {
  it("picks the earliest non-cancelled on or after today", () => {
    const list = [p("a", "2026-10-01"), p("b", "2026-10-12", "cancelled"), p("c", "2026-10-20"), p("d", "2026-10-05")];
    expect(pickNextSession(list, "2026-10-05")?.id).toBe("d");
    expect(pickNextSession(list, "2026-10-06")?.id).toBe("c");
  });
  it("returns null when nothing is upcoming", () => {
    expect(pickNextSession([p("a", "2026-01-01")], "2026-10-05")).toBeNull();
    expect(pickNextSession([], "2026-10-05")).toBeNull();
  });
});

describe("sessionTimeRange", () => {
  it("adds the duration", () => {
    expect(sessionTimeRange({ proposed_time: "19:30", duration_minutes: 210 })).toBe("19:30 to 23:00");
    // What the database actually returns for a `time` column.
    expect(sessionTimeRange({ proposed_time: "19:30:00", duration_minutes: 210 })).toBe("19:30 to 23:00");
    expect(sessionTimeRange({ proposed_time: "19:30:00", duration_minutes: 0 })).toBe("19:30");
  });
  it("wraps past midnight", () => {
    expect(sessionTimeRange({ proposed_time: "22:00", duration_minutes: 180 })).toBe("22:00 to 01:00");
  });
  it("is null without a time", () => {
    expect(sessionTimeRange({ proposed_time: null, duration_minutes: 180 })).toBeNull();
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
  ];
  it("tallies", () => {
    expect(rsvpTally(rows, "a", 4)).toEqual({ yes: 1, answered: 2, total: 4 });
    expect(rsvpTally(rows, "z", 4)).toEqual({ yes: 0, answered: 0, total: 4 });
  });
  it("reads my answer, null when unanswered", () => {
    expect(myRsvp(rows, "a", "u2")).toBe(false);
    expect(myRsvp(rows, "a", "u1")).toBe(true);
    expect(myRsvp(rows, "a", "u3")).toBeNull();
    expect(myRsvp(rows, "a", undefined)).toBeNull();
  });
});
