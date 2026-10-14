import { describe, expect, it } from "vitest";
import { accountSegment, countBySegment, NEW_ACCOUNT_DAYS, RECENT_ACTIVITY_DAYS } from "./accountSegments";

const NOW = new Date("2026-10-14T12:00:00Z");
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY).toISOString();

function user(over: Partial<{ created: number; active: number; owned: number; playing: number }> = {}) {
  return {
    created_at: ago(over.created ?? 200),
    last_active_at: ago(over.active ?? 1),
    campaigns_owned: over.owned ?? 0,
    campaigns_playing: over.playing ?? 0,
  };
}

describe("accountSegment", () => {
  it("is new below the age threshold, whatever else is true", () => {
    expect(accountSegment(user({ created: NEW_ACCOUNT_DAYS - 0.5, active: 90, owned: 2 }), NOW)).toBe("new");
  });
  it("is no longer new at exactly the threshold", () => {
    expect(accountSegment(user({ created: NEW_ACCOUNT_DAYS }), NOW)).not.toBe("new");
  });
  it("is active with a campaign and recent activity", () => {
    expect(accountSegment(user({ owned: 1 }), NOW)).toBe("active");
  });
  it("counts playing in another campaign as having one", () => {
    expect(accountSegment(user({ playing: 1 }), NOW)).toBe("active");
  });
  it("is exploring with no campaign and recent activity", () => {
    expect(accountSegment(user(), NOW)).toBe("exploring");
  });
  it("treats exactly the recency threshold as recent", () => {
    expect(accountSegment(user({ active: RECENT_ACTIVITY_DAYS, owned: 1 }), NOW)).toBe("active");
  });
  it("is lapsed with a campaign and stale activity", () => {
    expect(accountSegment(user({ active: RECENT_ACTIVITY_DAYS + 1, owned: 1 }), NOW)).toBe("lapsed");
  });
  it("is bounced with no campaign and stale activity", () => {
    expect(accountSegment(user({ active: RECENT_ACTIVITY_DAYS + 1 }), NOW)).toBe("bounced");
  });
});

describe("countBySegment", () => {
  it("tallies every segment", () => {
    const counts = countBySegment(
      [user({ created: 1 }), user({ owned: 1 }), user(), user({ active: 60, owned: 1 }), user({ active: 60 }), user({ active: 60 })],
      NOW,
    );
    expect(counts).toEqual({ new: 1, active: 1, exploring: 1, lapsed: 1, bounced: 2 });
  });
});
