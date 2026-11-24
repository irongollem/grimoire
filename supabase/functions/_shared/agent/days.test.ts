import { describe, expect, it } from "vitest";
import { MAX_DAYS_PASSED, parsePassDays, parseTakeDaysBack, takenBackText } from "./days.ts";

describe("parsePassDays", () => {
  it("takes a whole number of days", () => {
    expect(parsePassDays({ days: 3 })).toEqual({ ok: true, days: 3 });
    expect(parsePassDays({ days: MAX_DAYS_PASSED })).toEqual({ ok: true, days: MAX_DAYS_PASSED });
  });

  // Bug caught: the date moved backwards, by a fraction, by nothing, or by years in one reply.
  it.each([[0], [-2], [1.5], [MAX_DAYS_PASSED + 1], ["3"], [undefined]])("refuses %s", (days) => {
    expect(parsePassDays({ days }).ok).toBe(false);
  });
});

describe("parseTakeDaysBack", () => {
  it("takes a whole number of days", () => {
    expect(parseTakeDaysBack({ days: 3 })).toEqual({ ok: true, days: 3 });
    expect(parseTakeDaysBack({ days: MAX_DAYS_PASSED })).toEqual({ ok: true, days: MAX_DAYS_PASSED });
  });

  // Bug caught: days taken back by a fraction, by nothing, by a negative count (a way to move the date on) or by years.
  it.each([[0], [-2], [1.5], [MAX_DAYS_PASSED + 1], ["3"], [undefined]])("refuses %s", (days) => {
    expect(parseTakeDaysBack({ days }).ok).toBe(false);
  });
});

describe("takenBackText", () => {
  // Bug caught: the Narrator told the days "pass" when they were taken back, and so telling on as if time moved forward.
  it("says the days are taken back, in the singular and the plural", () => {
    expect(takenBackText(1)).toContain("1 day is taken back");
    expect(takenBackText(3)).toContain("3 days are taken back");
  });
});
