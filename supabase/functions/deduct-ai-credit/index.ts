import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { serveUser } from "../_shared/pipeline/serveUser.ts";
import { json, jsonError, readJsonBody } from "../_shared/pipeline/respond.ts";
import { parseUsageLog } from "./usageLog.ts";

// A usage beacon only: logs a generation the client made with the user's own key, as a delta-0 BYOK row. It never
// spends credits; see usageLog.ts for why the spend branch is gone.

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

serve(serveUser(async ({ user, req }) => {
  const row = parseUsageLog(await readJsonBody(req));
  if (!row) return jsonError(400, "invalid_body", "Need { reason, is_byok: true }.");

  // #609: every BYOK/local-key generation logs a row, even when the provider reported no token counts: a token-less
  // row still proves the generation happened.
  const { error } = await admin.from("ai_credit_ledger").insert({ user_id: user.id, delta: 0, is_byok: true, ...row });
  if (error) {
    console.error("Failed to log BYOK usage:", error);
    return jsonError(500, "log_failed");
  }
  return json({ ok: true, byok: true });
}));
