// Issue presigned PUT URLs for R2-backed storage buckets (#577 stage 2).
//
// R2 has no RLS. This function *is* the authorization that `storage.objects`
// policies provide for Supabase-hosted objects: it re-derives the caller from
// their verified JWT, checks the prefix/MIME/size rules in _shared/storage-policy.ts,
// and only then signs a URL scoped to exactly one key, one content type and one
// byte length. Nothing about the request body is trusted — in particular there is
// no caller-supplied user id, because that is the shape of bug the `grab_item_drop`
// fix (migration 20260629000002) exists to prevent.
//
// The signed URL is a bearer credential. It is returned once, over TLS, to the
// caller that was just authorized, and is never logged.

import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { withCors } from "../_shared/cors.ts";
import { r2ConfigFrom, r2ObjectKey } from "../_shared/r2/config.ts";
import { presignPut } from "../_shared/r2/client.ts";
import {
  parseSignUploadRequest,
  authorizeUploads,
  UPLOAD_URL_TTL_SECONDS,
} from "../_shared/r2/api.ts";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

serve(withCors(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const config = r2ConfigFrom((key) => Deno.env.get(key));
  if (!config) {
    // 503, not 500: the client's documented fallback on this is to upload through
    // Supabase Storage as before, which is the correct behaviour while R2 is not
    // yet provisioned. A 500 would read as "retry the same thing".
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

  const parsed = parseSignUploadRequest(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  // `app_metadata` is server-controlled and signed into the JWT — the client
  // cannot set it, which is what makes this equivalent to `is_app_admin()`.
  const identity = { userId: user.id, isAdmin: user.app_metadata?.role === "admin" };

  const authorized = authorizeUploads(parsed.value, identity);
  if (!authorized.allowed) return json({ error: authorized.reason }, 403);

  const uploads = await Promise.all(
    parsed.value.objects.map(async (object) => ({
      path: object.path,
      url: await presignPut(config, {
        key: r2ObjectKey(parsed.value.bucket, object.path),
        contentType: object.contentType,
        size: object.size,
        expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
      }),
      // Echoed back because they are *signed*: a PUT that omits or alters either
      // header fails R2's signature check. The client must send exactly these.
      headers: {
        "Content-Type": object.contentType,
        "Content-Length": String(object.size),
      },
    })),
  );

  return json({ uploads }, 200);
}));
