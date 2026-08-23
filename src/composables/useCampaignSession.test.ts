import { describe, expect, it } from "vitest";
import {
  formatSessionElapsed,
  isSessionStale,
  STALE_SESSION_HOURS,
} from "./useCampaignSession";
import type { CampaignSessionState } from "@/types/session.types";

const AT = (iso: string) => Date.parse(iso);

function row(patch: Partial<CampaignSessionState> = {}): CampaignSessionState {
  return {
    id: "session-1",
    campaign_id: "campaign-1",
    user_id: "dm-1",
    is_running: true,
    started_at: "2026-08-22T19:00:00.000Z",
    ended_at: null,
    created_at: "2026-08-22T19:00:00.000Z",
    updated_at: "2026-08-22T19:00:00.000Z",
    ...patch,
  };
}

describe("formatSessionElapsed", () => {
  it("reads as a duration, not a wall clock", () => {
    expect(formatSessionElapsed("2026-08-22T19:00:00.000Z", AT("2026-08-22T20:47:00.000Z"))).toBe("1:47");
  });

  it("pads minutes but not hours", () => {
    expect(formatSessionElapsed("2026-08-22T19:00:00.000Z", AT("2026-08-22T19:05:00.000Z"))).toBe("0:05");
    expect(formatSessionElapsed("2026-08-22T19:00:00.000Z", AT("2026-08-23T07:03:00.000Z"))).toBe("12:03");
  });

  // A session started 40 seconds ago is still 0:00 — the clock ticks once a
  // minute, so rounding down is what keeps the rendered value and the timer in
  // step rather than showing a minute that has not finished.
  it("floors to the minute", () => {
    expect(formatSessionElapsed("2026-08-22T19:00:00.000Z", AT("2026-08-22T19:00:40.000Z"))).toBe("0:00");
  });

  // Clock skew between the DM's browser and Postgres can put `started_at` a
  // moment in the future. A negative duration is never the right thing to show.
  it("never renders a negative duration", () => {
    expect(formatSessionElapsed("2026-08-22T19:00:00.000Z", AT("2026-08-22T18:58:00.000Z"))).toBe("0:00");
  });

  it("has nothing to say without a start", () => {
    expect(formatSessionElapsed(null)).toBe("");
    expect(formatSessionElapsed("not a date")).toBe("");
  });
});

describe("isSessionStale", () => {
  const started = "2026-08-22T19:00:00.000Z";

  it("leaves a long evening alone", () => {
    expect(isSessionStale(row({ started_at: started }), AT("2026-08-23T00:30:00.000Z"))).toBe(false);
  });

  // The failure this exists for: a DM closed the laptop on Thursday and every
  // NPC they reveal while prepping on Sunday announces itself to players who
  // are not at the table.
  it("flags a session nobody ended", () => {
    expect(isSessionStale(row({ started_at: started }), AT("2026-08-25T14:00:00.000Z"))).toBe(true);
  });

  it("turns over exactly at the threshold", () => {
    const boundary = AT(started) + STALE_SESSION_HOURS * 60 * 60 * 1000;
    expect(isSessionStale(row({ started_at: started }), boundary)).toBe(false);
    expect(isSessionStale(row({ started_at: started }), boundary + 1)).toBe(true);
  });

  // Only a *running* session can be stale. An ended one keeps its started_at so
  // it still describes a span, and reading that as staleness would prompt the
  // DM about a session they already closed.
  it("ignores a session that has ended", () => {
    expect(
      isSessionStale(
        row({ started_at: started, is_running: false, ended_at: "2026-08-22T23:00:00.000Z" }),
        AT("2026-08-25T14:00:00.000Z"),
      ),
    ).toBe(false);
  });

  it("treats an absent or unparseable start as not stale", () => {
    expect(isSessionStale(null)).toBe(false);
    expect(isSessionStale(row({ started_at: null }))).toBe(false);
    expect(isSessionStale(row({ started_at: "whenever" }))).toBe(false);
  });
});
