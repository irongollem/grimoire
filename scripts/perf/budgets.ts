import type { NumericMetric, ResultsFile } from "./results";

/** Only counts are gated: bytes and times move with the machine, request counts do not. */
export const GATED_METRICS = ["apiRequests", "serialDepth"] as const satisfies readonly NumericMetric[];
export type GatedMetric = (typeof GATED_METRICS)[number];

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
}

export interface BudgetReport {
  breaches: Breach[];
  /** Measured below budget: the budget should be lowered in the same change. */
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
        const actual = step.median[metric];
        if (actual === null) {
          report.missingSteps.push(`${journeyName} ${stepLabel}: ${metric} was not measured`);
          continue;
        }
        const row = { journey: journeyName, step: stepLabel, metric, budget: metrics[metric], actual };
        if (actual > row.budget) report.breaches.push(row);
        else if (actual < row.budget) report.improvements.push(row);
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

function table(rows: readonly Breach[]): string[] {
  const widths = { name: Math.max(7, ...rows.map((r) => name(r).length)), metric: Math.max(6, ...rows.map((r) => r.metric.length)) };
  return [
    `  ${"journey".padEnd(widths.name)}  ${"metric".padEnd(widths.metric)}  budget  actual`,
    ...rows.map((r) => `  ${name(r).padEnd(widths.name)}  ${r.metric.padEnd(widths.metric)}  ${String(r.budget).padStart(6)}  ${String(r.actual).padStart(6)}`),
  ];
}

export function formatBudgetReport(report: BudgetReport): string {
  const lines: string[] = [];
  if (report.breaches.length > 0) lines.push("OVER BUDGET", ...table(report.breaches), "");
  if (report.missingSteps.length > 0) lines.push("BUDGETED BUT NOT PRODUCED (the journey changed shape; update budgets.json)", ...report.missingSteps.map((m) => `  ${m}`), "");
  if (report.improvements.length > 0) {
    lines.push("BELOW BUDGET: lower budgets.json to the new value in this same change", ...table(report.improvements), "");
  }
  if (report.unbudgeted.length > 0) lines.push("no budget yet (add one to budgets.json)", ...report.unbudgeted.map((m) => `  ${m}`), "");
  if (report.noData.length > 0) lines.push("no data (not a failure)", ...report.noData.map((m) => `  ${m}`), "");
  lines.push(isFailure(report) ? "budgets: FAILED" : "budgets: ok");
  return lines.join("\n");
}
