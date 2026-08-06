/**
 * Copy a storage bucket's objects from Supabase Storage to R2 (#577 stage 2).
 *
 *   npm run r2:copy -- --bucket sounds --dry-run
 *   npm run r2:copy -- --bucket sounds
 *   npm run r2:copy -- --bucket sounds --verify
 *
 * WHERE THIS SITS IN THE SEQUENCE (per #577): copy → dual-read → flip origin →
 * drop fallback. This is the copy. It is safe to run against a live bucket
 * because the Worker already serves from either store, so a half-copied bucket
 * is not a broken bucket — objects that have moved are served from R2 and the
 * rest keep coming from Supabase.
 *
 * RESUMABLE BY CONSTRUCTION. Every object is HEADed in R2 first and skipped when
 * it is already there at the same byte length, so an interrupted run is resumed
 * by re-running it, and a bucket that keeps taking writes during the copy is
 * converged by running it again. Nothing is ever deleted from Supabase — that is
 * a separate, deliberate step taken only after `--verify` reports a clean bucket.
 *
 * `--verify` copies nothing. It walks the same listing and reports objects that
 * are missing from R2 or differ in size. A bucket may only be added to
 * `R2_BUCKET_IDS` after a verify run comes back clean.
 */

import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { r2ConfigFrom, r2ObjectKey, IMMUTABLE_CACHE_CONTROL } from "../supabase/functions/_shared/r2/config.ts";
import { putObject, headObject, getObject } from "../supabase/functions/_shared/r2/client.ts";
import { STORAGE_WRITE_POLICY } from "../supabase/functions/_shared/storage-policy.ts";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

interface Options {
  bucket: string;
  dryRun: boolean;
  verify: boolean;
  /** With --verify: also download both copies and compare SHA-256, not just size. */
  deep: boolean;
  concurrency: number;
}

function parseArgs(argv: string[]): Options {
  const get = (flag: string): string | null => {
    const at = argv.indexOf(flag);
    return at === -1 ? null : argv[at + 1] ?? null;
  };
  const bucket = get("--bucket");
  if (!bucket) {
    console.error(
      "Usage: npm run r2:copy -- --bucket <id> [--dry-run] [--verify [--deep]] [--concurrency N]\n" +
      `Known buckets: ${STORAGE_WRITE_POLICY.map((p) => p.id).join(", ")}`,
    );
    process.exit(1);
  }
  if (!STORAGE_WRITE_POLICY.some((p) => p.id === bucket)) {
    console.error(`Unknown bucket "${bucket}".`);
    process.exit(1);
  }
  return {
    bucket,
    dryRun: argv.includes("--dry-run"),
    verify: argv.includes("--verify"),
    deep: argv.includes("--deep"),
    concurrency: Number(get("--concurrency") ?? 8),
  };
}

interface StorageEntry {
  path: string;
  /** Null when Supabase's listing carries no size — "unknown", never "0 bytes". */
  size: number | null;
}

/**
 * Walk a bucket depth-first.
 *
 * Supabase's `list` is per-prefix and page-limited, and it returns folders as
 * entries with a null `id` — there is no recursive mode, so the recursion is
 * ours. Sorting by name keeps the traversal order stable, which matters only in
 * that it makes an interrupted run's progress output comparable to the next.
 */
async function* walk(
  storage: ReturnType<typeof createClient>["storage"],
  bucket: string,
  prefix = "",
): AsyncGenerator<StorageEntry> {
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await storage.from(bucket).list(prefix, {
      limit: PAGE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    if (!data || data.length === 0) return;

    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      // A null id means a folder placeholder, not an object.
      if (entry.id === null) {
        yield* walk(storage, bucket, path);
      } else {
        // Explicit null for an unpopulated size, not `?? 0`: a coerced zero
        // would make the resume check treat "size unknown" as "0-byte file"
        // and silently mis-skip or mis-flag the object.
        const size = entry.metadata?.size;
        yield { path, size: typeof size === "number" ? size : null };
      }
    }
    if (data.length < PAGE) return;
  }
}

/** Run `worker` over `items` with a bounded number in flight. */
async function pooled<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index]);
    }
  });
  await Promise.all(runners);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error(
      "Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run via:\n" +
      "  npm run r2:copy -- --bucket <id>",
    );
    process.exit(1);
  }

  const r2 = r2ConfigFrom((key) => process.env[key]);
  if (!r2) {
    console.error(
      "R2 is not configured. Set R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID and\n" +
      "R2_SECRET_ACCESS_KEY in .env.local — see infra/README.md.",
    );
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  console.log(
    `${options.verify ? "Verifying" : options.dryRun ? "Planning" : "Copying"} ` +
    `${options.bucket} → r2://${r2.bucket}/${options.bucket}/`,
  );

  const objects: StorageEntry[] = [];
  for await (const entry of walk(supabase.storage, options.bucket)) objects.push(entry);
  console.log(`  ${objects.length} object(s) in Supabase`);

  let copied = 0;
  let skipped = 0;
  const problems: string[] = [];

  const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

  await pooled(objects, options.concurrency, async (entry) => {
    const key = r2ObjectKey(options.bucket, entry.path);
    const existing = await headObject(r2, key);

    // A known, matching size counts as copied. An UNKNOWN Supabase size never
    // does — it re-downloads and re-puts (idempotent) rather than guessing.
    if (existing && entry.size !== null && existing.size === entry.size) {
      if (options.verify && options.deep) {
        // Size equality is necessary but not sufficient: same-size wrong bytes
        // (a corrupted earlier copy) pass the cheap check forever. --deep
        // downloads both copies and compares SHA-256 before trusting the skip.
        const [{ data: supabaseCopy, error: downloadError }, r2Bytes] = await Promise.all([
          supabase.storage.from(options.bucket).download(entry.path),
          getObject(r2, key),
        ]);
        if (downloadError || !supabaseCopy || !r2Bytes) {
          problems.push(`deep verify could not read both copies of ${key}`);
          return;
        }
        const supabaseHash = sha256(new Uint8Array(await supabaseCopy.arrayBuffer()));
        if (supabaseHash !== sha256(r2Bytes)) {
          problems.push(`content mismatch ${key}: same size, different bytes (sha256 differs)`);
          return;
        }
      }
      skipped++;
      return;
    }
    if (options.verify) {
      problems.push(
        existing
          ? entry.size === null || existing.size === null
            ? `unknown size for ${key} (supabase ${entry.size ?? "?"}, r2 ${existing.size ?? "?"}) — cannot verify by size; use --deep`
            : `size mismatch ${key}: supabase ${entry.size} vs r2 ${existing.size}`
          : `missing from r2: ${key}`,
      );
      return;
    }
    if (options.dryRun) {
      copied++;
      return;
    }

    const { data, error } = await supabase.storage.from(options.bucket).download(entry.path);
    if (error || !data) {
      problems.push(`download failed ${entry.path}: ${error?.message ?? "no data"}`);
      return;
    }
    const bytes = new Uint8Array(await data.arrayBuffer());

    try {
      await putObject(r2, {
        key,
        body: bytes,
        // The blob's own type, falling back to a type that means "bytes" rather
        // than guessing from the extension — a wrong Content-Type is served to
        // every future reader, and octet-stream at least fails honestly.
        contentType: data.type || "application/octet-stream",
        cacheControl: IMMUTABLE_CACHE_CONTROL,
      });
      copied++;
      if (copied % 100 === 0) console.log(`  ${copied} copied…`);
    } catch (err) {
      problems.push(`upload failed ${key}: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  if (options.verify) {
    console.log(`  ${skipped} object(s) present in R2 at the same size`);
    if (problems.length) {
      console.error(`  ${problems.length} problem(s):`);
      for (const problem of problems.slice(0, 50)) console.error(`    ${problem}`);
      if (problems.length > 50) console.error(`    … and ${problems.length - 50} more`);
      // Non-zero exit so this is usable as a gate before flipping a bucket over.
      process.exit(1);
    }
    console.log("  bucket verified — safe to add to R2_BUCKET_IDS");
    return;
  }

  console.log(
    `  ${options.dryRun ? "would copy" : "copied"} ${copied}, skipped ${skipped} already present`,
  );
  if (problems.length) {
    console.error(`  ${problems.length} failure(s):`);
    for (const problem of problems.slice(0, 50)) console.error(`    ${problem}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
