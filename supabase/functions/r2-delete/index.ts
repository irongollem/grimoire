// Delete objects from R2-backed storage buckets (#577 stage 2).
//
// The counterpart to r2-sign-upload, and the reason deletes are not presigned:
// handing a client a delete-capable URL adds a window in which that URL works,
// for no benefit — a delete has no body to stream, so there is nothing to gain by
// routing the bytes around us. The authorization is the same prefix rule the
// `storage.objects` delete policies express, applied here because R2 has none.
//
// Deleting an object that is not there is a success, not an error. That keeps the
// client's cleanup paths (which fire optimistically, and may run twice) quiet.

import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { withCors } from "../_shared/cors.ts";
import { r2ConfigFrom, r2ObjectKey } from "../_shared/r2/config.ts";
import { deleteObjects } from "../_shared/r2/client.ts";
import { parseDeleteRequest, authorizeDeletes } from "../_shared/r2/api.ts";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

serve(withCors(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const config = r2ConfigFrom((key) => Deno.env.get(key));
  if (!config) return json({ error: "R2 is not configured" }, 503);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const caller = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await caller.auth.getUser();
  if (authError || !user) return json({ error: "Unauthorized" }, 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = parseDeleteRequest(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  const identity = { userId: user.id, isAdmin: user.app_metadata?.role === "admin" };
  const authorized = authorizeDeletes(parsed.value, identity);
  if (!authorized.allowed) return json({ error: authorized.reason }, 403);

  await deleteObjects(config, parsed.value.paths.map((path) => r2ObjectKey(parsed.value.bucket, path)));

  return json({ deleted: parsed.value.paths.length }, 200);
}));
