import { describe, expect, it } from "vitest";
import { type Budgets, checkBudgets, formatBudgetReport, isFailure } from "./budgets";
import { aggregateRuns, type JourneyResult, type ResultsFile, type Sample } from "./results";

function sample(apiRequests: number, serialDepth: number): Sample {
  return {
    apiRequests, optionsRequests: apiRequests, apiBytes: 0, jsBytes: 0, cssBytes: 0, codeRequests: apiRequests, totalRequests: apiRequests, serialDepth,
    settledMs: 1, apiPaths: [], apiWaves: [], assetPaths: [], fcpMs: null, lcpMs: null, tbtMs: null, appReadyMs: null, contentReadyMs: null,
  };
}
const ok = (journey: string, step: string, api: number, depth: number): JourneyResult => runs(journey, step, api, [depth]);
const runs = (journey: string, step: string, api: number, depths: number[]): JourneyResult => ({
  journey, status: "ok", skipReason: null, steps: [aggregateRuns(step, depths.map((depth) => sample(api, depth)))],
});
const file = (journeys: JourneyResult[]): ResultsFile => ({
  schema: 1, startedAt: "t", base: "b", runsPerJourney: 1, profile: { cpuThrottle: 4, apiDelayMs: 150, viewport: { width: 1, height: 1 } }, journeys,
});
const budgets: Budgets = {
  journeys: {
    "dm-cold": { "dm-cold": { apiRequests: 41, codeRequests: 41, serialDepth: 5 } },
    "player-cold": { "player-cold": { apiRequests: 43, codeRequests: 43, serialDepth: 5 } },
  },
};

describe("checkBudgets", () => {
  it("fails a budgeted step whose ceiling is missing or not a number", () => {
    const broken = { journeys: { "dm-cold": { "dm-cold": { apiRequests: "41" } } } } as unknown as Budgets;
    const report = checkBudgets(file([ok("dm-cold", "dm-cold", 41, 5)]), broken);
    expect(report.missingSteps).toEqual([
      "dm-cold dm-cold: no numeric apiRequests budget",
      "dm-cold dm-cold: no numeric codeRequests budget",
      "dm-cold dm-cold: no numeric serialDepth budget",
    ]);
    expect(isFailure(report)).toBe(true);
  });

  it("fails a budget that is not a finite number, whatever its type", () => {
    for (const ceiling of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const broken: Budgets = { journeys: { "dm-cold": { "dm-cold": { apiRequests: ceiling, codeRequests: 41, serialDepth: 5 } } } };
      const report = checkBudgets(file([ok("dm-cold", "dm-cold", 10_000, 5)]), broken);
      expect(report.missingSteps).toEqual(["dm-cold dm-cold: no numeric apiRequests budget"]);
      expect(isFailure(report)).toBe(true);
    }
  });

  it("fails a gated metric the run could not measure, instead of passing it", () => {
    const run = file([ok("dm-cold", "dm-cold", 41, 5)]);
    run.journeys[0]!.steps[0]!.median.apiRequests = null;
    const report = checkBudgets(run, budgets);
    expect(report.missingSteps).toEqual(["dm-cold dm-cold: apiRequests was not measured"]);
    expect(isFailure(report)).toBe(true);
  });

  it("passes at exactly the budget", () => {
    const report = checkBudgets(file([ok("dm-cold", "dm-cold", 41, 5)]), budgets);
    expect(report.breaches).toEqual([]);
    expect(isFailure(report)).toBe(false);
  });

  it("fails on any metric going over", () => {
    const report = checkBudgets(file([ok("dm-cold", "dm-cold", 42, 6)]), budgets);
    expect(report.breaches.map((b) => b.metric)).toEqual(["apiRequests", "codeRequests", "serialDepth"]);
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
      { metric: "apiRequests", budget: 41, actual: 30, suggested: 30 },
      { metric: "codeRequests", budget: 41, actual: 30, suggested: 30 },
    ]);
    expect(isFailure(report)).toBe(false);
    expect(formatBudgetReport(report)).toContain("lower budgets.json");
  });

  it("fails a results file written before codeRequests existed, instead of passing it (#1146)", () => {
    // An older file has no key at all: undefined compares false both ways, so an unguarded check passes every budget.
    const run = file([ok("dm-cold", "dm-cold", 41, 5)]);
    const step = run.journeys[0]!.steps[0]!;
    delete (step.median as Partial<typeof step.median>).codeRequests;
    for (const r of step.runs) delete (r as Partial<Sample>).codeRequests;
    const report = checkBudgets(run, budgets);
    expect(report.missingSteps).toEqual(["dm-cold dm-cold: codeRequests was not measured"]);
    expect(isFailure(report)).toBe(true);
  });

  describe("serialDepth (#1146: timing splits one burst across waves, never joins a real chain)", () => {
    it("passes a step where one run read deeper, judging the shallowest run", () => {
      // Median of 4, 7, 7 is 7, which is the flake #1146 is about; the shallowest run is 4.
      const report = checkBudgets(file([runs("dm-cold", "dm-cold", 41, [4, 7, 7])]), budgets);
      expect(report.breaches).toEqual([]);
    });

    it("fails a new wave, which deepens every run, and shows each run", () => {
      const report = checkBudgets(file([runs("dm-cold", "dm-cold", 41, [6, 7, 6])]), budgets);
      expect(report.breaches).toMatchObject([{ metric: "serialDepth", budget: 5, actual: 6, runs: [6, 7, 6] }]);
      expect(formatBudgetReport(report)).toContain("6 7 6");
    });

    it("does not ask to lower a depth ceiling within its headroom of two waves", () => {
      const ceiling: Budgets = { journeys: { "dm-cold": { "dm-cold": { apiRequests: 41, codeRequests: 41, serialDepth: 6 } } } };
      expect(checkBudgets(file([runs("dm-cold", "dm-cold", 41, [4, 5, 6])]), ceiling).improvements).toEqual([]);
      // Three waves below: the chain itself got shorter. The new ceiling keeps the headroom: 3 + 2.
      expect(checkBudgets(file([runs("dm-cold", "dm-cold", 41, [3, 4, 3])]), ceiling).improvements).toMatchObject([
        { metric: "serialDepth", actual: 3, suggested: 5 },
      ]);
    });
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
