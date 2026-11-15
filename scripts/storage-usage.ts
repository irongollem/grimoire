/**
 * Reconciles `public.stored_objects` against what Cloudflare R2 actually holds (#1182).
 *
 * Two jobs, one script. It is the repair for rows left by uploads that were signed and never sent (a row is written when
 * an upload is signed, so a PUT that never happened leaves a row with no file behind it), and it is a backfill that
 * records every existing object's size. The backfill is NOT a required step: what accounts already hold is a bonus
 * (maintainer, 15 Nov 2026), so the totals start at zero. Run it only if that is ever withdrawn.
 *
 * Per bucket it lists the objects with their sizes, keeps those owned by an account (first path segment a UUID; srd/,
 * library/ and bases/ belong to nobody), and plans: record what is missing or has a different size, remove rows whose
 * object is gone and that are older than the grace period. Re-running it after it has run plans nothing.
 *
 * Dry run by default. It prints counts and byte totals only, never an account, a path or a row. Running it against
 * production is the maintainer's to do.
 *
 * Usage:
 *   npm run storage:usage                                  (dry run)
 *   npm run storage:usage -- --write                       (loopback only)
 *   npm run storage:usage -- --write --yes-production
 *   flags: --bucket <id>, --grace-minutes <n> (default 60)
 */
import { parseArgs } from "node:util";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listObjectsWithSizes } from "../supabase/functions/_shared/r2/client.ts";
import { R2_BUCKET_IDS, r2ConfigFrom } from "../supabase/functions/_shared/r2/config.ts";
import { chunk } from "../supabase/functions/_shared/storage-purge.ts";
import { isCliEntry } from "./lib/cli.ts";
import { isLoopback } from "./lib/dev-stack.ts";
import { createServiceClient, requireEnv } from "./lib/seed-helpers.ts";
import {
  DEFAULT_GRACE_MINUTES,
  FREE_LIMIT_BYTES,
  PRO_LIMIT_BYTES,
  countOver,
  groupByUser,
  planStorageUsage,
  type ListedObject,
  type StoredRow,
} from "./lib/storageUsagePlan.ts";

const PAGE = 1000;
const RECORD_CHUNK = 500;
const REMOVE_CHUNK = 200;

async function readRows(client: SupabaseClient, bucket: string): Promise<StoredRow[]> {
  const rows: StoredRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from("stored_objects")
      .select("path, user_id, bytes, created_at, released_at")
      .eq("bucket", bucket)
      .order("path", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data as StoredRow[]));
    if (data.length < PAGE) return rows;
  }
}

async function readTotals(client: SupabaseClient): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from("storage_usage")
      .select("user_id, bytes")
      .order("user_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const row of data as { user_id: string; bytes: number }[]) totals.set(row.user_id, Number(row.bytes));
    if (data.length < PAGE) return totals;
  }
}

const mb = (bytes: number): string => (bytes / (1024 * 1024)).toFixed(1);

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      write: { type: "boolean", default: false },
      "yes-production": { type: "boolean", default: false },
      "grace-minutes": { type: "string", default: String(DEFAULT_GRACE_MINUTES) },
      bucket: { type: "string" },
    },
  });
  const graceMinutes = Number(values["grace-minutes"]);
  if (!Number.isFinite(graceMinutes) || graceMinutes < 0) throw new Error("--grace-minutes must be a number of minutes, 0 or more.");
  const buckets = values.bucket ? [values.bucket] : [...R2_BUCKET_IDS];
  if (values.bucket && !R2_BUCKET_IDS.includes(values.bucket)) {
    throw new Error(`--bucket must be one of: ${R2_BUCKET_IDS.join(", ")}.`);
  }

  const r2 = r2ConfigFrom((key) => process.env[key]);
  if (r2 === null) {
    console.error("R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY must all be set.");
    process.exit(1);
  }
  const env = requireEnv();
  const loopback = isLoopback(new URL(env.supabaseUrl).hostname);
  console.log(`Target: ${env.supabaseUrl} (${loopback ? "loopback" : "NOT loopback"}), ${values.write ? "write" : "dry run"}`);
  if (values.write && !loopback && !values["yes-production"]) {
    throw new Error("Refusing to write to a non-loopback project without --yes-production.");
  }
  const client = createServiceClient(env);

  const now = new Date();
  const listedTotals = new Map<string, number>();
  let skippedAccounts = 0;
  let refused = 0;

  for (const bucket of buckets) {
    const prefix = `${bucket}/`;
    const listing: ListedObject[] = (await listObjectsWithSizes(r2, prefix)).map((o) => ({
      path: o.key.slice(prefix.length),
      size: o.size,
    }));
    const rows = await readRows(client, bucket);
    const plan = planStorageUsage(listing, rows, now, graceMinutes);
    for (const [userId, bytes] of plan.bytesByUser) listedTotals.set(userId, (listedTotals.get(userId) ?? 0) + bytes);

    const recordBytes = plan.record.reduce((sum, e) => sum + e.size, 0);
    console.log(
      `${bucket}: ${listing.length} listed (${plan.unowned} unowned, ${plan.empty} empty), ${rows.length} rows, ` +
        `${plan.record.length} to record (${mb(recordBytes)} MB), ${plan.remove.length} to remove`,
    );
    if (!values.write) continue;

    for (const [userId, entries] of groupByUser(plan.record)) {
      for (const part of chunk(entries, RECORD_CHUNK)) {
        const { data, error } = await client.rpc("reserve_storage", {
          p_user_id: userId,
          p_bucket: bucket,
          p_objects: part.map((e) => ({ path: e.path, size: e.size })),
          p_enforce: false,
        });
        if (error) throw error;
        const answer = data as { allowed: boolean; skipped?: boolean };
        if (answer.skipped) skippedAccounts += 1;
        else if (!answer.allowed) refused += 1;
      }
    }
    for (const part of chunk(plan.remove, REMOVE_CHUNK)) {
      // Through the function, not a filtered delete: two hundred paths in a query string outgrow a URL.
      const { error } = await client.rpc("release_storage", { p_bucket: bucket, p_paths: part });
      if (error) throw error;
    }
  }

  if (values.write) {
    console.log(`Accounts skipped as unknown: ${skippedAccounts} (calls, one per account and bucket chunk).`);
    if (refused > 0) throw new Error(`${refused} record calls were refused although enforcement was off.`);
  }
  const totals = values.write ? await readTotals(client) : listedTotals;
  const tense = values.write ? "sit" : "would sit";
  console.log(`Accounts with storage: ${totals.size}`);
  console.log(`Accounts that ${tense} over 250 MB: ${countOver(totals, FREE_LIMIT_BYTES)}`);
  console.log(`Accounts that ${tense} over 10 GB: ${countOver(totals, PRO_LIMIT_BYTES)}`);
}

if (isCliEntry(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
