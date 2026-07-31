import { describe, it, expect } from "vitest";
import { broadcastOffsetSeconds, shouldResync, RESYNC_THRESHOLD_S } from "@/lib/audio/broadcastOffset";

const NOW = Date.parse("2026-07-28T20:00:30.000Z");

function row(over: Partial<{ started_at: string | null; is_paused: boolean; paused_at: string | null }> = {}) {
  return { started_at: "2026-07-28T20:00:00.000Z", is_paused: false, paused_at: null, ...over };
}

describe("broadcastOffsetSeconds", () => {
  it("derives the position from the anchor, so a late joiner lands in the right place", () => {
    expect(broadcastOffsetSeconds(row(), NOW)).toBe(30);
  });

  it("freezes at paused_at rather than letting the clock run", () => {
    const paused = row({ is_paused: true, paused_at: "2026-07-28T20:00:10.000Z" });
    // Five minutes into a break, a running clock would put the player well past
    // the end of the track.
    const muchLater = Date.parse("2026-07-28T20:05:00.000Z");
    expect(broadcastOffsetSeconds(paused, muchLater)).toBe(10);
  });

  it("keeps running when paused is set but no instant was recorded", () => {
    expect(broadcastOffsetSeconds(row({ is_paused: true }), NOW)).toBe(30);
  });

  it("is zero with no anchor", () => {
    expect(broadcastOffsetSeconds(row({ started_at: null }), NOW)).toBe(0);
  });

  it("is zero rather than NaN on an unparseable anchor", () => {
    expect(broadcastOffsetSeconds(row({ started_at: "not a date" }), NOW)).toBe(0);
  });

  it("never goes negative when a client's clock runs behind the DM's", () => {
    const early = Date.parse("2026-07-28T19:59:00.000Z");
    expect(broadcastOffsetSeconds(row(), early)).toBe(0);
  });

  it("ignores an unparseable paused_at and keeps running", () => {
    const paused = row({ is_paused: true, paused_at: "nonsense" });
    expect(broadcastOffsetSeconds(paused, NOW)).toBe(30);
  });
});

describe("shouldResync", () => {
  it("leaves inaudible drift alone", () => {
    expect(shouldResync(30, 30 + RESYNC_THRESHOLD_S - 0.1)).toBe(false);
  });

  it("corrects real drift in either direction", () => {
    expect(shouldResync(30, 40)).toBe(true);
    expect(shouldResync(40, 30)).toBe(true);
  });
});
