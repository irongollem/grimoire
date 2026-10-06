// Print a laid-out book to PDF through Cloudflare Browser Run (#565, epic #915).
//
// The browser lays the book out with Paged.js and sends one self-contained HTML
// document (CSS inline, fonts as data: URIs, pictures as data: URIs or CDN URLs).
// This function hands it to Cloudflare's REST /pdf Quick Action and returns the
// PDF bytes. The HTML is opaque here: it is rendered by Cloudflare's sandboxed
// browser, never parsed, stored or logged by us.
//
// Authorization comes from the verified JWT only; the body carries no user id.
// Each export costs Cloudflare browser time, hence the per-user `pdf_render`
// rate limit (a stolen session cannot loop it).
//
// Needs two secrets, set by the maintainer:
//   supabase secrets set CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_BROWSER_RUN_TOKEN=...
// The token needs the "Browser Rendering - Edit" permission. Without them the
// function answers 503 rather than failing obscurely.

import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { withCors } from "../_shared/cors.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import {
  buildCloudflarePdfRequest,
  mapCloudflareResponse,
  parsePdfRequest,
} from "../_shared/pdfRender.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

serve(withCors(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const accountId = Deno.env.get("CLOUDFLARE_ACCOUNT_ID")?.trim();
  const token = Deno.env.get("CLOUDFLARE_BROWSER_RUN_TOKEN")?.trim();
  if (!accountId || !token) {
    // 503, not 500: this is a missing setup step, not a fault a retry could fix.
    return json({ error: "PDF export is not set up on this server yet." }, 503);
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
    return json({ error: "The PDF request was not understood." }, 400);
  }
  const parsed = parsePdfRequest(body);
  if (!parsed.ok) return json({ error: parsed.error }, parsed.status);

  // After validation, so a malformed request never spends an export.
  const allowed = await checkRateLimit(admin, user.id, "pdf_render");
  if (!allowed) {
    return json({ error: "You have exported a lot of PDFs in the last hour. Please try again later." }, 429);
  }

  const cf = buildCloudflarePdfRequest(accountId, token, parsed.value.html);
  let response: Response;
  try {
    response = await fetch(cf.url, cf.init);
  } catch (err) {
    console.error("render-pdf: Cloudflare unreachable:", err instanceof Error ? err.message : "unknown");
    return json({ error: "The PDF could not be made. Please try again." }, 502);
  }

  if (response.ok) {
    return new Response(await response.arrayBuffer(), {
      status: 200,
      headers: { "Content-Type": "application/pdf" },
    });
  }

  const outcome = mapCloudflareResponse(response.status, await response.text());
  if (outcome.kind === "error") {
    if (outcome.logDetail) console.error(`render-pdf: Cloudflare ${outcome.logDetail}`);
    return json({ error: outcome.error }, outcome.status);
  }
  // A non-ok response can never map to "pdf"; fail closed if that ever changes.
  return json({ error: "The PDF could not be made. Please try again." }, 502);
}));
