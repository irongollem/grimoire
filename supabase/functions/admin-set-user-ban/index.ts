import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/requireAdmin.ts";

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

  const gate = await requireAdmin(req, cors);
  if (gate instanceof Response) return gate;
  const caller = gate;

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
  if (userId === caller.id && banned) return json({ error: "cannot_ban_self" }, 400);

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
