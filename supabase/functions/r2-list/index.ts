// List a caller's own objects in an R2-backed bucket (#577 stage 2).
//
// Exists because `supabase.storage.from(...).list(...)` can only see Supabase
// Storage — once a bucket's writes flip to R2, anything that enumerates a user's
// uploads (the "reuse previously uploaded art" picker) goes blind to new objects
// unless it can list R2 too. The client merges this with the Supabase listing;
// see `listOwnedPaths` in src/lib/storage/list.ts.
//
// The objects are public; the *enumeration* is not. `storage.objects` SELECT
// policies restrict listing to the owner's folder, and `authorizeList` is that
// rule for R2: own prefix only, service-managed buckets refused.

import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { withCors } from "../_shared/cors.ts";
import { r2ConfigFrom, r2ObjectKey } from "../_shared/r2/config.ts";
import { listObjects } from "../_shared/r2/client.ts";
import { parseListRequest, authorizeList } from "../_shared/r2/api.ts";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

serve(withCors(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const config = r2ConfigFrom((key) => Deno.env.get(key));
  if (!config) {
    // Same contract as r2-sign-upload: 503 tells the client "R2 is not
    // provisioned — the Supabase listing alone is complete", not "retry".
    return json({ error: "R2 is not configured" }, 503);
  }

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

  const parsed = parseListRequest(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  const identity = { userId: user.id, isAdmin: user.app_metadata?.role === "admin" };
  const authorized = authorizeList(parsed.value, identity);
  if (!authorized.allowed) return json({ error: authorized.reason }, 403);

  const keyPrefix = r2ObjectKey(parsed.value.bucket, `${parsed.value.prefix}/`);
  const keys = await listObjects(config, keyPrefix);

  // Bucket-relative storage paths, matching what the Supabase listing yields —
  // the client merges the two sets without caring which store answered.
  const paths = keys.map((key) => key.slice(`${parsed.value.bucket}/`.length));
  return json({ paths }, 200);
}));
