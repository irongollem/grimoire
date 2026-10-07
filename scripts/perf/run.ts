#!/usr/bin/env tsx
/**
 * Browser performance harness (epic #999, story 0.1).
 *
 * Drives the production build in headless Chromium through a fixed set of
 * journeys under a fixed CPU and network profile, and writes the medians of
 * the deterministic numbers (requests, bytes, serial depth) and the noisy ones
 * (paint, blocking, settle time) to JSON. Builds nothing and starts no server:
 * see README.md for the build / preview / run / compare sequence.
 *
 * Usage:
 *   npx tsx scripts/perf/run.ts [--base <url>] [--journey <name>]... [--runs <n>]
 *                               [--out <file>] [--cpu <rate>] [--delay <ms>] [--latency <ms>]
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import { API_ORIGIN, type Profile } from "./browser";
import { isCliEntry } from "../lib/cli";
import { DM_EMAIL, JOURNEYS, type JourneyEnv, JourneySkipped, PLAYER_EMAIL, signIn, type Step } from "./journeys";
import { aggregateRuns, formatTable, type JourneyResult, type ResultsFile } from "./results";

const REPO_ROOT = join(import.meta.dirname, "..", "..");

function parsePositive(name: string, raw: string, allowZero = false): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || (!allowZero && value === 0)) throw new Error(`--${name} must be a ${allowZero ? "non-negative" : "positive"} number, got "${raw}"`);
  return value;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      base: { type: "string", default: "http://127.0.0.1:4173" },
      journey: { type: "string", multiple: true },
      runs: { type: "string", default: "3" },
      out: { type: "string" },
      cpu: { type: "string", default: "4" },
      delay: { type: "string", default: "150" },
      latency: { type: "string", default: "0" },
    },
  });

  const runs = parsePositive("runs", values.runs);
  const known = JOURNEYS.map((j) => j.name);
  const wanted = values.journey ?? known;
  for (const name of wanted) if (!known.includes(name)) throw new Error(`unknown journey "${name}"; known: ${known.join(", ")}`);
  const selected = JOURNEYS.filter((j) => wanted.includes(j.name));

  const startedAt = new Date().toISOString();
  const profile: Profile = {
    cpuThrottle: parsePositive("cpu", values.cpu),
    apiDelayMs: parsePositive("delay", values.delay, true),
    latencyMs: parsePositive("latency", values.latency, true),
    viewport: { width: 1440, height: 900 },
    apiOrigin: API_ORIGIN,
  };
  const outFile = values.out ?? join(REPO_ROOT, "perf-results", `${startedAt.replace(/[:.]/g, "-")}.json`);

  const browser = await chromium.launch();
  try {
    console.log(`signing in ${DM_EMAIL}`);
    const dm = await signIn(browser, profile, values.base, DM_EMAIL);
    let player: JourneyEnv["player"] = null;
    if (selected.some((j) => j.name === "player-cold")) {
      console.log(`signing in ${PLAYER_EMAIL}`);
      player = await signIn(browser, profile, values.base, PLAYER_EMAIL).catch((error: unknown) => {
        console.warn(`player sign-in failed: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      });
    }
    const env: JourneyEnv = { browser, base: values.base, profile, dm, player };

    const journeys: JourneyResult[] = [];
    for (const journey of selected) {
      const perRun: Step[][] = [];
      let skipped: string | null = null;
      for (let i = 1; i <= runs && skipped === null; i++) {
        console.log(`${journey.name} run ${i}/${runs}`);
        try {
          perRun.push(await journey.run(env));
        } catch (error) {
          if (error instanceof JourneySkipped) skipped = error.message;
          else throw error;
        }
      }
      if (skipped !== null) {
        journeys.push({ journey: journey.name, status: "skipped", skipReason: skipped, steps: [] });
        continue;
      }
      const first = perRun[0];
      if (first === undefined) throw new Error(`${journey.name} produced no runs`);
      const steps = first.map((step, index) =>
        aggregateRuns(
          step.label,
          perRun.map((run) => {
            const match = run[index];
            if (match === undefined || match.label !== step.label) throw new Error(`${journey.name}: runs disagree about step ${index}`);
            return match.sample;
          }),
        ),
      );
      journeys.push({ journey: journey.name, status: "ok", skipReason: null, steps });
    }

    const results: ResultsFile = {
      schema: 1,
      startedAt,
      base: values.base,
      runsPerJourney: runs,
      profile: { cpuThrottle: profile.cpuThrottle, apiDelayMs: profile.apiDelayMs, latencyMs: profile.latencyMs, viewport: profile.viewport },
      journeys,
    };
    mkdirSync(dirname(outFile), { recursive: true });
    writeFileSync(outFile, `${JSON.stringify(results, null, 2)}\n`);
    console.log(`\nmedian of ${runs} run(s), CPU ${profile.cpuThrottle}x, +${profile.apiDelayMs}ms per API request, ${profile.latencyMs ?? 0}ms latency on every request\n`);
    console.log(formatTable(journeys));
    console.log(`\nwrote ${outFile}`);
  } finally {
    await browser.close();
  }
}

if (isCliEntry(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
