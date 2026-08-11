// The pure half of waitlist-unsubscribe (#638): token parsing and page HTML.
// Kept free of Deno/https imports so vitest can cover it from the Node suite —
// see vitest.config.ts, which includes supabase/functions/**/*.test.ts for
// exactly this reason.

/** Result states the endpoint can land in. One page renderer per state. */
export type UnsubscribeState =
  /** GET with a well-formed token: nothing has happened yet, ask first. */
  | "confirm"
  /** POST, a row matched and is gone. */
  | "removed"
  /** POST, no row matched — already off the list, or a mangled link. */
  | "not_found"
  /** No token, or one that is not a uuid. */
  | "invalid"
  /** The delete itself failed. */
  | "error";

/**
 * Tokens are v4 uuids (pro_waitlist.unsubscribe_token). Validating the shape
 * here means a malformed value never reaches Postgres as a failed cast, so a
 * typo gets the "this link isn't valid" page instead of a 500.
 */
const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The token travels in the query string rather than the path because the
 * List-Unsubscribe header's URL is posted to verbatim by mail clients, and a
 * query string survives the Vercel rewrite that fronts this on the apex domain.
 */
export function parseToken(requestUrl: string): string | null {
  let token: string | null;
  try {
    token = new URL(requestUrl).searchParams.get("token");
  } catch {
    return null;
  }
  if (!token || !TOKEN_RE.test(token)) return null;
  return token.toLowerCase();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface Copy {
  status: number;
  title: string;
  body: string;
  /** Only the confirm page carries the form; the rest are terminal. */
  form: boolean;
}

const COPY: Record<UnsubscribeState, Copy> = {
  confirm: {
    status: 200,
    title: "Leave the Pro waitlist?",
    body:
      "Confirm and we delete your address from the waitlist straight away. " +
      "You can always join again from the site.",
    form: true,
  },
  removed: {
    status: 200,
    title: "You're off the list",
    body:
      "Your address has been deleted. We won't email you about the Pro launch, " +
      "and there is nothing left to unsubscribe from.",
    form: false,
  },
  not_found: {
    status: 200,
    title: "You're not on the list",
    body:
      "That link doesn't match an address on the waitlist — most likely it has " +
      "already been used, or the address was removed some other way. Either way, " +
      "there is nothing to unsubscribe from.",
    form: false,
  },
  invalid: {
    status: 400,
    title: "That link isn't valid",
    body:
      "The unsubscribe link looks incomplete — mail clients sometimes break long " +
      "links across lines. Copy the whole link from the email, or write to " +
      "info@dungeongrimoire.com and we'll remove you by hand.",
    form: false,
  },
  error: {
    status: 500,
    title: "Something went wrong",
    body:
      "We couldn't complete the removal just now. Please try the link again in a " +
      "moment, or write to info@dungeongrimoire.com and we'll remove you by hand.",
    form: false,
  },
};

/**
 * A whole page in one string: this is served from an Edge Function, so there is
 * no asset pipeline behind it and an external stylesheet would be a second
 * origin for a page whose entire job is to be trustworthy. Colours mirror the
 * marketing site's tokens (global.css) so the page doesn't look like a
 * different company's.
 */
export function renderPage(state: UnsubscribeState, token: string | null): { html: string; status: number } {
  const copy = COPY[state];
  const action = token ? `?token=${encodeURIComponent(token)}` : "";
  const form = copy.form
    ? `<form method="post" action="${escapeHtml(action)}">
        <button type="submit">Yes, remove my address</button>
      </form>`
    : "";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(copy.title)} — Grimoire</title>
<style>
  :root { color-scheme: light; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    padding: 1.5rem;
    background: #f5e6c8; color: #1a2740;
    font-family: Georgia, "Times New Roman", serif;
    line-height: 1.6;
  }
  main {
    max-width: 32rem; width: 100%; text-align: center;
    background: #fffaf0; border: 1px solid #d4b896; border-radius: 0.75rem;
    padding: 2.5rem 1.75rem;
  }
  h1 { margin: 0 0 1rem; font-size: 1.5rem; letter-spacing: 0.01em; }
  p { margin: 0 0 1rem; color: #6a6049; }
  p:last-child { margin-bottom: 0; }
  button {
    margin-top: 0.5rem; padding: 0.75rem 1.5rem;
    font: inherit; font-weight: 600; cursor: pointer;
    color: #1a2740; background: #f0c74a;
    border: 1px solid #c9920a; border-radius: 0.75rem;
  }
  button:focus-visible { outline: 2px solid #c9920a; outline-offset: 2px; }
  a { color: #9a6b07; }
</style>
</head>
<body>
  <main>
    <h1>${escapeHtml(copy.title)}</h1>
    <p>${escapeHtml(copy.body)}</p>
    ${form}
    <p><a href="https://dungeongrimoire.com/">Back to dungeongrimoire.com</a></p>
  </main>
</body>
</html>`;

  return { html, status: copy.status };
}
