#!/usr/bin/env tsx
/**
 * Brings the local stack's shared library in line with production's (#953).
 *
 * ## Why this exists
 *
 * A local library is whatever `seed.sql` carried when it was last pulled, and
 * because the seed loads *after* the migrations, an old dump undoes every data
 * migration since it was taken. One from before `20260722000002` still files
 * the SRD under `wotc-srd` and has no 2024 SRD at all, so a fixture campaign
 * that enables `srd-2014` / `srd-2024` (what `dev:auth` and `dev:demo` set up)
 * reads no SRD monsters, spells or items. A local repro of a monster bug then
 * fails for a reason that has nothing to do with the bug.
 *
 * ## What it does
 *
 * Reads every table in `LIBRARY_TABLES` from production and upserts the rows
 * into the local stack in one transaction (`lib/dev-library-sql.ts`). Local rows
 * production lacks are kept, since an older dump's user data may still point at
 * them (`npm run db:pull` is what replaces those), except in the two tables
 * nothing refers to by key, which are pruned to production's rows. Campaigns still on the retired
 * `wotc-srd` slug are moved to both SRD editions, as production's were.
 *
 * ## What it may touch
 *
 * Production is read, never written: the only request this file sends it is a
 * paged GET (`remoteRows`). Every write goes to the local stack, through the
 * loopback guard in `lib/dev-stack.ts`, by way of one temporary SQL file that is
 * deleted whether or not the import succeeds.
 *
 * Usage:
 *   npm run dev:library             # mirror production's library locally
 *   npm run dev:library -- --check  # compare row counts, change nothing
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { quote, sql } from "./lib/dev-db.ts";
import { buildMirrorSql, LIBRARY_TABLES, type MirrorTable } from "./lib/dev-library-sql.ts";
import { assertRemoteUrl, readLocalStack, remoteRows } from "./lib/dev-stack.ts";

/** Each table's insertable columns in the local schema: everything but dropped and generated ones. */
function readLocalColumns(dbUrl: string): Map<string, string[]> {
  const out = sql(
    dbUrl,
    `select c.relname, string_agg(a.attname, ',' order by a.attnum)
       from pg_attribute a
       join pg_class c on c.oid = a.attrelid
      where c.relnamespace = 'public'::regnamespace
        and c.relname in (${LIBRARY_TABLES.map((t) => quote(t.table)).join(", ")})
        and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
      group by c.relname`,
  );
  return new Map(out.split("\n").filter(Boolean).map((line) => {
    const [table, columns] = line.split("\t");
    return [table, columns.split(",")];
  }));
}

function localCount(dbUrl: string, table: string): number {
  return Number(sql(dbUrl, `select count(*) from public.${table}`));
}

async function remoteCount(remote: URL, key: string, table: string): Promise<number> {
  const response = await fetch(`${remote.origin}/rest/v1/${table}?select=*&limit=1`, {
    method: "GET",
    headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact" },
  });
  if (!response.ok) throw new Error(`Could not count ${table} in production (${response.status}): ${await response.text()}`);
  const range = response.headers.get("content-range");
  const total = range?.split("/")[1];
  if (total === undefined || total === "*") throw new Error(`Production did not report a count for ${table}.`);
  return Number(total);
}

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { check: { type: "boolean", default: false } } });

  const stack = readLocalStack();
  const remote = assertRemoteUrl(process.env.VITE_SUPABASE_URL);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set. Run through `npm run dev:library`, which loads .env.local.");

  if (values.check) {
    for (const t of LIBRARY_TABLES) {
      const [local, prod] = [localCount(stack.DB_URL, t.table), await remoteCount(remote, key, t.table)];
      console.log(`${t.table.padEnd(32)} local ${String(local).padStart(6)}   production ${String(prod).padStart(6)}`);
    }
    const legacy = sql(stack.DB_URL, "select count(*) from public.campaign_enabled_sources where source_slug = 'wotc-srd'");
    console.log(`\ncampaigns still enabling the retired wotc-srd slug: ${legacy}`);
    console.log("Run without --check to bring the local library in line.");
    return;
  }

  const columns = readLocalColumns(stack.DB_URL);
  const tables: MirrorTable[] = [];
  for (const t of LIBRARY_TABLES) {
    const local = columns.get(t.table);
    if (!local) throw new Error(`The local stack has no ${t.table}. Is it migrated? Try \`npm run db:reset\`.`);
    const rows = await remoteRows(remote, key, t.table, "", t.key);
    tables.push({ table: t.table, key: t.key, prune: t.prune, rows, columns: local });
    console.log(`Read ${rows.length} ${t.table} rows from production.`);
  }

  // The rows go through a file rather than an argument: the monster stat blocks
  // alone are far larger than a command line may be.
  const dir = mkdtempSync(join(tmpdir(), "grimoire-library-"));
  const file = join(dir, "mirror.sql");
  try {
    writeFileSync(file, buildMirrorSql(tables, `lib_${randomBytes(6).toString("hex")}`), { mode: 0o600 });
    execFileSync("psql", [stack.DB_URL, "-q", "-v", "ON_ERROR_STOP=1", "-f", file], { stdio: ["ignore", "ignore", "pipe"] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  for (const t of tables) {
    const total = localCount(stack.DB_URL, t.table);
    const extra = total - t.rows.length;
    console.log(`${t.table.padEnd(32)} ${total} locally${extra > 0 ? ` (${extra} local-only, kept)` : ""}`);
  }
  console.log("\nThe local library now matches production. Local-only rows stay until the next `npm run db:pull`.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
