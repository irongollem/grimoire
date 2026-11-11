import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { MediaInsights } from "./instagram";
import { dayMarkDue, readSnapshots, type Snapshot, STATS_FILE, takeSnapshot, viewsAt } from "./stats";

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

describe("the snapshot file and the snapshot", () => {
  let root = "";
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });
  function promoOut(posts: string[]): string {
    root = mkdtempSync(join(tmpdir(), "promo-stats-"));
    posts.forEach((id, i) => {
      mkdirSync(join(root, id));
      writeFileSync(join(root, id, "manifest.json"), "{}");
      writeFileSync(join(root, id, "posted.json"), JSON.stringify({ id, account: "a", mediaId: `m-${id}`, permalink: "p", postedAt: `2026-11-0${i + 1}T22:05:00Z` }));
    });
    return root;
  }
  const insights = (views: number): MediaInsights => ({ views, reach: null, likes: null, comments: null, shares: null, saved: null, avgWatchMs: null });

  // Fails on: one line cut short mid-append (the Mac slept) stopping promo:stats for good.
  it("reads past a line cut short", () => {
    const dir = promoOut([]);
    writeFileSync(join(dir, STATS_FILE), `${JSON.stringify(snap("2026-11-11T22:05:00Z", 5))}\n{"at":"2026-11-11T23:05`);
    expect(readSnapshots(dir).map((s) => s.views)).toEqual([5]);
  });

  // Fails on: one post that cannot be read (deleted on Instagram) throwing away every other post's numbers.
  it("keeps every other post's numbers when one cannot be read, and names the one", async () => {
    const dir = promoOut(["a", "b", "c"]);
    const read = async (_t: string, mediaId: string) => {
      if (mediaId === "m-b") throw new Error("media deleted");
      return insights(mediaId === "m-a" ? 10 : 30);
    };
    const { rows, records, failed } = await takeSnapshot("token", dir, read);
    expect(rows.map((r) => r.id).sort()).toEqual(["a", "c"]);
    expect(failed).toEqual([{ id: "b", error: "media deleted" }]);
    expect(records.map((r) => r.id)).toEqual(["c", "b", "a"]);
    expect(readFileSync(join(dir, STATS_FILE), "utf8").trim().split("\n")).toHaveLength(2);
  });

  it("asks for several posts at once rather than one after another", async () => {
    const dir = promoOut(["a", "b", "c", "d"]);
    let inFlight = 0;
    let most = 0;
    const read = async () => {
      inFlight++;
      most = Math.max(most, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return insights(1);
    };
    await takeSnapshot("token", dir, read);
    expect(most).toBeGreaterThan(1);
  });
});
