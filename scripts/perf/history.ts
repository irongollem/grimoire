#!/usr/bin/env tsx
/**
 * The performance history: one JSON line per release, appended to
 * `history.jsonl` on the `perf-history` branch by CI.
 *
 *   history.ts entry <results.json> --sha <sha> [--critical <critical-path.json>] [--date <iso>]
 *       prints one history line (no trailing newline) to stdout
 *   history.ts summarize <history.jsonl> [--last N]
 *       prints the last N entries (default 15) as a trend table
 */

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { isCliEntry } from "../lib/cli";
import { formatValue, METRICS, type MedianSample, type ProfileRecord, type ResultsFile } from "./results";

export interface CriticalPathSizes {
  files: number;
  raw: number;
  gzip: number;
  brotli: number;
}

export interface HistoryEntry {
  sha: string;
  date: string;
  profile: ProfileRecord;
  runs: number;
  /** journey -> step label -> median metrics. Skipped journeys are left out: no data, not zero. */
  journeys: Record<string, Record<string, MedianSample>>;
  /** Recorded as data, not gated here: the boot budget is enforced by bootBudgetPlugin. */
  criticalPath: CriticalPathSizes | null;
}

export function buildEntry(results: ResultsFile, sha: string, date: string, criticalPath: CriticalPathSizes | null): HistoryEntry {
  const journeys: HistoryEntry["journeys"] = {};
  for (const journey of results.journeys) {
    if (journey.status !== "ok") continue;
    journeys[journey.journey] = Object.fromEntries(journey.steps.map((step) => [step.label, step.median]));
  }
  return { sha, date, profile: results.profile, runs: results.runsPerJourney, journeys, criticalPath };
}

/** Malformed lines (a half-written append, a merge artefact) are reported, never silently dropped. */
export function parseHistory(text: string): { entries: HistoryEntry[]; bad: number[] } {
  const entries: HistoryEntry[] = [];
  const bad: number[] = [];
  text.split("\n").forEach((line, index) => {
    if (line.trim() === "") return;
    try {
      entries.push(JSON.parse(line) as HistoryEntry);
    } catch {
      bad.push(index + 1);
    }
  });
  return { entries, bad };
}

const TREND_COLUMNS: { header: string; pick: (e: HistoryEntry) => string }[] = [
  { header: "date", pick: (e) => e.date.slice(0, 10) },
  { header: "sha", pick: (e) => e.sha.slice(0, 7) },
  { header: "cold api", pick: (e) => metric(e, "dm-cold", "dm-cold", "apiRequests") },
  { header: "cold depth", pick: (e) => metric(e, "dm-cold", "dm-cold", "serialDepth") },
  { header: "cold content", pick: (e) => metric(e, "dm-cold", "dm-cold", "contentReadyMs") },
  { header: "cold settled", pick: (e) => metric(e, "dm-cold", "dm-cold", "settledMs") },
  { header: "warm content", pick: (e) => metric(e, "dm-warm", "dm-warm", "contentReadyMs") },
  { header: "resume api", pick: (e) => metric(e, "resume", "resume", "apiRequests") },
  { header: "boot gzip", pick: (e) => (e.criticalPath === null ? "n/a" : formatValue(e.criticalPath.gzip, "bytes")) },
];

function metric(entry: HistoryEntry, journey: string, step: string, key: keyof MedianSample): string {
  const median = entry.journeys[journey]?.[step];
  if (median === undefined) return "n/a";
  const value: number | null | undefined = median[key];
  const unit = METRICS.find((m) => m.key === key)?.unit ?? "count";
  return value === undefined ? "n/a" : formatValue(value, unit);
}

/** The last `last` entries, oldest first, as a fixed-width table. */
export function summarize(entries: readonly HistoryEntry[], last: number): string {
  const rows = entries.slice(-last).map((e) => TREND_COLUMNS.map((c) => c.pick(e)));
  const header = TREND_COLUMNS.map((c) => c.header);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i] ?? c.length)).join("  ").trimEnd();
  return [line(header), line(widths.map((w) => "-".repeat(w))), ...rows.map(line)].join("\n");
}

function readCritical(path: string): CriticalPathSizes {
  const report = JSON.parse(readFileSync(path, "utf8")) as { critical: unknown[]; criticalTotal: { raw: number; gzip: number; brotli: number } };
  return { files: report.critical.length, ...report.criticalTotal };
}

function main(): void {
  const [command, file, ...rest] = process.argv.slice(2);
  if (file === undefined) throw new Error("usage: history.ts entry|summarize <file> ...");
  const { values } = parseArgs({
    args: rest,
    options: { sha: { type: "string" }, critical: { type: "string" }, date: { type: "string" }, last: { type: "string", default: "15" } },
  });
  if (command === "entry") {
    if (values.sha === undefined) throw new Error("entry needs --sha");
    const results = JSON.parse(readFileSync(file, "utf8")) as ResultsFile;
    const critical = values.critical === undefined ? null : readCritical(values.critical);
    process.stdout.write(JSON.stringify(buildEntry(results, values.sha, values.date ?? new Date().toISOString(), critical)));
  } else if (command === "summarize") {
    const { entries, bad } = parseHistory(readFileSync(file, "utf8"));
    if (bad.length > 0) console.warn(`warning: unreadable history line(s): ${bad.join(", ")}`);
    console.log(summarize(entries, Number(values.last)));
  } else {
    throw new Error(`unknown command "${command}"`);
  }
}

if (isCliEntry(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
