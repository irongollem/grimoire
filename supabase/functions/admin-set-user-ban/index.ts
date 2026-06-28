import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// ~100 years — an indefinite hard lock-out. "none" lifts the ban.
const BAN_FOREVER = "876000h";

serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  // Verify caller is an admin from their signed JWT.
  const caller = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await caller.auth.getUser();
  if (authError || !user) return json({ error: "Unauthorized" }, 401);
  if (user.app_metadata?.role !== "admin") return json({ error: "Forbidden" }, 403);

  let userId: string;
  let banned: boolean;
  try {
    const body = await req.json();
    userId = body.userId;
    banned = !!body.banned;
    if (!userId) throw new Error("missing userId");
  } catch {
    return json({ error: "Invalid body — need { userId, banned }" }, 400);
  }

  // Don't let an admin lock themselves out.
  if (userId === user.id && banned) return json({ error: "cannot_ban_self" }, 400);

  // Hard lock-out via GoTrue ban — rejects sign-in and invalidates sessions.
  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: banned ? BAN_FOREVER : "none",
  });
  if (error) {
    console.error("admin-set-user-ban:", error);
    return json({ error: "ban_failed" }, 500);
  }

  return json({ ok: true, banned });
});
