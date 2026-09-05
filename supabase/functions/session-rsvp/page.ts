// The pure half of session-rsvp: request parsing and page HTML. No Deno or
// https imports, so vitest covers it from the Node suite (vitest.config.ts
// includes supabase/functions/**/*.test.ts for exactly this).
//
// The page this renders is the fallback route for answering a suggested date:
// the primary one is the Accept / Decline buttons the recipient's mail app
// draws on the invitation itself (see _shared/ics.ts and session-rsvp-inbound).
// Plenty of clients render no invitation UI at all — most webmail on a phone,
// every plain-text reader — so the same message also carries two links here.

/** Result states the endpoint can land in. One page renderer per state. */
export type RsvpState =
  /** GET with a well-formed token: nothing has happened yet, ask first. */
  | "confirm"
  /** POST, the answer is stored. */
  | "recorded"
  /** POST on a date the DM has since called off. */
  | "cancelled"
  /** The token names no invitation — re-issued, or the proposal was deleted. */
  | "not_found"
  /** No token, no answer, or one that is not a uuid / yes / no. */
  | "invalid"
  /** The write itself failed. */
  | "error";

export type RsvpAnswer = "yes" | "no";

const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What the RPCs hand back about the session being answered for. */
export interface RsvpInvite {
  campaign_name?: string | null;
  title?: string | null;
  proposed_date?: string | null;
  proposed_time?: string | null;
  status?: string | null;
  is_past?: boolean | null;
}

export interface RsvpRequest {
  token: string | null;
  answer: RsvpAnswer | null;
}

/**
 * Token and answer both travel in the query string, so one URL is the whole
 * capability and a mail client that mangles nothing but line breaks still
 * produces a working link. A POST body may override the answer — that is the
 * confirmation form posting back what the person actually clicked.
 */
export function parseRequest(requestUrl: string, formAnswer?: string | null): RsvpRequest {
  let params: URLSearchParams;
  try {
    params = new URL(requestUrl).searchParams;
  } catch {
    return { token: null, answer: null };
  }
  const token = params.get("token");
  const raw = (formAnswer ?? params.get("answer") ?? "").trim().toLowerCase();
  return {
    token: token && TOKEN_RE.test(token) ? token.toLowerCase() : null,
    answer: raw === "yes" || raw === "no" ? raw : null,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * "2026-09-03" + "19:30" → "Thursday, September 3, 2026 at 19:30". Formatted in
 * UTC on purpose, matching send-notification-email/emails.ts: the value is a
 * wall-clock campaign date with no zone, and local parsing would shift it by a
 * day for half the world.
 */
export function formatWhen(date?: string | null, time?: string | null): string {
  if (!date) return "";
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  const label = d.toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
  });
  return time ? `${label} at ${time.slice(0, 5)}` : label;
}

function sessionLine(invite: RsvpInvite | null): string {
  if (!invite) return "";
  const when = formatWhen(invite.proposed_date, invite.proposed_time);
  const parts = [invite.title, when].filter(Boolean) as string[];
  if (!parts.length) return "";
  const campaign = invite.campaign_name ? `${invite.campaign_name} — ` : "";
  return `<p class="session"><strong>${escapeHtml(campaign + parts.join(" · "))}</strong></p>`;
}

interface Copy {
  status: number;
  title: string;
  body: string;
}

function copyFor(state: RsvpState, answer: RsvpAnswer | null, invite: RsvpInvite | null): Copy {
  const coming = answer === "yes";
  switch (state) {
    case "confirm":
      // A link with no answer on it is a real case, not a malformed one: mail
      // clients truncate long URLs, and people paste the base link. Ask the
      // open question rather than defaulting to one of the answers.
      if (answer === null) {
        return {
          status: 200,
          title: "Can you make this one?",
          body: "Pick an answer and your DM will see it straight away.",
        };
      }
      return {
        status: 200,
        title: coming ? "Count you in?" : "Can't make it?",
        body: coming
          ? "Confirm and your DM will see you as available for this date."
          : "Confirm and your DM will see that this date doesn't work for you.",
      };
    case "recorded":
      return {
        status: 200,
        title: coming ? "You're down as coming" : "Noted — you can't make it",
        body: invite?.is_past
          ? "Your answer is recorded, though this date has already passed."
          : coming
            ? "Your DM can see you're available. Change your mind? Open the link again and pick the other answer."
            : "Your DM can see this one doesn't work. Change your mind? Open the link again and pick the other answer.",
      };
    case "cancelled":
      return {
        status: 200,
        title: "That date is off",
        body:
          "Your DM has cancelled this date, so there is nothing left to answer. " +
          "Any replacement will arrive as its own invitation.",
      };
    case "not_found":
      return {
        status: 404,
        title: "That link has expired",
        body:
          "This link doesn't match a session date any more — most likely the date was " +
          "removed. Open Grimoire to see what your DM is proposing now.",
      };
    case "invalid":
      return {
        status: 400,
        title: "That link isn't valid",
        body:
          "The link looks incomplete — mail clients sometimes break long links across " +
          "lines. Copy the whole link from the email, or answer in Grimoire instead.",
      };
    case "error":
      return {
        status: 500,
        title: "Something went wrong",
        body:
          "We couldn't record your answer just now. Please try the link again in a " +
          "moment, or answer in Grimoire instead.",
      };
  }
}

/**
 * A whole page in one string: served straight from an Edge Function, with no
 * asset pipeline behind it and no second origin for a page whose entire job is
 * to be trustworthy. Colours mirror waitlist-unsubscribe, which mirrors the
 * marketing site's tokens.
 *
 * The confirm state is a form with two buttons rather than a link that acts,
 * for the reason spelled out in waitlist-unsubscribe: corporate mail gateways
 * and link scanners prefetch every URL in a message, and a GET that recorded an
 * answer would let a scanner RSVP in the player's name — silently, and wrongly
 * half the time. No JavaScript, so it works in a webmail preview pane.
 */
export function renderPage(
  state: RsvpState,
  request: RsvpRequest,
  invite: RsvpInvite | null = null,
): { html: string; status: number } {
  const copy = copyFor(state, request.answer, invite);
  const action = request.token ? `?token=${encodeURIComponent(request.token)}` : "";
  const form = state === "confirm"
    ? `<form method="post" action="${escapeHtml(action)}">
        <button type="submit" name="answer" value="yes"${request.answer === "no" ? ' class="secondary"' : ""}>I'm in</button>
        <button type="submit" name="answer" value="no"${request.answer === "yes" ? ' class="secondary"' : ""}>Can't make it</button>
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
  p.session { color: #1a2740; }
  form { display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap; margin-bottom: 1rem; }
  button {
    padding: 0.75rem 1.5rem;
    font: inherit; font-weight: 600; cursor: pointer;
    color: #1a2740; background: #f0c74a;
    border: 1px solid #c9920a; border-radius: 0.75rem;
  }
  button.secondary { background: #fffaf0; color: #6a6049; border-color: #d4b896; }
  button:focus-visible { outline: 2px solid #c9920a; outline-offset: 2px; }
  a { color: #9a6b07; }
</style>
</head>
<body>
  <main>
    <h1>${escapeHtml(copy.title)}</h1>
    ${sessionLine(invite)}
    <p>${escapeHtml(copy.body)}</p>
    ${form}
    <p><a href="https://app.dungeongrimoire.com/play/settings">Open Grimoire</a></p>
  </main>
</body>
</html>`;

  return { html, status: copy.status };
}
