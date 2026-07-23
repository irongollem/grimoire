import { createClient, type User } from "@supabase/supabase-js";

// The gateway (verify_jwt, on by default) has already verified the bearer's
// signature before the handler runs, so the payload's `role` claim can be
// trusted without re-verification. Comparing the raw bearer to the injected
// SUPABASE_SERVICE_ROLE_KEY env var is NOT reliable here: projects carrying
// both legacy-JWT and new-format API keys can have a valid service-role JWT
// that string-differs from the injected key.
//
// Where cheap, we do better than blind trust: if SUPABASE_JWT_SECRET (the
// project's legacy HS256 signing secret) is available in the function's env,
// verify the bearer's signature in-function via HMAC-SHA256 before trusting
// the decoded `role` claim. Projects on the newer asymmetric-key JWT format
// don't expose this secret the same way — for those (or if verification
// fails to even run, e.g. secret missing) we fall back to decode-only,
// relying on the gateway's verification per the paragraph above.
function base64UrlToUint8Array(input: string): Uint8Array {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function verifyHs256Signature(bearer: string, secret: string): Promise<boolean> {
  const [headerB64, payloadB64, signatureB64] = bearer.split(".");
  if (!headerB64 || !payloadB64 || !signatureB64) return false;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const signature = base64UrlToUint8Array(signatureB64);
    const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    return await crypto.subtle.verify("HMAC", key, signature as BufferSource, data as BufferSource);
  } catch {
    return false;
  }
}

/**
 * Decode (and, where possible, verify) the bearer JWT's `role` claim. Returns
 * the claim's value, or `null` if it's absent/unparseable/fails verification.
 */
async function verifiedJwtRole(bearer: string): Promise<string | null> {
  const payload = bearer.split(".")[1];
  if (!payload) return null;
  let json: { role?: unknown };
  try {
    json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
  const role = typeof json.role === "string" ? json.role : null;
  if (!role) return null;

  const jwtSecret = Deno.env.get("SUPABASE_JWT_SECRET");
  if (jwtSecret) {
    const verified = await verifyHs256Signature(bearer, jwtSecret);
    if (!verified) return null;
  }
  return role;
}

export interface RequireAdminOptions {
  /** Also accept a verified `service_role` bearer (e.g. cron callers), returning "service_role". */
  allowServiceRole?: boolean;
}

/**
 * Verify the caller is an app admin from their signed JWT (`app_metadata.role`,
 * server-controlled). Returns the authenticated admin `User`, or a ready-to-
 * return error `Response` (401/403). Shared by every admin-only edge function so
 * the gate is defined once. CORS headers are applied uniformly by the
 * `withCors` wrapper, not here.
 *
 *   const gate = await requireAdmin(req);
 *   if (gate instanceof Response) return gate;
 *   const user = gate; // authenticated admin
 *
 * With `{ allowServiceRole: true }`, a verified `service_role` bearer (e.g. the
 * trusted cron caller) is also accepted and short-circuits to the sentinel
 * string `"service_role"` instead of a `User`:
 *
 *   const gate = await requireAdmin(req, { allowServiceRole: true });
 *   if (gate instanceof Response) return gate;
 *   if (gate === "service_role") { ... } else { const user = gate; }
 */
// Overloads keep the three pre-existing 1-arg callers typed exactly as before
// (`User | Response`, no `"service_role"` in the union) — only opting in via
// `{ allowServiceRole: true }` widens the return type.
export function requireAdmin(
  req: Request,
): Promise<User | Response>;
export function requireAdmin(
  req: Request,
  options: { allowServiceRole: true },
): Promise<User | "service_role" | Response>;
export function requireAdmin(
  req: Request,
  options?: RequireAdminOptions,
): Promise<User | Response>;
export async function requireAdmin(
  req: Request,
  options?: RequireAdminOptions,
): Promise<User | "service_role" | Response> {
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  if (options?.allowServiceRole) {
    const bearer = authHeader.replace(/^Bearer\s+/i, "");
    if ((await verifiedJwtRole(bearer)) === "service_role") return "service_role";
  }

  const caller = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error } = await caller.auth.getUser();
  if (error || !user) return json({ error: "Unauthorized" }, 401);
  if (user.app_metadata?.role !== "admin") return json({ error: "Forbidden" }, 403);
  return user;
}
