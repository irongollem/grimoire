/**
 * Creates the storage buckets a local stack is missing, so image and audio
 * uploads work when developing against `npm run db:start`.
 *
 * WHY THIS IS A SCRIPT AND NOT A MIGRATION
 *
 * `src/lib/storage/buckets.ts` declares fifteen buckets. Only five were ever
 * created by a migration; the rest were made by hand in the Supabase dashboard,
 * so they exist in production and in nobody's local stack. Their RLS policies
 * are not missing — the squashed initial schema names `location-images`,
 * `trap-images` and the others — but a policy on a bucket that does not exist
 * is inert, which is why nothing ever failed in CI.
 *
 * The obvious fix is a migration. It is the wrong one. Object writes now go to
 * Cloudflare R2 (#577); the Supabase buckets are retained only while the stored
 * bytes may still be needed, and are slated for removal once R2 is proven. A
 * migration runs everywhere, so provisioning buckets that way would create them
 * in production — adding to the very set that is being torn down, including one
 * (`puzzle-images`) that production does not have at all.
 *
 * So this is local-only by construction. Like `dev-auth.ts`, it reads the
 * running stack's own keys and refuses to address anything but loopback, which
 * is what makes "cannot touch production" a property rather than a promise.
 *
 * Config is read from `BUCKETS` rather than restated here, so this cannot drift
 * from the registry the client guards use. Note that production has drifted in
 * the other direction for two buckets — `chronicle` has no size or MIME limit
 * there, and `sounds` allows a different audio list — so a local bucket made
 * here is stricter than its production counterpart, not identical to it.
 *
 * Usage:  npm run dev:buckets     (after `npm run db:start`)
 */

import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { LOCAL_BUCKETS } from "./dev-buckets.data";
import { createClient } from "@supabase/supabase-js";


const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

interface StackStatus {
  API_URL: string;
  DB_URL: string;
  SERVICE_ROLE_KEY: string;
}

function readStack(): StackStatus {
  let raw: string;
  try {
    raw = execFileSync("supabase", ["status", "-o", "json"], { encoding: "utf8" });
  } catch {
    throw new Error("Local stack is not running. Start it with `npm run db:start`.");
  }
  const status = JSON.parse(raw) as StackStatus;

  // The same guard dev-auth.ts uses, and for the same reason: if the stack under
  // this command is not on loopback it is not the disposable one, and a script
  // that creates buckets has no business addressing it.
  for (const [label, url] of [
    ["API_URL", status.API_URL],
    ["DB_URL", status.DB_URL],
  ] as const) {
    const host = new URL(url).hostname;
    if (!LOOPBACK.has(host)) {
      throw new Error(
        `Refusing to run: ${label} points at ${host}, not loopback. ` +
          `This script only ever addresses the local disposable stack.`,
      );
    }
  }
  return status;
}

async function main(): Promise<void> {
  const stack = readStack();
  const admin = createClient(stack.API_URL, stack.SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: existing, error: listError } = await admin.storage.listBuckets();
  if (listError) throw new Error(`Could not list buckets: ${listError.message}`);
  const have = new Set((existing ?? []).map((b) => b.id));

  const created: string[] = [];
  const failed: string[] = [];

  for (const config of LOCAL_BUCKETS) {
    if (have.has(config.id)) continue;
    const { error } = await admin.storage.createBucket(config.id, {
      public: config.public,
      fileSizeLimit: config.maxBytes,
      allowedMimeTypes: [...config.mimeTypes],
    });
    if (error) failed.push(`${config.id} (${error.message})`);
    else created.push(config.id);
  }

  const total = LOCAL_BUCKETS.length;
  if (created.length === 0 && failed.length === 0) {
    console.log(`All ${total} declared buckets already exist locally. Nothing to do.`);
  } else {
    if (created.length > 0) {
      console.log(`Created ${created.length} of ${total} declared buckets:`);
      for (const id of created) console.log(`  + ${id}`);
    }
    if (failed.length > 0) {
      console.error(`\nFailed to create ${failed.length}:`);
      for (const f of failed) console.error(`  ! ${f}`);
      process.exitCode = 1;
    }
  }
}

// Only run when invoked directly, so dev-buckets.test.ts can import
// LOCAL_BUCKETS without this script trying to reach a stack.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
}
