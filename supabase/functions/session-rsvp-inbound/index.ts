// "Accepted in the mail app" → "available in Grimoire".
//
// When a DM suggests a date, each player is mailed a METHOD:REQUEST invitation
// (send-notification-email + _shared/ics.ts). Their mail app draws Accept /
// Maybe / Decline on it, and pressing one sends a METHOD:REPLY back to the
// invitation's ORGANIZER address by ordinary email. This function is the far
// end of that: an inbound-email provider delivers the reply here as a webhook,
// and the answer lands on session_availability exactly as if the player had
// opened Grimoire and pressed the button.
//
// HOW THE REPLY IDENTIFIES ITSELF. Not by its From header, which is trivially
// forgeable and which corporate relays rewrite anyway. The invitation's
// ORGANIZER is `rsvp+<token>@<RSVP_INBOUND_DOMAIN>`, a per-invitation capability
// (session_proposal_invites), and every mail client copies ORGANIZER verbatim
// into the reply. So the reply carries the token that says whose answer it is,
// and the address it was delivered to is only a fallback for a client that
// dropped the property.
//
// AUTHENTICATION. A shared secret, in the X-Grimoire-Inbound-Secret header or
// a ?secret= query parameter — whichever the provider can set. Until
// INBOUND_EMAIL_SECRET is configured the function refuses everything with 503
// rather than accepting unauthenticated mail (the poll-meshy-jobs precedent,
// inverted: an unconfigured *writer* must fail closed). JWT verification is off
// at the gateway via `[functions.session-rsvp-inbound] verify_jwt = false` in
// supabase/config.toml, because a mail provider has no Supabase session.
//
// WIRING IT UP. Point an inbound route for `rsvp+*@<domain>` at this URL with
// the secret attached. Nothing breaks while that does not exist: without
// RSVP_INBOUND_DOMAIN the mailer omits the invitation entirely and the one-click
// links in the same message (session-rsvp) carry the whole feature.
import { withErrorReporting } from "../_shared/observability/report.ts";
import { createClient } from "@supabase/supabase-js";
import { availabilityFromPartstat, parseIcsReply, tokenFromAddress } from "../_shared/ics.ts";
import { extractCalendar, secretMatches } from "./extract.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/**
 * A reply we understood but cannot act on is a 200, not an error: the provider
 * would otherwise redeliver it on a schedule forever. The body says what
 * happened so the reason is visible in the provider's own log.
 */
function ignored(reason: string): Response {
  return json({ recorded: false, reason });
}

Deno.serve(withErrorReporting(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
  }

  const expected = (Deno.env.get("INBOUND_EMAIL_SECRET") ?? "").trim();
  if (!expected) return json({ error: "Inbound email is not configured" }, 503);

  const url = new URL(req.url);
  const provided = req.headers.get("X-Grimoire-Inbound-Secret") ?? url.searchParams.get("secret");
  if (!secretMatches(expected, provided)) return new Response("Unauthorized", { status: 401 });

  const raw = await req.text();
  const calendar = extractCalendar(req.headers.get("Content-Type") ?? "", raw);
  if (!calendar) return ignored("no_calendar_part");

  const reply = parseIcsReply(calendar);
  // The delivered-to address is the fallback: a client that dropped ORGANIZER
  // still sent the mail *to* the per-invitation mailbox, which carries the same
  // token in its local part.
  const token = reply.token ?? tokenFromAddress(url.searchParams.get("to"));
  if (!token) return ignored("no_token");

  const available = availabilityFromPartstat(reply.partstat);
  if (available === null) {
    // A "Maybe" reaches here and is deliberately dropped — Grimoire's
    // availability is a boolean, and recording a maybe as a yes would tell the
    // DM the player is coming. See availabilityFromPartstat.
    return ignored(reply.partstat ? `unrecordable_partstat_${reply.partstat}` : "no_partstat");
  }

  const { data, error } = await admin.rpc("record_session_rsvp", {
    p_token: token,
    p_available: available,
  });
  if (error) {
    // The token is a live capability; it never goes into the logs.
    console.error("session-rsvp-inbound: record_session_rsvp failed", error);
    return json({ error: "Could not record the reply" }, 500);
  }
  if (!data) return ignored("unknown_token");

  const result = data as { recorded?: boolean; reason?: string };
  if (result.recorded === false) return ignored(result.reason ?? "not_recorded");
  return json({ recorded: true, available });
}));
