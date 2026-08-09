// GDPR account deletion (#631) — self-serve and admin-initiated. The contract
// this implements is context/compliance/data-subject-rights.md §2-§4.
//
// Deletes the auth.users row (which cascades/set-nulls through every other
// table per migration 20260808000001) after first purging the user's storage
// objects in BOTH stores (#577's Supabase-Storage-to-R2 transition means an
// object can currently live in either) and anonymizing the rows that must
// survive erasure as billing/dispute evidence
// (ai_credit_ledger, purchase_consents — see prepare_user_erasure).
//
// Storage is purged BEFORE the auth user is deleted, and the whole request
// fails if any bucket's purge fails: once the user row is gone, an orphaned
// object with no owner cannot be found by any of our per-user listing paths
// again, so a partial purge would leave unreachable, undeletable files behind
// forever. Erasure-preparation and the user delete happen only after a clean
// purge.

import { serve } from "std/http/server.ts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { withCors } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/requireAdmin.ts";
import { listAllFilePaths, chunk, type StorageEntry } from "../_shared/storage-purge.ts";
import { r2ConfigFrom, r2ObjectKey, R2_BUCKET_IDS } from "../_shared/r2/config.ts";
import { listObjects, deleteObjects } from "../_shared/r2/client.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Supabase Storage's remove() takes a bounded list per call; ~100 keeps each
// request comfortably sized without adding much round-trip overhead.
const REMOVE_CHUNK_SIZE = 100;
// Supabase Storage's list() defaults to 100 rows; page explicitly so a folder
// with more objects than that doesn't silently lose the tail.
const LIST_PAGE_SIZE = 1000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function listFolderPaginated(
  client: SupabaseClient,
  bucketId: string,
  prefix: string,
): Promise<StorageEntry[]> {
  const entries: StorageEntry[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await client.storage.from(bucketId).list(prefix, { limit: LIST_PAGE_SIZE, offset });
    if (error) throw new Error(error.message);
    const page = (data ?? []) as StorageEntry[];
    entries.push(...page);
    if (page.length < LIST_PAGE_SIZE) break;
    offset += LIST_PAGE_SIZE;
  }
  return entries;
}

/**
 * Purge `userId`'s objects from every Supabase Storage bucket. Every bucket
 * currently registered (`listBuckets()`), not just the ones this repo's
 * BUCKETS registry knows about — a bucket the app no longer writes to can
 * still hold objects from before it was retired.
 */
async function purgeSupabaseStorage(userId: string): Promise<string[]> {
  const { data: buckets, error: bucketsError } = await admin.storage.listBuckets();
  if (bucketsError) return [`listBuckets: ${bucketsError.message}`];

  const errors: string[] = [];
  for (const bucket of buckets ?? []) {
    try {
      const paths = await listAllFilePaths(
        (prefix) => listFolderPaginated(admin, bucket.id, prefix),
        userId,
      );
      for (const batch of chunk(paths, REMOVE_CHUNK_SIZE)) {
        const { error } = await admin.storage.from(bucket.id).remove(batch);
        if (error) errors.push(`${bucket.id}: remove failed: ${error.message}`);
      }
    } catch (err) {
      errors.push(`${bucket.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return errors;
}

/**
 * Purge `userId`'s objects from every R2-backed bucket, mirroring r2-list /
 * r2-delete. A missing R2 config is not an error — it means this environment
 * hasn't been provisioned for R2 yet (see r2ConfigFrom), so every object is
 * still in Supabase Storage and the purge above already covers it.
 */
async function purgeR2Storage(userId: string): Promise<string[]> {
  const config = r2ConfigFrom((key) => Deno.env.get(key));
  if (!config) return [];

  const errors: string[] = [];
  for (const bucketId of R2_BUCKET_IDS) {
    try {
      const keys = await listObjects(config, r2ObjectKey(bucketId, `${userId}/`));
      // deleteObjects issues one concurrent DELETE per key (it was written for
      // ~5-key image removals) — chunk so a large account doesn't fan out
      // hundreds of simultaneous requests.
      for (const batch of chunk(keys, REMOVE_CHUNK_SIZE)) {
        await deleteObjects(config, batch);
      }
    } catch (err) {
      errors.push(`r2:${bucketId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return errors;
}

serve(withCors(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const callerClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !caller) return json({ error: "Unauthorized" }, 401);

  let body: { confirm?: unknown; targetUserId?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const requestedTarget = typeof body.targetUserId === "string" ? body.targetUserId : undefined;
  const targetUserId = requestedTarget && requestedTarget !== caller.id ? requestedTarget : caller.id;
  const isSelfServe = targetUserId === caller.id;

  if (!isSelfServe) {
    const gate = await requireAdmin(req);
    if (gate instanceof Response) return gate;
  }

  if (body.confirm !== "DELETE") return json({ error: "confirm_required" }, 400);

  const { data: targetData, error: targetError } = await admin.auth.admin.getUserById(targetUserId);
  if (targetError || !targetData?.user) return json({ error: "user_not_found" }, 404);
  const target = targetData.user;

  // An admin account must be de-privileged (role changed away from "admin")
  // before it can be deleted. This also stops an admin nuking their own
  // account by accident via the self-serve path — self-serve resolves to the
  // caller's own id, and this check does not distinguish self-serve from
  // admin-initiated.
  if (target.app_metadata?.role === "admin") return json({ error: "cannot_delete_admin" }, 400);

  const [supabaseErrors, r2Errors] = await Promise.all([
    purgeSupabaseStorage(target.id),
    purgeR2Storage(target.id),
  ]);
  const purgeErrors = [...supabaseErrors, ...r2Errors];
  if (purgeErrors.length > 0) {
    console.error("delete-account: storage purge failed for user", target.id, purgeErrors);
    return json({ error: "storage_purge_failed" }, 500);
  }

  // The actor is re-derived here from the verified caller, never from the body:
  // it is the only record of who erased this account, so a caller-supplied
  // value would let an admin pin their own deletions on someone else.
  const { error: prepareError } = await admin.rpc("prepare_user_erasure", {
    p_user_id: target.id,
    p_actor_id: caller.id,
    p_actor_kind: isSelfServe ? "self" : "admin",
  });
  if (prepareError) {
    console.error("delete-account: prepare_user_erasure failed for user", target.id, prepareError);
    return json({ error: "erasure_preparation_failed" }, 500);
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(target.id);
  if (deleteError) {
    console.error("delete-account: deleteUser failed for user", target.id);
    return json({ error: "deletion_failed" }, 500);
  }

  return json({ ok: true });
}));
