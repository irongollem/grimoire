import { describe, expect, it } from "vitest";
import { MAX_DAYS_PASSED, parsePassDays } from "./days.ts";

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
