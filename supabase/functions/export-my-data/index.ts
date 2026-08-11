// GDPR access & portability export (#632, Art. 15/20). The contract this
// implements is context/compliance/data-subject-rights.md §4e.
//
// Self-serve only, and deliberately so. `delete-account` carries an admin path
// because an operator sometimes has to erase an account its owner can no longer
// reach; nothing equivalent is true of export. An admin route here would be a
// button that dumps another person's entire account into a browser download,
// which is a data-disclosure surface the GDPR does not ask for and Art. 32 says
// not to build. The target is therefore always the caller — there is no
// `targetUserId` parameter to pass, not merely one that is ignored.
//
// Identity is the verified JWT (`auth.getUser()`), never the body, per the
// SECURITY DEFINER rules in CLAUDE.md. `export_user_data` is service_role-only,
// so this function is the sole route to it and its rate limit is the real one:
// a browser cannot reach the RPC to bypass it.

import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { withCors } from "../_shared/cors.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { listUserStorage, totalObjectCount } from "../_shared/storage-inventory.ts";
import { r2ConfigFrom } from "../_shared/r2/config.ts";

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

  // Checked before any work: an export reads every table in the database for
  // one account, so it is the most expensive read the app can be asked for.
  const allowed = await checkRateLimit(admin, caller.id, "data_export");
  if (!allowed) return json({ error: "rate_limited" }, 429);

  const { data: exported, error: exportError } = await admin.rpc("export_user_data", {
    p_user_id: caller.id,
  });
  if (exportError || !exported) {
    console.error("export-my-data: export_user_data failed for user", caller.id, exportError);
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
  const inventory = await listUserStorage(admin, caller.id, r2ConfigFrom((key) => Deno.env.get(key)));
  if (inventory.errors.length > 0) {
    console.error("export-my-data: storage listing incomplete for user", caller.id, inventory.errors);
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
