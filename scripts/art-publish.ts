#!/usr/bin/env -S npx tsx --tsconfig tsconfig.node.json

/**
 * Upload every art object named in `src/generated/artManifest.json` to R2 under
 * its content-hashed key, with `IMMUTABLE_CACHE_CONTROL` (#864 / #877 story A3).
 *
 *   npm run art:publish -- --dry-run
 *   npm run art:publish
 *   npm run art:publish -- --verify [--concurrency N]
 *
 * Mirrors `scripts/r2-copy.ts` in shape: HEAD-first and skip-if-present, so an
 * interrupted run is resumed by re-running it and a manifest that gained new
 * entries (new art, or a repost of #864's remaining sets) converges the same
 * way. `--dry-run` reports what it would upload without writing anything;
 * `--verify` copies nothing and reports objects missing from R2 or the wrong
 * size.
 *
 * NEVER DELETES. Unlike `r2-copy.ts`'s bucket mirror, this has no delete path
 * at all, not even a documented "separate step" — a hashed key from an older
 * deploy may still be referenced by a client that has not reloaded the page,
 * and the whole point of content-hashed keys is that an old one simply stops
 * being requested once nothing links to it any more, rather than needing to
 * be reaped.
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  r2ConfigFrom,
  IMMUTABLE_CACHE_CONTROL,
  type R2Config,
} from "../supabase/functions/_shared/r2/config.ts";
import { putObject, headObject } from "../supabase/functions/_shared/r2/client.ts";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_PATH = path.join(REPO_ROOT, "src/generated/artManifest.json");

export interface Options {
  dryRun: boolean;
  verify: boolean;
  concurrency: number;
}

export function parseArgs(argv: string[]): Options {
  const get = (flag: string): string | null => {
    const at = argv.indexOf(flag);
    return at === -1 ? null : (argv[at + 1] ?? null);
  };
  return {
    dryRun: argv.includes("--dry-run"),
    verify: argv.includes("--verify"),
    concurrency: Number(get("--concurrency") ?? 8),
  };
}

/** `src/generated/artManifest.json`: `{ servedPath: r2Key }` — see A1's `scripts/art-manifest.ts`. */
export function loadManifest(manifestPath = MANIFEST_PATH): Record<string, string> {
  return JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, string>;
}

/**
 * Resolve a manifest key — a served, build-relative path like
 * `/assets/placeholders/npc.webp` or `/assets/sheets/foo.webp` — back to the
 * file on disk that `scripts/art-manifest.ts` hashed to produce it.
 *
 * Two roots feed the manifest (see common.md / art-manifest.ts): everything
 * under `public/assets` — including the loose files directly in it — is
 * served verbatim, so the served path already IS the `public/`-relative path.
 * Sheet plates live in `src/assets/sheets` instead: Vite hashes them at build
 * time for serving, but the manifest key is the *source* path, so no
 * `public/` file exists for it and the `src/` fallback resolves it. `public/`
 * is tried first because it is the common case; the `src/` fallback exists
 * only because that one directory has no `public/` mirror.
 */
export function resolveSourceFile(servedPath: string, repoRoot = REPO_ROOT): string {
  const publicPath = path.join(repoRoot, "public", servedPath);
  if (existsSync(publicPath)) return publicPath;
  const srcPath = path.join(repoRoot, "src", servedPath);
  if (existsSync(srcPath)) return srcPath;
  throw new Error(
    `no source file on disk for manifest key "${servedPath}" (checked public/ and src/ — is the manifest stale?)`,
  );
}

const CONTENT_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

export function contentTypeFor(filePath: string): string {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
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

export interface PublishDeps {
  putObject: typeof putObject;
  headObject: typeof headObject;
  /** Injected so tests never need real bytes on disk. */
  readFile: (filePath: string) => Buffer;
  resolveSourceFile: (servedPath: string) => string;
}

export interface PublishResult {
  uploaded: number;
  skipped: number;
  problems: string[];
}

/**
 * The publish loop, independent of argv/env/console so it can be driven by
 * tests with a mocked R2 client and no manifest file on disk.
 */
export async function publish(
  entries: [string, string][],
  r2: R2Config,
  options: Options,
  deps: PublishDeps,
): Promise<PublishResult> {
  let uploaded = 0;
  let skipped = 0;
  const problems: string[] = [];

  const handleEntry = async ([servedPath, key]: [string, string]): Promise<void> => {
    const filePath = deps.resolveSourceFile(servedPath);
    const bytes = deps.readFile(filePath);
    const existing = await deps.headObject(r2, key);

    // A known, matching size counts as already published — mirrors r2-copy's
    // resume check. Unlike r2-copy's Supabase listing, the local size is
    // never "unknown", so there is no third state to handle here.
    if (existing && existing.size === bytes.byteLength) {
      skipped++;
      return;
    }
    if (options.verify) {
      problems.push(
        existing
          ? `size mismatch ${key}: local ${bytes.byteLength} vs r2 ${existing.size ?? "unknown"}`
          : `missing from r2: ${key}`,
      );
      return;
    }
    if (options.dryRun) {
      uploaded++;
      return;
    }

    try {
      await deps.putObject(r2, {
        key,
        body: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
        contentType: contentTypeFor(filePath),
        cacheControl: IMMUTABLE_CACHE_CONTROL,
      });
      uploaded++;
    } catch (err) {
      problems.push(`upload failed ${key}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // The entire body is fenced, same reasoning as r2-copy.ts: a flaked HEAD or
  // PUT should become a problem row and a re-run, never crash the whole pool.
  await pooled(entries, options.concurrency, async (entry) => {
    try {
      await handleEntry(entry);
    } catch (err) {
      problems.push(`unexpected failure ${entry[0]}: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  return { uploaded, skipped, problems };
}

export async function run(argv = process.argv.slice(2)): Promise<number> {
  const options = parseArgs(argv);

  const r2 = r2ConfigFrom((key) => process.env[key]);
  if (!r2) {
    console.error(
      "R2 is not configured. Set R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID and\n" +
        "R2_SECRET_ACCESS_KEY in .env.local — see infra/README.md.",
    );
    return 1;
  }

  const manifest = loadManifest();
  const entries = Object.entries(manifest);
  console.log(
    `${options.verify ? "Verifying" : options.dryRun ? "Planning" : "Publishing"} ` +
      `${entries.length} art object(s) → r2://${r2.bucket}/`,
  );

  const result = await publish(entries, r2, options, {
    putObject,
    headObject,
    readFile: (p) => readFileSync(p),
    resolveSourceFile,
  });

  if (options.verify) {
    console.log(`  ${result.skipped} object(s) present in R2 at the correct size`);
    if (result.problems.length) {
      console.error(`  ${result.problems.length} problem(s):`);
      for (const problem of result.problems.slice(0, 50)) console.error(`    ${problem}`);
      if (result.problems.length > 50) console.error(`    … and ${result.problems.length - 50} more`);
      return 1;
    }
    console.log("  all published art verified in R2");
    return 0;
  }

  console.log(
    `  ${options.dryRun ? "would upload" : "uploaded"} ${result.uploaded}, skipped ${result.skipped} already present`,
  );
  if (result.problems.length) {
    console.error(`  ${result.problems.length} failure(s):`);
    for (const problem of result.problems.slice(0, 50)) console.error(`    ${problem}`);
    return 1;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
