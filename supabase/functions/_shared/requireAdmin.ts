import { createClient, type User } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Verify the caller is an app admin from their signed JWT (`app_metadata.role`,
 * server-controlled). Returns the authenticated admin `User`, or a ready-to-
 * return error `Response` (401/403). Shared by every admin-only edge function so
 * the gate is defined once.
 *
 *   const gate = await requireAdmin(req, cors);
 *   if (gate instanceof Response) return gate;
 *   const user = gate; // authenticated admin
 */
export async function requireAdmin(
  req: Request,
  cors: Record<string, string>,
): Promise<User | Response> {
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

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
