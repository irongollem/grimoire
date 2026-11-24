import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: {} }));

import { summarizeFreeAsks } from "./useFreeAskCost";

const now = new Date("2026-11-25T12:00:00Z");

describe("summarizeFreeAsks", () => {
  // Bug caught: a costly free answer averaged away into the day's total, so the long-conversation case never shows.
  it("names the dearest free answer and its size", () => {
    const s = summarizeFreeAsks(
      [
        { created_at: "2026-11-25T08:00:00Z", estimated_cost_usd_cents: 2, input_tokens: 3000 },
        { created_at: "2026-11-25T09:00:00Z", estimated_cost_usd_cents: 41, input_tokens: 38000 },
      ],
      now,
    );
    expect(s.dearest).toEqual({ usd: 0.41, inputTokens: 38000, at: "2026-11-25T09:00:00Z" });
    expect(s.days[0]).toEqual({ day: "2026-11-25", answers: 2, usd: 0.43 });
    expect(s.totalUsd).toBeCloseTo(0.43);
  });

  // Bug caught: quiet days missing from the list, so a jump after a quiet week reads as the normal level.
  it("keeps every day of the window, empty ones at zero, newest first", () => {
    const s = summarizeFreeAsks([], now, 3);
    expect(s.days.map((d) => [d.day, d.answers])).toEqual([["2026-11-25", 0], ["2026-11-24", 0], ["2026-11-23", 0]]);
    expect(s.dearest).toBeNull();
  });

  // Bug caught: the projection run from the whole month, hiding a spike that started this week.
  it("projects the month from the last seven days", () => {
    const s = summarizeFreeAsks(
      [
        { created_at: "2026-11-24T08:00:00Z", estimated_cost_usd_cents: 70, input_tokens: 1 },
        { created_at: "2026-11-05T08:00:00Z", estimated_cost_usd_cents: 900, input_tokens: 1 },
      ],
      now,
    );
    expect(s.monthlyProjectionUsd).toBeCloseTo((0.7 / 7) * 30);
  });

  // Bug caught: the view's numeric cost arriving as text ("0.43"), concatenated instead of added.
  it("adds a cost that arrives as text", () => {
    const s = summarizeFreeAsks([{ created_at: "2026-11-25T08:00:00Z", estimated_cost_usd_cents: "0.4314", input_tokens: 42009 }], now);
    expect(s.totalUsd).toBeCloseTo(0.004314);
  });
});

