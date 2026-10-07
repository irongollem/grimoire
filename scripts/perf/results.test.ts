import { describe, expect, it } from "vitest";
import { aggregateRuns, compareResults, formatComparison, formatDelta, formatValue, formatTable, type JourneyResult, type ResultsFile, type Sample } from "./results";

function sample(overrides: Partial<Sample> = {}): Sample {
  return {
    apiRequests: 10,
    optionsRequests: 2,
    apiBytes: 2048,
    jsBytes: 1_000_000,
    cssBytes: 5000,
    totalRequests: 30,
    serialDepth: 3,
    settledMs: 2000,
    apiPaths: ["GET /rest/v1/a"],
    apiWaves: [1],
    fcpMs: 800,
    lcpMs: 1200,
    tbtMs: 100,
    appReadyMs: 600,
    contentReadyMs: 1500,
    ...overrides,
  };
}

function file(journeys: JourneyResult[]): ResultsFile {
  return {
    schema: 1,
    startedAt: "t",
    base: "b",
    runsPerJourney: 3,
    profile: { cpuThrottle: 4, apiDelayMs: 150, viewport: { width: 1, height: 1 } },
    journeys,
  };
}

const ok = (journey: string, runs: Sample[]): JourneyResult => ({ journey, status: "ok", skipReason: null, steps: [aggregateRuns(journey, runs)] });

describe("aggregateRuns", () => {
  it("takes the median per metric and shows the request list of the median run", () => {
    const step = aggregateRuns("x", [
      sample({ apiRequests: 5, settledMs: 100, apiPaths: ["fast"] }),
      sample({ apiRequests: 50, settledMs: 300, apiPaths: ["slow"] }),
      sample({ apiRequests: 9, settledMs: 200, apiPaths: ["middle"] }),
    ]);
    expect(step.median.apiRequests).toBe(9);
    expect(step.representativeApiPaths).toEqual(["middle"]);
  });

  it("keeps an unmeasurable metric null instead of 0", () => {
    const step = aggregateRuns("x", [sample({ fcpMs: null }), sample({ fcpMs: null })]);
    expect(step.median.fcpMs).toBeNull();
  });
});

describe("formatting", () => {
  it("scales bytes and rounds times", () => {
    expect(formatValue(512, "bytes")).toBe("512B");
    expect(formatValue(2048, "bytes")).toBe("2.0kB");
    expect(formatValue(3 * 1024 * 1024, "bytes")).toBe("3.00MB");
    expect(formatValue(1234.6, "ms")).toBe("1235ms");
    expect(formatValue(null, "ms")).toBe("n/a");
  });

  it("renders deltas with sign and percentage", () => {
    expect(formatDelta(10, 7.5, "count")).toBe("-2.5 (-25%)");
    expect(formatDelta(10, 15, "count")).toBe("+5 (+50%)");
    expect(formatDelta(4, 4, "count")).toBe("0 (0%)");
    expect(formatDelta(0, 3, "count")).toBe("+3");
    expect(formatDelta(null, 3, "count")).toBe("n/a");
  });

  it("prints skipped journeys with their reason", () => {
    const table = formatTable([{ journey: "player-cold", status: "skipped", skipReason: "no campaign", steps: [] }, ok("dm-warm", [sample()])]);
    expect(table).toContain("skipped: no campaign");
    expect(table).toContain("dm-warm");
  });
});

describe("compareResults", () => {
  it("pairs metrics and reports steps present on one side only", () => {
    const a = file([ok("dm-cold", [sample({ apiRequests: 40 })]), ok("dm-warm", [sample()])]);
    const b = file([ok("dm-cold", [sample({ apiRequests: 10 })])]);
    const { rows, unmatched } = compareResults(a, b);
    const row = rows.find((r) => r.metric === "apiRequests");
    expect(row).toMatchObject({ journey: "dm-cold", before: 40, after: 10 });
    expect(unmatched).toEqual(["dm-warm dm-warm: only in the first file"]);
    expect(formatComparison(rows, unmatched)).toContain("-30 (-75%)");
  });
});

describe("compare with an older result file", () => {
  it("reads a metric the older file never recorded as absent, not zero", () => {
    const older = file([ok("dm-cold", [sample()])]);
    const step = older.journeys[0]?.steps[0];
    if (step === undefined) throw new Error("fixture has a step");
    delete (step.median as Partial<typeof step.median>).appReadyMs;
    const { rows } = compareResults(older, file([ok("dm-cold", [sample()])]));
    expect(rows.find((r) => r.metric === "appReadyMs")).toMatchObject({ before: null, after: 600 });
  });
});
