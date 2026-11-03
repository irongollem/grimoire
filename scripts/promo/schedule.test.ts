import { describe, expect, it } from "vitest";
import { nextDue, parseSchedule, pushMissed } from "./schedule";

const S = parseSchedule([
  { id: "b", at: "2026-11-05T18:00:00+01:00" },
  { id: "a", at: "2026-11-04T18:00:00+01:00" },
  { id: "c", at: "2026-11-06T18:00:00+01:00" },
]);

describe("nextDue", () => {
  it("posts nothing before the first time comes", () => {
    expect(nextDue(S, new Set(), new Date("2026-11-04T16:59:00Z"))).toBeNull();
  });

  it("posts a Reel once its time has come, reading the offset (18:00 at +01:00 is 17:00 UTC)", () => {
    expect(nextDue(S, new Set(), new Date("2026-11-04T17:00:00Z"))?.id).toBe("a");
  });

  it("never posts one twice", () => {
    expect(nextDue(S, new Set(["a"]), new Date("2026-11-04T20:00:00Z"))).toBeNull();
  });

  it("posts one at a time, the earliest first, when two are due within the late limit", () => {
    const close = parseSchedule([{ id: "x", at: "2026-11-04T18:00:00+01:00" }, { id: "y", at: "2026-11-04T19:00:00+01:00" }]);
    expect(nextDue(close, new Set(), new Date("2026-11-04T18:30:00Z"))?.id).toBe("x");
    expect(nextDue(close, new Set(["x"]), new Date("2026-11-04T18:30:00Z"))?.id).toBe("y");
  });

  it("does not post a Reel more than three hours late, the 2am-in-New-York post after the Mac slept", () => {
    expect(nextDue(S, new Set(), new Date("2026-11-04T20:01:00Z"))).toBeNull();
    expect(nextDue(S, new Set(), new Date("2026-11-04T19:59:00Z"))?.id).toBe("a");
  });
});

describe("pushMissed", () => {
  it("leaves the schedule alone while nothing is past the late limit", () => {
    expect(pushMissed(S, new Set(), new Date("2026-11-04T19:00:00Z"))).toBeNull();
  });

  it("moves a missed Reel and everything after it back a day, at the same time of day and offset", () => {
    const r = pushMissed(S, new Set(), new Date("2026-11-05T07:00:00Z"));
    expect(r?.days).toBe(1);
    expect(r?.entries).toEqual([
      { id: "b", at: "2026-11-06T18:00:00+01:00" },
      { id: "a", at: "2026-11-05T18:00:00+01:00" },
      { id: "c", at: "2026-11-07T18:00:00+01:00" },
    ]);
  });

  it("never moves a posted Reel, and moves as many days as it takes to be in the future", () => {
    const r = pushMissed(S, new Set(["a"]), new Date("2026-11-08T07:00:00Z"));
    expect(r?.days).toBe(3);
    expect(r?.entries.find((e) => e.id === "a")?.at).toBe("2026-11-04T18:00:00+01:00");
    expect(r?.entries.find((e) => e.id === "b")?.at).toBe("2026-11-08T18:00:00+01:00");
  });
});

describe("parseSchedule", () => {
  it("refuses a time without an offset, which would post in whatever zone the job happens to run in", () => {
    expect(() => parseSchedule([{ id: "a", at: "2026-11-04T18:00:00" }])).toThrow(/offset/);
  });

  it("refuses the same Reel twice", () => {
    expect(() => parseSchedule([{ id: "a", at: "2026-11-04T18:00:00Z" }, { id: "a", at: "2026-11-05T18:00:00Z" }])).toThrow(/twice/);
  });
});
