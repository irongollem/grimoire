import { describe, expect, it } from "vitest";
import { type Budgets, checkBudgets, formatBudgetReport, isFailure } from "./budgets";
import { aggregateRuns, type JourneyResult, type ResultsFile, type Sample } from "./results";

function sample(apiRequests: number, serialDepth: number): Sample {
  return {
    apiRequests, optionsRequests: apiRequests, apiBytes: 0, jsBytes: 0, cssBytes: 0, totalRequests: apiRequests, serialDepth,
    settledMs: 1, apiPaths: [], apiWaves: [], fcpMs: null, lcpMs: null, tbtMs: null, appReadyMs: null, contentReadyMs: null,
  };
}
const ok = (journey: string, step: string, api: number, depth: number): JourneyResult => ({
  journey, status: "ok", skipReason: null, steps: [aggregateRuns(step, [sample(api, depth)])],
});
const file = (journeys: JourneyResult[]): ResultsFile => ({
  schema: 1, startedAt: "t", base: "b", runsPerJourney: 1, profile: { cpuThrottle: 4, apiDelayMs: 150, viewport: { width: 1, height: 1 } }, journeys,
});
const budgets: Budgets = {
  journeys: {
    "dm-cold": { "dm-cold": { apiRequests: 41, serialDepth: 5, totalRequests: 41 } },
    "player-cold": { "player-cold": { apiRequests: 43, serialDepth: 5, totalRequests: 43 } },
  },
};

describe("checkBudgets", () => {
  it("fails a budgeted step whose ceiling is missing or not a number", () => {
    const broken = { journeys: { "dm-cold": { "dm-cold": { apiRequests: "41" } } } } as unknown as Budgets;
    const report = checkBudgets(file([ok("dm-cold", "dm-cold", 41, 5)]), broken);
    expect(report.missingSteps).toEqual([
      "dm-cold dm-cold: no numeric apiRequests budget",
      "dm-cold dm-cold: no numeric serialDepth budget",
      "dm-cold dm-cold: no numeric totalRequests budget",
    ]);
    expect(isFailure(report)).toBe(true);
  });

  it("fails a budget that is not a finite number, whatever its type", () => {
    for (const ceiling of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const broken: Budgets = { journeys: { "dm-cold": { "dm-cold": { apiRequests: ceiling, serialDepth: 5, totalRequests: 41 } } } };
      const report = checkBudgets(file([ok("dm-cold", "dm-cold", 10_000, 5)]), broken);
      expect(report.missingSteps).toEqual(["dm-cold dm-cold: no numeric apiRequests budget"]);
      expect(isFailure(report)).toBe(true);
    }
  });

  it("fails a gated metric the run could not measure, instead of passing it", () => {
    const run = file([ok("dm-cold", "dm-cold", 41, 5)]);
    run.journeys[0]!.steps[0]!.median.serialDepth = null;
    const report = checkBudgets(run, budgets);
    expect(report.missingSteps).toEqual(["dm-cold dm-cold: serialDepth was not measured"]);
    expect(isFailure(report)).toBe(true);
  });

  it("passes at exactly the budget", () => {
    const report = checkBudgets(file([ok("dm-cold", "dm-cold", 41, 5)]), budgets);
    expect(report.breaches).toEqual([]);
    expect(isFailure(report)).toBe(false);
  });

  it("fails on any metric going over", () => {
    const report = checkBudgets(file([ok("dm-cold", "dm-cold", 42, 6)]), budgets);
    expect(report.breaches.map((b) => b.metric)).toEqual(["apiRequests", "serialDepth", "totalRequests"]);
    expect(isFailure(report)).toBe(true);
    const text = formatBudgetReport(report);
    expect(text).toContain("OVER BUDGET");
    expect(text).toContain("budgets: FAILED");
    // A journey with a single step of its own name is listed once, not "dm-cold dm-cold".
    expect(text).not.toContain("dm-cold dm-cold");
  });

  it("hints to lower the budget on an improvement, without failing", () => {
    const report = checkBudgets(file([ok("dm-cold", "dm-cold", 30, 5)]), budgets);
    expect(report.improvements).toMatchObject([
      { metric: "apiRequests", budget: 41, actual: 30 },
      { metric: "totalRequests", budget: 41, actual: 30 },
    ]);
    expect(isFailure(report)).toBe(false);
    expect(formatBudgetReport(report)).toContain("lower budgets.json");
  });

  it("treats a skipped journey and an absent one as no data, not failure", () => {
    const skipped: JourneyResult = { journey: "player-cold", status: "skipped", skipReason: "no campaign", steps: [] };
    const report = checkBudgets(file([skipped]), budgets);
    expect(report.noData).toHaveLength(2);
    expect(isFailure(report)).toBe(false);
  });

  it("fails when a journey that ran no longer produces a budgeted step", () => {
    const report = checkBudgets(file([ok("dm-cold", "renamed", 1, 1)]), budgets);
    expect(report.missingSteps).toEqual(["dm-cold dm-cold"]);
    expect(report.unbudgeted).toContain("dm-cold renamed");
    expect(isFailure(report)).toBe(true);
  });

  it("does not ask for a budget for a journey that was skipped", () => {
    const skipped: JourneyResult = { journey: "new-one", status: "skipped", skipReason: "no campaign", steps: [] };
    const report = checkBudgets(file([ok("dm-cold", "dm-cold", 41, 5), skipped]), budgets);
    expect(report.unbudgeted).toEqual([]);
  });

  it("points out journeys nobody budgeted", () => {
    const report = checkBudgets(file([ok("dm-cold", "dm-cold", 41, 5), ok("new-one", "new-one", 1, 1)]), budgets);
    expect(report.unbudgeted).toContain("new-one (whole journey)");
    expect(isFailure(report)).toBe(false);
  });
});
