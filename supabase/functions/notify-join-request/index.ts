/**
 * The joiner's join page asks for the approving parents to be emailed
 * (#927). Bearer-authenticated (verify_jwt stays on, like child-account: a
 * signed-in caller is always present, so there is no anonymous path to open).
 *
 * Only the request's own joiner may ring it; anyone else gets the same 404 as
 * a missing request, so existence is not revealed. Every non-error outcome
 * answers `{ ok: true }` so the response says nothing about which parents
 * exist, whether they were mailed, or whether a limit was hit.
 */
import { serve } from "std/http/server.ts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { withCors } from "../_shared/cors.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { notifyJoinRequest } from "../_shared/joinRequestNotify.ts";

const admin: SupabaseClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

serve(withCors(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);
  const callerClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: userError } = await callerClient.auth.getUser();
  if (userError || !user) return json({ error: "Unauthorized" }, 401);

  let requestId: unknown;
  try {
    const parsed: unknown = await req.json();
    if (typeof parsed !== "object" || parsed === null) throw new Error("body must be an object");
    requestId = (parsed as Record<string, unknown>).request_id;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  if (typeof requestId !== "string" || requestId.length === 0) return json({ error: "not_found" }, 404);

  const { data: request, error } = await admin
    .from("campaign_join_requests")
    .select("user_id")
    .eq("id", requestId)
    .maybeSingle();
  if (error) {
    // A malformed uuid also lands here; it must look like any other miss.
    console.error("notify-join-request: request lookup failed", error);
    return json({ error: "not_found" }, 404);
  }
  if (!request || request.user_id !== user.id) return json({ error: "not_found" }, 404);

  if (!(await checkRateLimit(admin, user.id, "join_request_caller"))) return json({ ok: true });

  const result = await notifyJoinRequest(admin, requestId);
  console.warn(`notify-join-request: ${result.status}, ${result.rateLimited} rate-limited`);
  return json({ ok: true });
}));
