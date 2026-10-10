#!/usr/bin/env tsx
/**
 * Writes `structured` + `defenses` into every stored stat block (#1017), the
 * "expand" half of the two-step release. The four old defense strings stay on the
 * block (the client in production still reads them); a later migration drops them.
 *
 * Usage:
 *   npm run stat-blocks:structure                         # check, local stack
 *   npm run stat-blocks:structure -- --check --production # read production, write nothing
 *   npm run stat-blocks:structure -- --write              # update the local stack
 *   npm run stat-blocks:structure -- --write --production --yes-production
 *   --table library_monsters|monsters|npcs|companions|hall_of_heroes  # repeatable; default all five
 *
 * User tables (`monsters`, `npcs`, `companions`, `hall_of_heroes`) hold real accounts' content, so
 * this script prints counts and nothing else: no names, no prose, no error bodies.
 * Only the `stat_block` column is ever written, one row per request, by primary key.
 */
import { parseArgs } from "node:util";
import { TABLES, isTable, loadExtractions, print, processTable, resolveTarget } from "./rows.ts";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      check: { type: "boolean", default: false },
      write: { type: "boolean", default: false },
      production: { type: "boolean", default: false },
      "yes-production": { type: "boolean", default: false },
      table: { type: "string", multiple: true },
    },
  });
  if (values.check && values.write) throw new Error("Pass --check or --write, not both.");
  const write = values.write;
  if (write && values.production && !values["yes-production"]) {
    throw new Error("Refusing to write to production without --yes-production (use --write --production --yes-production).");
  }
  const tables = new Set(
    (values.table ?? TABLES).map((name) => {
      if (!isTable(name)) throw new Error(`Unknown table ${name}. Expected one of ${TABLES.join(", ")}.`);
      return name;
    }),
  );

  const target = resolveTarget(values.production);
  console.log(`${write ? "Writing to" : "Checking"} ${target.label} (${[...tables].join(", ")}).`);
  const extractions = loadExtractions();

  let failed = 0;
  for (const table of tables) {
    const tally = await processTable(target, table, write, extractions);
    print(table, tally, write);
    failed += tally.failed;
  }
  if (failed > 0) {
    console.error(`\n${failed} row write(s) failed; re-run to resume (finished rows are skipped).`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Unexpected failure.");
  process.exit(1);
});
