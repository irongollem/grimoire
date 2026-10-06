import { describe, expect, it } from "vitest";
import { buildEntry, parseHistory, summarize } from "./history";
import { aggregateRuns, type ResultsFile, type Sample } from "./results";

const sample: Sample = {
  apiRequests: 41, optionsRequests: 41, apiBytes: 1, jsBytes: 1, cssBytes: 1, totalRequests: 1, serialDepth: 5, settledMs: 1200,
  apiPaths: ["GET /x"], fcpMs: 90, lcpMs: 90, tbtMs: 10, appReadyMs: 500, contentReadyMs: 800,
};
const results: ResultsFile = {
  schema: 1, startedAt: "t", base: "b", runsPerJourney: 3,
  profile: { cpuThrottle: 4, apiDelayMs: 150, viewport: { width: 1, height: 1 } },
  journeys: [
    { journey: "dm-cold", status: "ok", skipReason: null, steps: [aggregateRuns("dm-cold", [sample])] },
    { journey: "player-cold", status: "skipped", skipReason: "no campaign", steps: [] },
  ],
};

describe("buildEntry", () => {
  it("keeps medians per journey and step, and leaves skipped journeys out", () => {
    const entry = buildEntry(results, "abcdef0123", "2026-10-07T00:00:00Z", { files: 37, raw: 3, gzip: 2, brotli: 1 });
    expect(Object.keys(entry.journeys)).toEqual(["dm-cold"]);
    expect(entry.journeys["dm-cold"]?.["dm-cold"]?.apiRequests).toBe(41);
    expect(entry.criticalPath?.gzip).toBe(2);
    expect(JSON.stringify(entry)).not.toContain("GET /x");
  });
});

describe("parseHistory", () => {
  it("reports unreadable lines instead of dropping them silently", () => {
    const good = JSON.stringify(buildEntry(results, "a", "d", null));
    const parsed = parseHistory(`${good}\n{broken\n\n${good}\n`);
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.bad).toEqual([2]);
  });
});

describe("summarize", () => {
  it("shows the last N entries oldest first, n/a where a journey is missing", () => {
    const entries = ["1111111aaa", "2222222bbb", "3333333ccc"].map((sha, i) => buildEntry(results, sha, `2026-10-0${i + 1}T00:00:00Z`, null));
    const text = summarize(entries, 2);
    expect(text).not.toContain("1111111");
    expect(text.indexOf("2222222")).toBeLessThan(text.indexOf("3333333"));
    expect(text).toContain("41");
    expect(text).toContain("n/a");
  });
});
