// GDPR account deletion (#631) — self-serve, admin-initiated, and
// parent-initiated (#919). The contract this implements is
// context/compliance/data-subject-rights.md §2-§4.
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
//
// A parent deleting their child's account is also how consent is withdrawn
// (#919): the caller is checked against `child_accounts` for an active link
// (service-role query, re-verified again by `prepare_user_erasure` itself)
// before falling back to the admin gate, so a parent who is not also an app
// admin can still act on their own child. Whichever gate passes, the actor
// handed to `prepare_user_erasure` is always the verified caller, never the
// request body.
//
// A target that still parents an active child account is refused up front,
// before the storage purge — for self-serve and admin/parent deletion alike.
// `child_accounts.parent_user_id` is `on delete restrict`, so leaving this to
// surface only when `prepare_user_erasure` hits the same constraint would mean
// the storage purge (which runs first and cannot be undone) had already
// happened to an account the auth delete then refuses to remove: a half-erased
// account with no way back.

import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { withCors } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/requireAdmin.ts";
import { chunk } from "../_shared/storage-purge.ts";
import { listUserStorage } from "../_shared/storage-inventory.ts";
import { r2ConfigFrom, r2ObjectKey } from "../_shared/r2/config.ts";
import { deleteObjects } from "../_shared/r2/client.ts";
import { isoDate } from "../_shared/childAccount.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Supabase Storage's remove() takes a bounded list per call; ~100 keeps each
// request comfortably sized without adding much round-trip overhead.
const REMOVE_CHUNK_SIZE = 100;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/**
 * Delete every object belonging to `userId` from both stores.
 *
 * Finding the objects is `_shared/storage-inventory.ts`, shared with the GDPR
 * export (#632) so the two rights cannot disagree about what the account holds
 * — see that module's header. This function only removes what the inventory
 * found, and treats a listing error as fatal: a purge that silently skipped a
 * bucket it could not enumerate would report success while leaving objects
 * behind that no per-user listing path can reach again.
 */
async function purgeStorage(userId: string): Promise<string[]> {
  const r2Config = r2ConfigFrom((key) => Deno.env.get(key));
  const inventory = await listUserStorage(admin, userId, r2Config);
  const errors = [...inventory.errors];

  for (const { bucket, paths } of inventory.supabase) {
    for (const batch of chunk(paths, REMOVE_CHUNK_SIZE)) {
      const { error } = await admin.storage.from(bucket).remove(batch);
      if (error) errors.push(`${bucket}: remove failed: ${error.message}`);
    }
  }

  if (r2Config) {
    for (const { bucket, paths } of inventory.r2) {
      // The inventory returns bucket-relative paths; R2 keys are prefixed with
      // the bucket id (one R2 bucket holds every store — see r2/config.ts).
      const keys = paths.map((path) => r2ObjectKey(bucket, path));
      try {
        // deleteObjects issues one concurrent DELETE per key (it was written
        // for ~5-key image removals) — chunk so a large account doesn't fan out
        // hundreds of simultaneous requests.
        for (const batch of chunk(keys, REMOVE_CHUNK_SIZE)) {
          await deleteObjects(r2Config, batch);
        }
      } catch (err) {
        errors.push(`r2:${bucket}: ${err instanceof Error ? err.message : String(err)}`);
      }
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

  // A parent deleting their child's account (#919). Checked before the admin
  // gate so a parent who is not also an app admin can still act on their own
  // child; `prepare_user_erasure` re-verifies this same link independently.
  let isParentDeletion = false;
  if (!isSelfServe) {
    const { count, error: linkError } = await admin
      .from("child_accounts")
      .select("child_user_id", { count: "exact", head: true })
      .eq("child_user_id", targetUserId)
      .eq("parent_user_id", caller.id)
      .gt("adult_on", isoDate(new Date()));
    if (linkError) {
      console.error("delete-account: child_accounts lookup failed", linkError);
      return json({ error: "deletion_failed" }, 500);
    }
    // `count` is null only when the head query failed, which linkError covers.
    isParentDeletion = count !== null && count > 0;

    if (!isParentDeletion) {
      const gate = await requireAdmin(req);
      if (gate instanceof Response) return gate;
    }
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

  // Refused before any destructive work: the storage purge below cannot be
  // undone, and child_accounts.parent_user_id is `on delete restrict`, so a
  // target that still actively parents a child would have its storage purged
  // and then survive the auth delete anyway — a half-erased account. Applies
  // to self-serve and admin/parent deletion alike, since either can target an
  // account that still manages a child.
  const { count: childCount, error: childCountError } = await admin
    .from("child_accounts")
    .select("child_user_id", { count: "exact", head: true })
    .eq("parent_user_id", target.id)
    .gt("adult_on", isoDate(new Date()));
  // Fails closed: an unknown count must never reach the irreversible purge.
  if (childCountError || childCount === null) {
    console.error("delete-account: child_accounts lookup failed for target", target.id, childCountError);
    return json({ error: "deletion_failed" }, 500);
  }
  if (childCount > 0) return json({ error: "has_child_accounts" }, 409);

  const purgeErrors = await purgeStorage(target.id);
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
    p_actor_kind: isSelfServe ? "self" : isParentDeletion ? "parent" : "admin",
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
