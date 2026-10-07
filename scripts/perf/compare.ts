#!/usr/bin/env tsx
/**
 * Prints before -> after for every journey and metric of two harness results.
 *
 * Usage: npx tsx scripts/perf/compare.ts <before.json> <after.json>
 */

import { readFileSync } from "node:fs";
import { isCliEntry } from "../lib/cli";
import { compareResults, formatComparison, type ResultsFile } from "./results";

function load(path: string): ResultsFile {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (typeof parsed !== "object" || parsed === null || (parsed as { schema?: unknown }).schema !== 1) {
    throw new Error(`${path} is not a perf harness result (expected schema 1)`);
  }
  return parsed as ResultsFile;
}

function main(): void {
  const [beforePath, afterPath] = process.argv.slice(2);
  if (beforePath === undefined || afterPath === undefined) throw new Error("usage: compare.ts <before.json> <after.json>");
  const before = load(beforePath);
  const after = load(afterPath);
  const profileOf = (f: ResultsFile) => `CPU ${f.profile.cpuThrottle}x, +${f.profile.apiDelayMs}ms`;
  if (profileOf(before) !== profileOf(after)) console.warn(`warning: profiles differ (${profileOf(before)} vs ${profileOf(after)}); timings are not comparable`);
  const { rows, unmatched } = compareResults(before, after);
  console.log(formatComparison(rows, unmatched));
}

if (isCliEntry(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
