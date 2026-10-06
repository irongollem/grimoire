import { describe, expect, it } from "vitest";
import { formatSessionShortDay, playerSessionWhen } from "./sessionShortDay";

describe("sessionShortDay", () => {
  it("prefers the run over the logged day", () => {
    const row = { started_at: new Date(2026, 9, 4, 19).toISOString(), played_on: "2026-10-01" };
    expect(formatSessionShortDay(row)).toBe("4 Oct");
    expect(playerSessionWhen(row)).toBe(row.started_at);
  });

  it("reads a date-only column as a local day", () => {
    expect(formatSessionShortDay({ started_at: null, played_on: "2026-10-04" })).toBe("4 Oct");
  });

  it("is null for an undated session", () => {
    const row = { started_at: null, played_on: null };
    expect(formatSessionShortDay(row)).toBeNull();
    expect(playerSessionWhen(row)).toBeNull();
  });
});
