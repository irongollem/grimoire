import type { NumericMetric, ResultsFile, StepResult } from "./results";

/**
 * Only counts are gated, and only counts the code under test decides. Bytes and
 * times move with the machine. Fonts and images are left out too: whether a web
 * font or the loading flag's image loads inside the window depends on what is
 * painted while it is open, so `totalRequests` moved by one between runs of the
 * same commit (#1146). `codeRequests` (chunks and stylesheets) is the number
 * that rises when the chunk graph fragments again (#999 2.14).
 */
export const GATED_METRICS = ["apiRequests", "codeRequests", "serialDepth"] as const satisfies readonly NumericMetric[];
export type GatedMetric = (typeof GATED_METRICS)[number];

/**
 * How the runs of a step become the one number compared to its ceiling, and how
 * far below the ceiling a run may land before the report asks for it to be lowered.
 *
 * The request counts are the same in every run, so the median is any run.
 *
 * Serial depth is not. Under the CPU throttle the page issues one burst of
 * parallel requests over a few hundred milliseconds, so a late member can start
 * after an early one has finished and is counted a wave deeper (dm-cold has read
 * 4 to 7 on one commit, #1146). Timing only ever adds links that way: a request
 * that waits on another always starts after it. So the shallowest run is the
 * closest to the real chain, and a real new wave deepens every run, the
 * shallowest included. Even the minimum of three runs read 4 to 6 on dm-cold
 * across main, which is the headroom: a depth budget is the deepest main has
 * measured, and only a run more than `headroom` below it is a real improvement.
 */
export const GATES: Record<GatedMetric, { combine: "median" | "min"; headroom: number }> = {
  apiRequests: { combine: "median", headroom: 0 },
  codeRequests: { combine: "median", headroom: 0 },
  serialDepth: { combine: "min", headroom: 2 },
};

/** Each run's value of a metric, leaving out runs that did not record it (a file written before the metric existed). */
function runValues(step: StepResult, metric: GatedMetric): number[] {
  return step.runs.map((run): unknown => run[metric]).filter((value): value is number => typeof value === "number");
}

/**
 * The number a step is judged on; null when no run measured it. A metric absent from an older results file is
 * null too, never `undefined`, which would compare false both ways and pass every budget.
 */
export function gatedValue(step: StepResult, metric: GatedMetric): number | null {
  if (GATES[metric].combine === "min") {
    const measured = runValues(step, metric);
    return measured.length === 0 ? null : Math.min(...measured);
  }
  const value: number | null | undefined = step.median[metric];
  return value === undefined ? null : value;
}

/** journey -> step label -> metric -> ceiling. */
export interface Budgets {
  journeys: Record<string, Record<string, Record<GatedMetric, number>>>;
}

export interface Breach {
  journey: string;
  step: string;
  metric: GatedMetric;
  budget: number;
  actual: number;
  /** Every run's value, so a reader can tell one deep run from a step that got deeper. */
  runs: number[];
  /** For an improvement: the ceiling to write into budgets.json (the value plus the metric's headroom). */
  suggested: number;
}

export interface BudgetReport {
  breaches: Breach[];
  /** Measured further below budget than the metric's headroom: the budget should be lowered in the same change. */
  improvements: Breach[];
  /** Budgeted but not measured (skipped, not selected, or never ran): no data, never a failure. */
  noData: string[];
  /** Steps a run produced that no budget covers; a new journey should get one. */
  unbudgeted: string[];
  /** Budgeted steps that a journey which did run no longer produces: the journey changed shape. */
  missingSteps: string[];
}

/**
 * Compares a results file to the budgets.
 *
 * A skipped journey (CI has no seated player fixture) and a journey absent from
 * the results are "no data": the gate cannot judge what it did not measure, and
 * failing there would make the gate unrunnable on partial runs. A budgeted step
 * missing from a journey that DID run is different (the journey was reshaped
 * behind the gate's back) and counts as a failure, reported in `missingSteps`.
 */
export function checkBudgets(results: ResultsFile, budgets: Budgets): BudgetReport {
  const report: BudgetReport = { breaches: [], improvements: [], noData: [], unbudgeted: [], missingSteps: [] };
  for (const [journeyName, steps] of Object.entries(budgets.journeys)) {
    const journey = results.journeys.find((j) => j.journey === journeyName);
    if (journey === undefined) {
      report.noData.push(`${journeyName}: not in this run`);
      continue;
    }
    if (journey.status === "skipped") {
      report.noData.push(`${journeyName}: skipped (${journey.skipReason ?? "no reason recorded"})`);
      continue;
    }
    for (const [stepLabel, metrics] of Object.entries(steps)) {
      const step = journey.steps.find((s) => s.label === stepLabel);
      if (step === undefined) {
        report.missingSteps.push(`${journeyName} ${stepLabel}`);
        continue;
      }
      for (const metric of GATED_METRICS) {
        const actual = gatedValue(step, metric);
        if (actual === null) {
          report.missingSteps.push(`${journeyName} ${stepLabel}: ${metric} was not measured`);
          continue;
        }
        const budget: unknown = metrics[metric];
        // budgets.json is hand-edited: a missing or mistyped ceiling must fail
        // loudly, not compare against undefined and pass every time.
        if (typeof budget !== "number" || !Number.isFinite(budget)) {
          report.missingSteps.push(`${journeyName} ${stepLabel}: no numeric ${metric} budget`);
          continue;
        }
        const { headroom } = GATES[metric];
        const row = { journey: journeyName, step: stepLabel, metric, budget, actual, runs: runValues(step, metric), suggested: actual + headroom };
        if (actual > budget) report.breaches.push(row);
        else if (actual + headroom < budget) report.improvements.push(row);
      }
    }
    for (const step of journey.steps) {
      if (steps[step.label] === undefined) report.unbudgeted.push(`${journeyName} ${step.label}`);
    }
  }
  for (const journey of results.journeys) {
    if (journey.status === "ok" && budgets.journeys[journey.journey] === undefined) report.unbudgeted.push(`${journey.journey} (whole journey)`);
  }
  return report;
}

export function isFailure(report: BudgetReport): boolean {
  return report.breaches.length > 0 || report.missingSteps.length > 0;
}

function name(row: Breach): string {
  return row.step === row.journey ? row.journey : `${row.journey} ${row.step}`;
}

function table(rows: readonly Breach[], last: { header: string; pick: (row: Breach) => string }): string[] {
  const widths = { name: Math.max(7, ...rows.map((r) => name(r).length)), metric: Math.max(6, ...rows.map((r) => r.metric.length)) };
  const judged = (r: Breach) => `${r.actual}${GATES[r.metric].combine === "min" ? " (min)" : ""}`;
  return [
    `  ${"journey".padEnd(widths.name)}  ${"metric".padEnd(widths.metric)}  budget  ${"actual".padStart(10)}  ${last.header}`,
    ...rows.map(
      (r) => `  ${name(r).padEnd(widths.name)}  ${r.metric.padEnd(widths.metric)}  ${String(r.budget).padStart(6)}  ${judged(r).padStart(10)}  ${last.pick(r)}`,
    ),
  ];
}

const RUNS_COLUMN = { header: "runs", pick: (r: Breach) => r.runs.join(" ") };
const SUGGESTED_COLUMN = { header: "new budget", pick: (r: Breach) => String(r.suggested) };

export function formatBudgetReport(report: BudgetReport): string {
  const lines: string[] = [];
  if (report.breaches.length > 0) lines.push("OVER BUDGET", ...table(report.breaches, RUNS_COLUMN), "");
  if (report.missingSteps.length > 0) lines.push("BUDGETED BUT NOT PRODUCED (the journey changed shape; update budgets.json)", ...report.missingSteps.map((m) => `  ${m}`), "");
  if (report.improvements.length > 0) {
    lines.push("BELOW BUDGET: lower budgets.json to the new value in this same change", ...table(report.improvements, SUGGESTED_COLUMN), "");
  }
  if (report.unbudgeted.length > 0) lines.push("no budget yet (add one to budgets.json)", ...report.unbudgeted.map((m) => `  ${m}`), "");
  if (report.noData.length > 0) lines.push("no data (not a failure)", ...report.noData.map((m) => `  ${m}`), "");
  lines.push(isFailure(report) ? "budgets: FAILED" : "budgets: ok");
  return lines.join("\n");
}
