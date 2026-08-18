/**
 * The two primitives the local-dev fixture scripts use to talk to the running
 * Supabase stack over `psql`.
 *
 * Extracted from `dev-auth.ts` so `dev-fixture-content.ts` can use them without
 * importing the script that owns the sign-in flow — and so the loopback guard in
 * `dev-auth.ts` stays the only place that decides *which* stack gets addressed.
 * These take a `dbUrl` and ask no questions about it; run them past that guard.
 */
import { execFileSync } from "node:child_process";

/**
 * Runs one statement and returns stdout, tab-separated and trimmed.
 *
 * The buffer is generous because the fixture clone reads whole tables back in a
 * single `select`.
 */
export function sql(dbUrl: string, statement: string): string {
  return execFileSync("psql", [dbUrl, "-At", "-F", "\t", "-c", statement], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  }).trim();
}

/** Single-quotes a value for interpolation into a statement. */
export function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
