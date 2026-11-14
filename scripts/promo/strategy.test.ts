import { describe, expect, it } from "vitest";
import type { PostedRecord } from "./publishing";
import type { Snapshot } from "./stats";
import { buildReport, classifyKind, latestEntries, median, type PostKind } from "./strategy";

const scene = { format: "reel" as const, shots: [{ device: "scene" }] };

describe("classifyKind", () => {
  it("calls a slides folder with no manifest a carousel, not a feature", () => {
    expect(classifyKind({ id: "steal-x", carousel: true, manifest: null })).toBe("steal-carousel");
  });

  it("tells a Steal this teaser from a living painting by its id", () => {
    expect(classifyKind({ id: "steal-toffee-maw-reel", carousel: false, manifest: scene })).toBe("steal-teaser");
    expect(classifyKind({ id: "inn-dawn", carousel: false, manifest: { ...scene, brand: false } })).toBe("living-painting");
  });

  it("does not call a Reel a painting because one shot is a scene", () => {
    const mixed = { format: "reel" as const, shots: [{ device: "scene" }, { device: "phone" }] };
    expect(classifyKind({ id: "x", carousel: false, manifest: mixed })).toBe("feature");
  });

  it("does not call a manifest with no shots a painting", () => {
    expect(classifyKind({ id: "x", carousel: false, manifest: { format: "reel", shots: [] } })).toBe("feature");
  });

  it("puts an unbranded screen Reel under short-feature and a branded one under feature", () => {
    const shots = [{ device: "phone" }];
    expect(classifyKind({ id: "songs-short", carousel: false, manifest: { format: "reel", brand: false, shots } })).toBe("short-feature");
    expect(classifyKind({ id: "combat-dm", carousel: false, manifest: { format: "reel", shots } })).toBe("feature");
  });

  it("keeps a YouTube video out of the Reels even when it is a scene", () => {
    expect(classifyKind({ id: "yt-x", carousel: false, manifest: { format: "youtube", shots: [{ device: "scene" }] } })).toBe("youtube");
  });

  it("gives null for a folder that is neither a carousel nor has a manifest", () => {
    expect(classifyKind({ id: "x", carousel: false, manifest: null })).toBeNull();
  });
});

describe("median", () => {
  it("averages the two middle values of an even count", () => {
    expect(median([1, 2, 3, 10])).toBe(2.5);
  });
  it("ignores missing values and is null for none", () => {
    expect(median([null, 4, null])).toBe(4);
    expect(median([null])).toBeNull();
  });
});

const POSTED = "2026-11-10T22:05:00Z";
const rec = (id: string, mediaId: string, postedAt = POSTED): PostedRecord => ({ id, account: "a", mediaId, permalink: "p", postedAt });
const snap = (mediaId: string, at: string, over: Partial<Snapshot> = {}): Snapshot => ({
  at, id: "x", mediaId, views: 100, reach: 100, likes: 5, comments: 0, shares: 1, saved: 1, avgWatchMs: 10_000, ...over,
});

function report(over: { snapshots: Snapshot[]; posted: PostedRecord[]; kinds: [string, PostKind][]; lengths: [string, number | null][] }) {
  return buildReport({ ...over, kinds: new Map(over.kinds), lengths: new Map(over.lengths) });
}

describe("buildReport", () => {
  it("marks a snapshot taken days later as late and keeps it out of the medians", () => {
    const r = report({
      snapshots: [snap("m1", "2026-11-14T22:05:00Z", { views: 900 })],
      posted: [rec("a", "m1")],
      kinds: [["a", "feature"]],
      lengths: [["a", 40]],
    });
    expect(r.posts[0].timing).toBe("late");
    expect(r.posts[0].views).toBe(900);
    expect(r.kinds[0].at24h).toBe(0);
    expect(r.kinds[0].medianViews).toBeNull();
  });

  it("marks a snapshot taken before the mark as early", () => {
    const r = report({ snapshots: [snap("m1", "2026-11-11T02:00:00Z")], posted: [rec("a", "m1")], kinds: [["a", "feature"]], lengths: [["a", 40]] });
    expect(r.posts[0].timing).toBe("early");
  });

  it("computes the watched share from the video length, and keeps a looped Reel above 100%", () => {
    const r = report({
      snapshots: [snap("m1", "2026-11-11T22:05:00Z", { avgWatchMs: 24_000 })],
      posted: [rec("a", "m1")],
      kinds: [["a", "living-painting"]],
      lengths: [["a", 20]],
    });
    expect(r.posts[0].timing).toBe("24h");
    expect(r.posts[0].watchedShare).toBeCloseTo(1.2);
    expect(r.kinds[0].best).toEqual({ id: "a", watchedShare: expect.closeTo(1.2) });
  });

  it("gives a carousel no watched share instead of dividing by zero", () => {
    const r = report({
      snapshots: [snap("m1", "2026-11-11T22:05:00Z", { avgWatchMs: null })],
      posted: [rec("c", "m1")],
      kinds: [["c", "steal-carousel"]],
      lengths: [["c", null]],
    });
    expect(r.posts[0].watchedShare).toBeNull();
    const zero = report({ snapshots: [snap("m1", "2026-11-11T22:05:00Z")], posted: [rec("c", "m1")], kinds: [["c", "feature"]], lengths: [["c", 0]] });
    expect(zero.posts[0].watchedShare).toBeNull();
  });

  it("takes the median of an even count of posts, per kind only", () => {
    const at = "2026-11-11T22:05:00Z";
    const r = report({
      snapshots: [
        snap("m1", at, { views: 100 }), snap("m2", at, { views: 200 }),
        snap("m3", at, { views: 5000 }),
      ],
      posted: [rec("a", "m1"), rec("b", "m2"), rec("c", "m3")],
      kinds: [["a", "feature"], ["b", "feature"], ["c", "living-painting"]],
      lengths: [["a", 30], ["b", 30], ["c", 20]],
    });
    expect(r.kinds.find((k) => k.kind === "feature")?.medianViews).toBe(150);
    expect(r.kinds.find((k) => k.kind === "living-painting")?.medianViews).toBe(5000);
  });

  it("leaves a YouTube video and an unclassified post out of the report", () => {
    const r = report({
      snapshots: [snap("m1", POSTED), snap("m2", POSTED)],
      posted: [rec("yt", "m1"), rec("lost", "m2")],
      kinds: [["yt", "youtube"]],
      lengths: [],
    });
    expect(r.posts).toEqual([]);
    expect(r.ceiling).toBeNull();
  });

  it("reports the ceiling as the highest views any snapshot of a posted post reached", () => {
    const r = report({
      snapshots: [snap("m1", "2026-11-11T22:05:00Z", { views: 120 }), snap("m1", "2026-11-20T22:05:00Z", { views: 4000 }), snap("m2", POSTED, { views: 99_999 })],
      posted: [rec("a", "m1")],
      kinds: [["a", "feature"]],
      lengths: [["a", 30]],
    });
    expect(r.ceiling).toEqual({ id: "a", views: 4000 });
  });

  it("shows a missing number as null, not zero", () => {
    const r = report({
      snapshots: [snap("m1", "2026-11-11T22:05:00Z", { reach: null, likes: null, avgWatchMs: null })],
      posted: [rec("a", "m1")],
      kinds: [["a", "feature"]],
      lengths: [["a", 30]],
    });
    expect(r.posts[0]).toMatchObject({ likesPerReach: null, avgWatchS: null, watchedShare: null });
  });
});

describe("latestEntries", () => {
  it("returns the newest entries from the top and skips the title above them", () => {
    const md = "# Title\n\nintro\n\n## 3\none\n\n## 2\ntwo\n\n## 1\nthree\n";
    expect(latestEntries(md, 2)).toEqual(["## 3\none", "## 2\ntwo"]);
  });
});
