import { medianIndex, medianOrNull } from "./stats";
import type { RequestSummary } from "./summarize";

/** Everything measured in one window of one run. */
export interface Sample extends RequestSummary {
  /** null on a client-side navigation: nothing new is painted for the browser to report. */
  fcpMs: number | null;
  lcpMs: number | null;
  tbtMs: number | null;
  /** Static splash and Vue loading screen both gone (page loads only). */
  appReadyMs: number | null;
  /** A journey-specific piece of real content visible; null if it never appeared. */
  contentReadyMs: number | null;
}

export type NumericMetric = Exclude<keyof Sample, "apiPaths" | "apiWaves">;

/**
 * Display order and labels. Order is the order of the printed table; `unit`
 * drives formatting. Add a metric here and `Sample` and the aggregation pick
 * it up through `NumericMetric`.
 */
export const METRICS: readonly { key: NumericMetric; label: string; unit: "count" | "bytes" | "ms" }[] = [
  { key: "apiRequests", label: "api reqs", unit: "count" },
  { key: "optionsRequests", label: "options", unit: "count" },
  { key: "serialDepth", label: "serial depth", unit: "count" },
  { key: "apiBytes", label: "api bytes", unit: "bytes" },
  { key: "jsBytes", label: "js bytes", unit: "bytes" },
  { key: "cssBytes", label: "css bytes", unit: "bytes" },
  { key: "totalRequests", label: "total reqs", unit: "count" },
  { key: "fcpMs", label: "FCP", unit: "ms" },
  { key: "lcpMs", label: "LCP", unit: "ms" },
  { key: "tbtMs", label: "TBT", unit: "ms" },
  { key: "appReadyMs", label: "app ready", unit: "ms" },
  { key: "contentReadyMs", label: "content ready", unit: "ms" },
  { key: "settledMs", label: "settled", unit: "ms" },
];

export type MedianSample = Record<NumericMetric, number | null>;

export interface StepResult {
  /** `dm-nav` has one step per navigation (`/npcs`); other journeys have a single step named after themselves. */
  label: string;
  runs: Sample[];
  median: MedianSample;
  /** Request list of the run closest to the median settled time, so a reader can see what was fetched. */
  representativeApiPaths: string[];
}

export interface JourneyResult {
  journey: string;
  status: "ok" | "skipped";
  skipReason: string | null;
  steps: StepResult[];
}

export interface ProfileRecord {
  cpuThrottle: number;
  apiDelayMs: number;
  /**
   * Round-trip latency added to EVERY request through Chromium's network
   * emulation, preflights and static assets included. The `apiDelayMs` hold is a
   * Playwright route, and Chromium answers CORS preflights below the routing
   * layer, so the hold never reaches them: a profile without latency cannot see
   * what a preflight costs. Absent in results written before it existed, which
   * ran without it.
   */
  latencyMs?: number;
  viewport: { width: number; height: number };
}

export interface ResultsFile {
  schema: 1;
  startedAt: string;
  base: string;
  runsPerJourney: number;
  profile: ProfileRecord;
  journeys: JourneyResult[];
}

/** Median of every metric across runs, plus which run to show the request list of. */
export function aggregateRuns(label: string, runs: readonly Sample[]): StepResult {
  if (runs.length === 0) throw new Error(`no runs to aggregate for ${label}`);
  const median = {} as MedianSample;
  for (const { key } of METRICS) median[key] = medianOrNull(runs.map((run) => run[key]));
  const pick = runs[medianIndex(runs.map((run) => run.settledMs))];
  if (pick === undefined) throw new Error("unreachable: median index inside runs");
  return { label, runs: [...runs], median, representativeApiPaths: pick.apiPaths };
}

export function formatValue(value: number | null, unit: "count" | "bytes" | "ms"): string {
  if (value === null) return "n/a";
  if (unit === "count") return String(Math.round(value * 10) / 10);
  if (unit === "ms") return `${Math.round(value)}ms`;
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(2)}MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)}kB`;
  return `${Math.round(value)}B`;
}

/** Fixed-width text table: one row per step, one column per metric. */
export function formatTable(journeys: readonly JourneyResult[]): string {
  const header = ["journey", ...METRICS.map((m) => m.label)];
  const rows: string[][] = [];
  for (const journey of journeys) {
    if (journey.status === "skipped") {
      rows.push([journey.journey, `skipped: ${journey.skipReason ?? "no reason recorded"}`]);
      continue;
    }
    for (const step of journey.steps) {
      const name = step.label === journey.journey ? step.label : `${journey.journey} ${step.label}`;
      rows.push([name, ...METRICS.map((m) => formatValue(step.median[m.key], m.unit))]);
    }
  }
  const widths = header.map((h, col) => Math.max(h.length, ...rows.map((r) => (r[col] ?? "").length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i] ?? c.length)).join("  ").trimEnd();
  return [line(header), line(widths.map((w) => "-".repeat(w))), ...rows.map(line)].join("\n");
}

export interface CompareRow {
  journey: string;
  step: string;
  metric: NumericMetric;
  label: string;
  unit: "count" | "bytes" | "ms";
  before: number | null;
  after: number | null;
}

/** A metric an older result file did not record is absent, not zero. */
function medianOf(step: StepResult, key: NumericMetric): number | null {
  const value: number | null | undefined = step.median[key];
  return value === undefined ? null : value;
}

/** Pairs every (journey, step, metric) present in both files; steps in only one file are listed by `unmatched`. */
export function compareResults(a: ResultsFile, b: ResultsFile): { rows: CompareRow[]; unmatched: string[] } {
  const rows: CompareRow[] = [];
  const unmatched: string[] = [];
  const index = (file: ResultsFile) => {
    const map = new Map<string, { journey: string; step: StepResult }>();
    for (const journey of file.journeys) {
      if (journey.status !== "ok") continue;
      for (const step of journey.steps) map.set(`${journey.journey}\u0000${step.label}`, { journey: journey.journey, step });
    }
    return map;
  };
  const before = index(a);
  const after = index(b);
  for (const [key, left] of before) {
    const right = after.get(key);
    if (right === undefined) {
      unmatched.push(`${left.journey} ${left.step.label}: only in the first file`);
      continue;
    }
    for (const m of METRICS) {
      rows.push({
        journey: left.journey,
        step: left.step.label,
        metric: m.key,
        label: m.label,
        unit: m.unit,
        before: medianOf(left.step, m.key),
        after: medianOf(right.step, m.key),
      });
    }
  }
  for (const [key, right] of after) {
    if (!before.has(key)) unmatched.push(`${right.journey} ${right.step.label}: only in the second file`);
  }
  return { rows, unmatched };
}

/** `-3 (-25%)`, `+0`, or `n/a` when either side is missing. */
export function formatDelta(before: number | null, after: number | null, unit: "count" | "bytes" | "ms"): string {
  if (before === null || after === null) return "n/a";
  const diff = after - before;
  const sign = diff > 0 ? "+" : diff < 0 ? "-" : "";
  const magnitude = formatValue(Math.abs(diff), unit);
  if (before === 0) return `${sign}${magnitude}`;
  const pct = Math.round((diff / before) * 100);
  return `${sign}${magnitude} (${pct > 0 ? "+" : ""}${pct}%)`;
}

export function formatComparison(rows: readonly CompareRow[], unmatched: readonly string[]): string {
  const lines: string[] = [];
  let current = "";
  for (const row of rows) {
    const heading = row.step === row.journey ? row.journey : `${row.journey} ${row.step}`;
    if (heading !== current) {
      if (current !== "") lines.push("");
      lines.push(heading);
      current = heading;
    }
    const before = formatValue(row.before, row.unit);
    const after = formatValue(row.after, row.unit);
    lines.push(`  ${row.label.padEnd(13)} ${before.padStart(9)} -> ${after.padEnd(9)} ${formatDelta(row.before, row.after, row.unit)}`);
  }
  if (unmatched.length > 0) lines.push("", ...unmatched.map((u) => `note: ${u}`));
  return lines.join("\n");
}
