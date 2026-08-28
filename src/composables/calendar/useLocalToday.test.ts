import { describe, it, expect } from "vitest";
import { localDateString } from "./useLocalToday";

describe("localDateString", () => {
  it("formats the LOCAL calendar date, zero-padded", () => {
    // Construct via local-time parts so the expectation holds in any TZ.
    expect(localDateString(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(localDateString(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("differs from the UTC date exactly when local midnight has passed but UTC's has not", () => {
    // 00:30 local on Aug 6 in any TZ ahead of UTC is still Aug 5 in UTC —
    // the original bug kept yesterday's proposals visible until small hours.
    const d = new Date(2026, 7, 6, 0, 30);
    expect(localDateString(d)).toBe("2026-08-06");
    if (d.getTimezoneOffset() < 0) {
      expect(d.toISOString().slice(0, 10)).toBe("2026-08-05");
    }
  });
});
