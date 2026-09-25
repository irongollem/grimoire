// The one-click RSVP page, served from the app's own origin (see rsvp.ts).
//
// Kept apart from the handler so vitest can cover it: Vercel deploys every
// file under api/ as a function except those starting with an underscore,
// which is why this module and its test carry one.
//
// The page itself is rendered by the `session-rsvp` Edge Function (see
// supabase/functions/session-rsvp). It cannot be linked to directly: on the
// hosted `*.supabase.co` domain the gateway rewrites a GET response's
// `text/html` to `text/plain` and drops its charset — an anti-phishing
// measure, so nobody can host a page on Supabase's domain. Players opening the
// "I'm in" / "Can't make it" link got the page's source as text (with the em
// dash mangled to "â€”") and no form to press, so no answer was ever recorded.
//
// So the mail links here instead, and this function relays the request to the
// Edge Function and hands back the same bytes with the content type restored.
// It holds no key and no logic of its own: the token in the query string is
// the whole capability, exactly as it is on the Edge Function, and the confirm
// page's form posts back to this same URL (its action is a bare `?token=…`).
//
// Vercel serves `/api/*` as functions ahead of the SPA rewrite in vercel.json,
// and the service worker leaves `/api/` navigations to the network.

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const FALLBACK_HTML = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>Something went wrong — Grimoire</title></head>
<body style="font-family: Georgia, serif; text-align: center; padding: 3rem 1.5rem; background: #f5e6c8; color: #1a2740;">
<h1>Something went wrong</h1>
<p>We couldn't reach Grimoire just now. Please try the link again in a moment.</p>
</body>
</html>`;

function html(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Mirrors the Edge Function: the confirm page is a capability URL and the
      // result pages describe a state that has just changed.
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function relayRsvp(req: Request, supabaseUrl: string | undefined, fetchImpl: Fetch = fetch): Promise<Response> {
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, POST" } });
  }
  if (!supabaseUrl) {
    console.error("api/rsvp: SUPABASE_URL is not configured");
    return html(FALLBACK_HTML, 500);
  }

  const target = `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/session-rsvp${new URL(req.url).search}`;
  // The Edge Function redirects any GET without this header back here — that is
  // how links in invitations mailed before the relay existed still work.
  const headers: Record<string, string> = { "X-Grimoire-Rsvp-Relay": "1" };
  const init: RequestInit = { method: req.method, redirect: "manual", headers };
  if (req.method === "POST") {
    init.body = await req.text();
    headers["Content-Type"] = req.headers.get("Content-Type") ?? "application/x-www-form-urlencoded";
  }

  try {
    const upstream = await fetchImpl(target, init);
    return html(await upstream.text(), upstream.status);
  } catch (error) {
    // The URL carries a live token, so only the failure is logged.
    console.error("api/rsvp: session-rsvp unreachable", error);
    return html(FALLBACK_HTML, 502);
  }
}
