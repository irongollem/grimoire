import { describe, expect, it } from "vitest";
import { nextDue, parseSchedule } from "./schedule";

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

  it("after a Mac slept through two times, posts the earliest first and only one per run", () => {
    expect(nextDue(S, new Set(), new Date("2026-11-06T10:00:00Z"))?.id).toBe("a");
    expect(nextDue(S, new Set(["a"]), new Date("2026-11-06T10:00:00Z"))?.id).toBe("b");
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
