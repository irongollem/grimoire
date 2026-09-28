/**
 * Shared Resend client. Extracted from send-notification-email, which used to
 * be the only sender, so request-parental-consent (#919) doesn't grow a
 * second copy of the same fetch call — see that function's header for why a
 * parent-consent email exists at all.
 *
 * `RESEND_API_KEY` is a function secret that may not exist yet (a fresh
 * deploy, a dev stack). Every caller checks `resendApiKey()` itself and
 * no-ops with `{ configured: false }` rather than this module throwing, so a
 * function can ship before the Resend account does — same precedent as
 * poll-meshy-jobs' 503-until-configured.
 */

export const DEFAULT_FROM_EMAIL = "Grimoire <notifications@dungeongrimoire.com>";

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

export interface EmailAttachment {
  filename: string;
  /** base64-encoded body — Resend's own attachment shape. */
  content: string;
  content_type: string;
}

export interface OutgoingEmail {
  to: string;
  content: EmailContent;
  attachments?: EmailAttachment[];
  replyTo?: string;
}

/** The RESEND_API_KEY function secret, or null when it isn't set. */
export function resendApiKey(): string | null {
  const key = Deno.env.get("RESEND_API_KEY");
  return key ? key : null;
}

/** `NOTIFY_FROM_EMAIL` override, or the shared default sender identity. */
export function resendFrom(): string {
  return Deno.env.get("NOTIFY_FROM_EMAIL") || DEFAULT_FROM_EMAIL;
}

/**
 * Send one email via Resend. Never throws — a single recipient's failure
 * (bad address, provider hiccup) shouldn't take down a batch send or an
 * otherwise-successful request; callers get a boolean and decide what a
 * failure means for them (send-notification-email counts successes,
 * request-parental-consent treats it as fatal and rolls back its insert).
 */
export async function sendEmail(apiKey: string, mail: OutgoingEmail): Promise<boolean> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: resendFrom(),
      to: [mail.to],
      subject: mail.content.subject,
      html: mail.content.html,
      text: mail.content.text,
      ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
      ...(mail.attachments?.length ? { attachments: mail.attachments } : {}),
    }),
  });
  if (res.ok) return true;
  console.error(`resend: ${res.status} sending one email:`, await res.text());
  return false;
}
