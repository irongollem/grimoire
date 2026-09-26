// One-click RSVP for a suggested session date (the link route).
//
// The mail a player gets when their DM suggests a date carries two ways to
// answer. The first is the invitation itself: a METHOD:REQUEST part their mail
// app turns into Accept / Decline, whose reply comes back through
// session-rsvp-inbound. This function is the second — two plain links, for the
// many clients that render no invitation UI, and for anyone reading the mail on
// a phone browser.
//
// The links do NOT point here. The hosted gateway rewrites a GET response's
// text/html to text/plain on *.supabase.co, so linked directly this page shows
// as source code. The mail links to the app's /api/rsvp, which relays to this
// function and serves the bytes as HTML (api/_rsvpRelay.ts at the repo root).
//
// Public by necessity, and JWT verification is off at the gateway via
// `[functions.session-rsvp] verify_jwt = false` in supabase/config.toml
// (per-function config.toml files inside the function directory are NOT read by
// `supabase functions deploy`). The capability is the random per-invitation
// token in the URL — the same shape as ical-feed's token: a random per-row
// value stands in for a login for a recipient who has none.
//
// WHY GET DOES NOT RECORD ANYTHING. Corporate mail gateways and link scanners
// prefetch every URL in a message. A GET that acted would let a scanner answer
// in the player's name, and unlike an unsubscribe it would be wrong half the
// time — a spurious "I'm in" is how a DM books an evening nobody attends. So
// GET renders a confirmation page whose only content is a POST form with the
// two answers on it (no JavaScript: it must work in a webmail preview pane),
// and POST does the work.
import { withErrorReporting } from "../_shared/observability/report.ts";
import { createClient } from "@supabase/supabase-js";
import { parseRequest, renderPage, type RsvpInvite, type RsvpState } from "./page.ts";

/** Set by api/_rsvpRelay.ts on every request it forwards. Not a credential — the token is. */
const RELAY_HEADER = "X-Grimoire-Rsvp-Relay";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function page(
  state: RsvpState,
  request: Parameters<typeof renderPage>[1],
  invite: RsvpInvite | null = null,
): Response {
  const { html, status } = renderPage(state, request, invite);
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

/** The answer the person actually clicked, from either form encoding. */
async function answerFromBody(req: Request): Promise<string | null> {
  const type = req.headers.get("Content-Type") ?? "";
  try {
    if (type.includes("application/x-www-form-urlencoded") || type.includes("multipart/form-data")) {
      const form = await req.formData();
      const value = form.get("answer");
      return typeof value === "string" ? value : null;
    }
  } catch {
    // A body we can't read is not an answer; the query string may still hold one.
  }
  return null;
}

Deno.serve(withErrorReporting(async (req: Request) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, POST" } });
  }

  // A link straight to this function — every invitation mailed before the
  // links moved to the app's origin — would render as source text. Bounce it to
  // the relay; the relay marks its own requests so this cannot loop.
  if (req.method === "GET" && !req.headers.has(RELAY_HEADER)) {
    const app = (Deno.env.get("APP_URL") ?? "https://app.dungeongrimoire.com").replace(/\/+$/, "");
    return new Response(null, {
      status: 302,
      headers: { Location: `${app}/api/rsvp${new URL(req.url).search}`, "Cache-Control": "no-store" },
    });
  }

  const formAnswer = req.method === "POST" ? await answerFromBody(req) : null;
  const request = parseRequest(req.url, formAnswer);
  if (!request.token) return page("invalid", request);

  // Describe the session on every page, including the confirmation, so nobody
  // is asked to commit to an evening the page won't name.
  const { data: invite, error: readErr } = await admin.rpc("get_session_rsvp_invite", {
    p_token: request.token,
  });
  if (readErr) {
    // The token is a live capability; logging it would put a working RSVP link
    // into the function logs, so only the failure is recorded.
    console.error("session-rsvp: get_session_rsvp_invite failed", readErr);
    return page("error", request);
  }
  if (!invite) return page("not_found", request);

  const described = invite as RsvpInvite;
  if (described.status === "cancelled") return page("cancelled", request, described);

  if (req.method === "GET" || !request.answer) return page("confirm", request, described);

  const { data: result, error: writeErr } = await admin.rpc("record_session_rsvp", {
    p_token: request.token,
    p_available: request.answer === "yes",
  });
  if (writeErr) {
    console.error("session-rsvp: record_session_rsvp failed", writeErr);
    return page("error", request);
  }

  const recorded = result as (RsvpInvite & { recorded?: boolean; reason?: string }) | null;
  if (!recorded) return page("not_found", request);
  if (recorded.recorded === false) {
    return page(recorded.reason === "cancelled" ? "cancelled" : "error", request, recorded);
  }
  return page("recorded", request, recorded);
}));
