// Pro-waitlist unsubscribe (#638). Art. 7(3) says withdrawing consent must be
// as easy as giving it, and any mail actually sent to this list needs a working
// unsubscribe under the Telecommunicatiewet. The contract is in the migration
// 20260811221206_waitlist_withdrawal.sql and context/compliance/retention.md.
//
// Public by necessity: the recipient is a logged-out visitor who left an email
// address and has no account. JWT verification is off at the gateway via
// `[functions.waitlist-unsubscribe] verify_jwt = false` in supabase/config.toml
// (per-function config.toml files inside the function directory are NOT read by
// `supabase functions deploy`). The capability is the random per-row token in
// the URL — the same design as ical-feed, and the reason the token is a uuid.
//
// WHY GET DOES NOT REMOVE ANYTHING. Corporate mail gateways and link scanners
// prefetch every URL in a message. A GET that acted would let a scanner silently
// take someone off the list, and the only thing this list ever sends is the one
// email they asked for — so the failure is invisible and costs them exactly the
// thing they consented to. So GET renders a confirmation page whose only content
// is a POST form (no JavaScript: the page must work in a webmail preview or a
// hardened browser), and POST does the work.
//
// That is not a worse "one click" than the alternative — it is the RFC 8058
// shape. Mail clients that support List-Unsubscribe-Post POST here directly, so
// Gmail's and Apple Mail's built-in Unsubscribe button is genuinely one click
// and never touches the confirmation page. The mailing must send BOTH headers:
//
//   List-Unsubscribe: <https://dungeongrimoire.com/unsubscribe?token=UUID>
//   List-Unsubscribe-Post: List-Unsubscribe=One-Click
//
// and the same URL as a visible link in the body, for clients that have neither.
import { withErrorReporting } from "../_shared/observability/report.ts";
import { createClient } from "@supabase/supabase-js";
import { parseToken, renderPage, type UnsubscribeState } from "./page.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function page(state: UnsubscribeState, token: string | null): Response {
  const { html, status } = renderPage(state, token);
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Nothing here is cacheable: the confirm page is a capability URL and the
      // result pages describe a state that has just changed.
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

Deno.serve(withErrorReporting(async (req: Request) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, POST" } });
  }

  const token = parseToken(req.url);
  if (!token) return page("invalid", null);

  // GET is the confirmation page. See the prefetch note above.
  if (req.method === "GET") return page("confirm", token);

  const { data, error } = await admin.rpc("withdraw_waitlist_consent", { p_token: token });
  if (error) {
    // The token is the address's only identifier here and logging it would put
    // a live unsubscribe capability into the function logs, so only the failure
    // is recorded.
    console.error("waitlist-unsubscribe: withdraw_waitlist_consent failed", error);
    return page("error", token);
  }

  return page(data === true ? "removed" : "not_found", token);
}));
