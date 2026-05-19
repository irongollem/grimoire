#!/usr/bin/env tsx
/**
 * One-shot migration: convert rich-text fields stored as plain markdown to
 * Tiptap JSON on rows imported BEFORE the importer's write-boundary converter
 * landed.
 *
 * Reads all rows from `npcs`, `deities`, and `pantheons`. For each rich-text
 * field, detects whether the value is already Tiptap JSON (skip), plain
 * text (convert + plan an UPDATE), or unknown JSON (flag as anomaly — don't
 * touch). Issues UPDATEs in dry-run-able mode.
 *
 * Usage:
 *   npm run migrate-plaintext-to-tiptap -- [options]
 *
 * Options:
 *   --table TABLE          Limit to one table: npcs | deities | pantheons | all (default: all)
 *   --campaign UUID        Limit to one campaign
 *   --user-id UUID         Limit to one user (default: Kind Country owner)
 *   --row-id UUID          Surgical: process exactly one row (requires --table)
 *   --dry-run              Print plan; do not write
 *   -v, --verbose          Verbose per-row logging
 *
 * Idempotent: re-running after a successful migration is a no-op (already-
 * converted rows are detected via `detectFieldFormat` and skipped).
 *
 * Companion to PR #424's importer write-boundary converter. The converter
 * (`scripts/lib/tiptap.ts`) handles new inserts going forward; this script
 * is the one-shot for rows that pre-date the converter.
 */

import { parseArgs } from "node:util";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { detectFieldFormat } from "./lib/plaintext-detection";
import { markdownToTiptap } from "./lib/tiptap";

const DEFAULT_USER_ID = "fc8ae595-641f-4127-87ad-03588f3710d1";

/** Tables + their rich-text field sets. Source of truth lives in `tiptap.ts`. */
const TABLE_FIELDS = {
  npcs:      ["appearance", "personality", "backstory", "notes"] as const,
  deities:   ["description", "dm_notes"] as const,
  pantheons: ["description"] as const,
};

export type TableName = keyof typeof TABLE_FIELDS;

interface CliArgs {
  table: TableName | "all";
  campaignId: string | null;
  userId: string;
  rowId: string | null;
  dryRun: boolean;
  verbose: boolean;
}

interface Logger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  debug: (msg: string) => void;
}

function makeLogger(verbose: boolean): Logger {
  return {
    info: (msg) => console.log(`INFO: ${msg}`),
    warn: (msg) => console.warn(`WARN: ${msg}`),
    debug: (msg) => verbose && console.log(`DEBUG: ${msg}`),
  };
}

function parseCli(): CliArgs {
  const { values } = parseArgs({
    options: {
      table:       { type: "string", default: "all" },
      campaign:    { type: "string" },
      "user-id":   { type: "string" },
      "row-id":    { type: "string" },
      "dry-run":   { type: "boolean", default: false },
      verbose:     { type: "boolean", short: "v", default: false },
      help:        { type: "boolean", short: "h", default: false },
    },
    allowPositionals: false,
  });

  if (values.help) {
    printUsage();
    process.exit(0);
  }

  const table = values.table as TableName | "all";
  if (table !== "all" && !(table in TABLE_FIELDS)) {
    console.error(`ERROR: --table must be one of: npcs, deities, pantheons, all (got: ${table})`);
    process.exit(1);
  }
  const rowId = (values["row-id"] as string | undefined) ?? null;
  if (rowId && table === "all") {
    console.error("ERROR: --row-id requires --table to disambiguate");
    process.exit(1);
  }

  return {
    table,
    campaignId: (values.campaign as string | undefined) ?? null,
    userId: (values["user-id"] as string | undefined) ?? DEFAULT_USER_ID,
    rowId,
    dryRun: values["dry-run"] ?? false,
    verbose: values.verbose ?? false,
  };
}

function printUsage(): void {
  console.log(`Usage: tsx --env-file=.env.local scripts/migrate-plaintext-to-tiptap.ts [options]

Options:
  --table TABLE        npcs | deities | pantheons | all (default: all)
  --campaign UUID      Limit to one campaign
  --user-id UUID       Limit to one user (default: Kind Country owner)
  --row-id UUID        Surgical: process exactly one row (requires --table)
  --dry-run            Print plan; do not write
  -v, --verbose        Verbose per-row logging
  -h, --help           This help`);
}

export function createServiceClient(): SupabaseClient {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** One field's planned conversion. */
export interface FieldPlan {
  /** Original plain-text length. */
  sourceLen: number;
  /** First 80 chars of source for log readability. */
  sourcePreview: string;
  /** Length of the Tiptap JSON string we'd write. */
  convertedLen: number;
  /** The actual JSON string (kept on the plan so dry-run + apply share the value). */
  converted: string;
}

/** One row's planned update — at least one field needs conversion. */
export interface RowPlan {
  table: TableName;
  id: string;
  name: string;
  fields: Record<string, FieldPlan>;
}

/** A row with at least one unknown-json field — surfaced, NOT written. */
export interface RowAnomaly {
  table: TableName;
  id: string;
  name: string;
  field: string;
  preview: string;
}

/** Pure planner — takes raw rows + scope, returns plans. Pure for testability. */
export function planConversions(
  table: TableName,
  rows: Array<Record<string, unknown>>,
): { plans: RowPlan[]; anomalies: RowAnomaly[] } {
  const plans: RowPlan[] = [];
  const anomalies: RowAnomaly[] = [];
  const fields = TABLE_FIELDS[table];

  for (const row of rows) {
    const id = row.id as string;
    const name = (row.name as string | null | undefined) ?? "(unnamed)";
    const fieldPlans: Record<string, FieldPlan> = {};

    for (const field of fields) {
      const value = row[field];
      const format = detectFieldFormat(value);
      switch (format) {
        case "empty":
        case "tiptap":
          // No-op
          break;
        case "unknown-json":
          anomalies.push({
            table,
            id,
            name,
            field,
            preview: typeof value === "string" ? value.slice(0, 80) : JSON.stringify(value).slice(0, 80),
          });
          break;
        case "plaintext": {
          const src = value as string;
          const converted = markdownToTiptap(src);
          if (converted === null) break; // Shouldn't happen — needsConversion already filtered empty
          fieldPlans[field] = {
            sourceLen: src.length,
            sourcePreview: src.slice(0, 80).replace(/\n/g, "\\n"),
            convertedLen: converted.length,
            converted,
          };
          break;
        }
      }
    }

    if (Object.keys(fieldPlans).length > 0) {
      plans.push({ table, id, name, fields: fieldPlans });
    }
  }

  return { plans, anomalies };
}

/** Fetch rows for one table, scoped by CLI args. */
async function fetchScopedRows(
  supabase: SupabaseClient,
  table: TableName,
  args: CliArgs,
): Promise<Array<Record<string, unknown>>> {
  const fields = TABLE_FIELDS[table];
  const select = ["id", "name", "campaign_id", ...fields].join(", ");
  let q = supabase.from(table).select(select).eq("user_id", args.userId);
  if (args.campaignId) q = q.eq("campaign_id", args.campaignId);
  if (args.rowId) q = q.eq("id", args.rowId);
  const { data, error } = await q;
  if (error) throw error;
  // Cast through `unknown` — Supabase's generated types infer a wider union
  // (including error variants) for select strings with commas.
  return (data ?? []) as unknown as Array<Record<string, unknown>>;
}

/** Issue UPDATEs for the planned conversions. Returns per-row outcome. */
async function applyPlans(
  supabase: SupabaseClient,
  plans: RowPlan[],
  log: Logger,
): Promise<{ ok: number; failed: Array<{ plan: RowPlan; error: string }> }> {
  let ok = 0;
  const failed: Array<{ plan: RowPlan; error: string }> = [];
  for (const plan of plans) {
    const payload: Record<string, unknown> = {};
    for (const [field, fp] of Object.entries(plan.fields)) payload[field] = fp.converted;
    try {
      const { error } = await supabase.from(plan.table).update(payload).eq("id", plan.id);
      if (error) throw error;
      ok++;
      log.debug(`  ok: ${plan.table}/${plan.id} (${plan.name}) — ${Object.keys(plan.fields).length} field(s) converted`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failed.push({ plan, error: msg });
      log.warn(`  failed: ${plan.table}/${plan.id} (${plan.name}): ${msg}`);
    }
  }
  return { ok, failed };
}

/** Render the plan to stdout (compact summary + per-row detail). */
function reportPlan(plans: RowPlan[], anomalies: RowAnomaly[], log: Logger): void {
  // Per-table counts
  const byTable: Record<TableName, { rows: number; fields: number }> = {
    npcs: { rows: 0, fields: 0 },
    deities: { rows: 0, fields: 0 },
    pantheons: { rows: 0, fields: 0 },
  };
  for (const p of plans) {
    byTable[p.table].rows++;
    byTable[p.table].fields += Object.keys(p.fields).length;
  }
  log.info(
    `plan: ${plans.length} rows to convert across ` +
    Object.entries(byTable)
      .filter(([, v]) => v.rows > 0)
      .map(([t, v]) => `${t}=${v.rows}(${v.fields} fields)`)
      .join(", ") || "(no plans)" +
    (anomalies.length > 0 ? `; ${anomalies.length} unknown-json anomalies flagged` : ""),
  );

  for (const p of plans) {
    const fieldList = Object.entries(p.fields)
      .map(([f, fp]) => `${f}=${fp.sourceLen}ch→${fp.convertedLen}ch`)
      .join(", ");
    log.info(`  ~ ${p.table.padEnd(10)} ${p.name.padEnd(36)} ${fieldList}`);
    for (const [field, fp] of Object.entries(p.fields)) {
      log.debug(`      ${field}: "${fp.sourcePreview}${fp.sourceLen > 80 ? "…" : ""}"`);
    }
  }
  for (const a of anomalies) {
    log.warn(
      `  ! UNKNOWN-JSON ${a.table}/${a.id} (${a.name}) field=${a.field}: "${a.preview}…"`,
    );
  }
}

async function main(): Promise<number> {
  const args = parseCli();
  const log = makeLogger(args.verbose);
  const supabase = createServiceClient();

  const tablesToScan: TableName[] =
    args.table === "all" ? (["npcs", "deities", "pantheons"] as const).slice() : [args.table];

  const allPlans: RowPlan[] = [];
  const allAnomalies: RowAnomaly[] = [];

  for (const table of tablesToScan) {
    const rows = await fetchScopedRows(supabase, table, args);
    log.info(`fetched ${rows.length} rows from ${table}`);
    const { plans, anomalies } = planConversions(table, rows);
    allPlans.push(...plans);
    allAnomalies.push(...anomalies);
  }

  reportPlan(allPlans, allAnomalies, log);

  if (allPlans.length === 0) {
    log.info("nothing to convert — all rows already Tiptap or empty");
    return 0;
  }

  if (args.dryRun) {
    log.info("dry-run: not touching DB");
    return 0;
  }

  log.info(`applying ${allPlans.length} updates…`);
  const { ok, failed } = await applyPlans(supabase, allPlans, log);
  log.info(`done: ${ok}/${allPlans.length} succeeded, ${failed.length} failed`);
  if (allAnomalies.length > 0) {
    log.warn(
      `${allAnomalies.length} unknown-json rows were NOT touched — review manually ` +
      `before deciding whether to convert or leave.`,
    );
  }
  return failed.length > 0 ? 1 : 0;
}

// CLI-entry guard so tests can import without triggering main().
const invokedAsCli =
  typeof process.argv[1] === "string" &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (invokedAsCli) {
  main().then(
    (code) => process.exit(code),
    (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`FATAL: ${msg}`);
      if (err instanceof Error && err.stack) console.error(err.stack);
      process.exit(2);
    },
  );
}

export { planConversions as _planConversionsForTest, TABLE_FIELDS };
