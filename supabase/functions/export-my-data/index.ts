// GDPR access & portability export (#632, Art. 15/20). The contract this
// implements is context/compliance/data-subject-rights.md §4e.
//
// Caller-only, with one deliberate exception (#919). An admin route here would
// be a button that dumps another person's entire account into a browser
// download, which is a data-disclosure surface the GDPR does not ask for and
// Art. 32 says not to build — that reasoning still holds and is why there is no
// admin path, unlike `delete-account`. The exception is a parent exporting
// their child's account: under COPPA and GDPR Art. 8 the parent is who
// exercises the child's rights, so an export the parent cannot get is a right
// the child does not effectively have. A `targetUserId` is therefore accepted,
// but only ever resolves to an account the caller actively parents — the
// function re-checks the `child_accounts` link itself (service-role query),
// and `export_user_data` re-checks it again independently before it will read
// a row that isn't the caller's own.
//
// Identity is the verified JWT (`auth.getUser()`), never the body, per the
// SECURITY DEFINER rules in CLAUDE.md — `targetUserId` says *whose* data to
// read, it never substitutes for who is asking. `export_user_data` is
// service_role-only, so this function is the sole route to it and its rate
// limit is the real one: a browser cannot reach the RPC to bypass it. The rate
// limit stays keyed on the caller even for a parent export, so a parent with
// several children is bounded once, not once per child.

import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { withCors } from "../_shared/cors.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { listUserStorage, totalObjectCount } from "../_shared/storage-inventory.ts";
import { r2ConfigFrom } from "../_shared/r2/config.ts";
import { isoDate } from "../_shared/childAccount.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

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

  let body: { targetUserId?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const requestedTarget = typeof body.targetUserId === "string" ? body.targetUserId : undefined;
  const targetUserId = requestedTarget && requestedTarget !== caller.id ? requestedTarget : caller.id;
  const isParentRequest = targetUserId !== caller.id;

  // A parent exporting their child's account (#919). Re-verified here, not
  // merely trusted from the client, so a `targetUserId` the caller does not
  // actively parent is refused before any work is done on it.
  if (isParentRequest) {
    const { count, error: linkError } = await admin
      .from("child_accounts")
      .select("child_user_id", { count: "exact", head: true })
      .eq("child_user_id", targetUserId)
      .eq("parent_user_id", caller.id)
      .gt("adult_on", isoDate(new Date()));
    if (linkError) {
      console.error("export-my-data: child_accounts lookup failed", linkError);
      return json({ error: "export_failed" }, 500);
    }
    if (count === null || count === 0) return json({ error: "not_your_child" }, 403);
  }

  // Checked before any work: an export reads every table in the database for
  // one account, so it is the most expensive read the app can be asked for.
  // Keyed on the caller even for a parent export, so a parent with several
  // children is bounded once rather than once per child.
  const allowed = await checkRateLimit(admin, caller.id, "data_export");
  if (!allowed) return json({ error: "rate_limited" }, 429);

  const { data: exported, error: exportError } = await admin.rpc("export_user_data", {
    p_user_id: targetUserId,
    p_parent_user_id: isParentRequest ? caller.id : null,
  });
  if (exportError || !exported) {
    console.error("export-my-data: export_user_data failed for user", targetUserId, exportError);
    return json({ error: "export_failed" }, 500);
  }

  // Storage objects live outside Postgres, so they are enumerated here — from
  // the same shared listing delete-account purges with, so the export cannot
  // claim to hold less than erasure would remove.
  //
  // A bucket that fails to list is reported in the document rather than failing
  // the request. The asymmetry with delete-account is deliberate: there, a
  // partial answer strands files forever, so it must refuse; here, a partial
  // answer is still most of the subject's data, and withholding all of it over
  // one unreachable bucket serves nobody. The gap is named in the export so it
  // is disclosed rather than hidden.
  const inventory = await listUserStorage(admin, targetUserId, r2ConfigFrom((key) => Deno.env.get(key)));
  if (inventory.errors.length > 0) {
    console.error("export-my-data: storage listing incomplete for user", targetUserId, inventory.errors);
  }

  return json({
    ...exported,
    storage_objects: {
      // Paths, not signed URLs. A URL in a file the user keeps is either an
      // expiry waiting to break the export or a credential sitting in their
      // downloads folder; the objects stay reachable in-app for as long as the
      // account exists, and these paths identify them.
      note:
        "Paths of files stored under your account, by bucket. These are the same objects account " +
        "deletion removes. Public buckets serve them from the asset CDN; private ones require a signed URL.",
      total: totalObjectCount(inventory),
      supabase_storage: inventory.supabase,
      r2: inventory.r2,
      incomplete: inventory.errors.length > 0,
    },
  });
}));
