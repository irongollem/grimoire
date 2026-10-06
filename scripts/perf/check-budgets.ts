#!/usr/bin/env tsx
/**
 * Fails (exit 1) when a harness run exceeds the request-count budgets.
 *
 * Usage: npx tsx scripts/perf/check-budgets.ts <results.json> [budgets.json]
 *
 * Gates only per-step `apiRequests` and `serialDepth`. The boot-bundle gzip
 * budget is enforced by `bootBudgetPlugin` in vite.config.ts, at build time.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isCliEntry } from "../lib/cli";
import { type Budgets, checkBudgets, formatBudgetReport, isFailure } from "./budgets";
import type { ResultsFile } from "./results";

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function main(): void {
  const [resultsPath, budgetsPath = join(import.meta.dirname, "budgets.json")] = process.argv.slice(2);
  if (resultsPath === undefined) throw new Error("usage: check-budgets.ts <results.json> [budgets.json]");
  const results = readJson(resultsPath) as ResultsFile;
  if (results.schema !== 1) throw new Error(`${resultsPath} is not a perf harness result (expected schema 1)`);
  const report = checkBudgets(results, readJson(budgetsPath) as Budgets);
  console.log(formatBudgetReport(report));
  if (isFailure(report)) process.exit(1);
}

if (isCliEntry(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
