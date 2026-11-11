import { describe, expect, it } from "vitest";
import { dayMarkDue, type Snapshot, viewsAt } from "./stats";

const POSTED = "2026-11-10T22:05:00Z";
const snap = (at: string, views: number, mediaId = "m1"): Snapshot => ({
  at,
  id: "ep",
  mediaId,
  views,
  reach: null,
  likes: null,
  comments: null,
  shares: null,
  saved: null,
  avgWatchMs: null,
});

describe("viewsAt", () => {
  it("takes the snapshot nearest the one-day mark, not the latest total", () => {
    const snaps = [snap("2026-11-11T21:05:00Z", 90), snap("2026-11-11T22:06:00Z", 100), snap("2026-11-14T22:05:00Z", 400)];
    expect(viewsAt(snaps, "m1", POSTED)).toBe(100);
  });

  it("gives null when no snapshot lies near the mark, so an old post never borrows its later total", () => {
    expect(viewsAt([snap("2026-11-13T22:05:00Z", 400)], "m1", POSTED)).toBeNull();
  });

  it("reads only the post's own snapshots", () => {
    expect(viewsAt([snap("2026-11-11T22:05:00Z", 999, "m2")], "m1", POSTED)).toBeNull();
  });
});

describe("dayMarkDue", () => {
  const posted = [{ id: "ep", account: "a", mediaId: "m1", permalink: "p", postedAt: POSTED }];

  it("asks for a snapshot in the hourly run nearest a post's first day", () => {
    expect(dayMarkDue(posted, new Date("2026-11-11T22:05:00Z"))).toBe(true);
  });

  it("does not snapshot every hour", () => {
    expect(dayMarkDue(posted, new Date("2026-11-11T21:05:00Z"))).toBe(false);
    expect(dayMarkDue(posted, new Date("2026-11-11T23:05:00Z"))).toBe(false);
  });
});
