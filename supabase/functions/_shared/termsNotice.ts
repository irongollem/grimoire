/**
 * The Terms of Service notice (send-terms-notice): who gets it, and what it
 * says. Pure, no Deno imports, so vitest covers it directly.
 *
 * Every word is fixed apart from the version-specific change list, which comes
 * from `TERMS_CHANGES` in consent.ts, and everything is HTML-escaped.
 */
import { isChildLoginEmail } from "./childAccount.ts";
import { escapeHtml } from "./emailHtml.ts";

const APP_ORIGIN = "https://app.dungeongrimoire.com";
const TERMS_URL = "https://dungeongrimoire.com/terms";
const PRIVACY_URL = "https://dungeongrimoire.com/privacy";

export interface NoticeCandidate {
  id: string;
  email: string | null | undefined;
  /** ISO timestamp from GoTrue, or null/undefined when never banned. */
  banned_until?: string | null;
}

export interface NoticeSelection<T extends NoticeCandidate> {
  /** Users to mail, each with a usable email. */
  recipients: Array<T & { email: string }>;
  alreadyAccepted: number;
  alreadyNotified: number;
}

/**
 * Pick who to mail. Skipped without being counted: no email, a generated child
 * login address (young players are never mailed), and a banned account.
 * Counted: accepted this version already, and notified already (idempotency).
 */
export function selectTermsNoticeRecipients<T extends NoticeCandidate>(
  users: readonly T[],
  acceptedByUser: ReadonlyMap<string, string | null>,
  notifiedUserIds: ReadonlySet<string>,
  version: string,
  now: Date = new Date(),
): NoticeSelection<T> {
  const recipients: Array<T & { email: string }> = [];
  let alreadyAccepted = 0;
  let alreadyNotified = 0;

  for (const user of users) {
    const email = user.email;
    if (!email || isChildLoginEmail(email)) continue;
    if (user.banned_until && new Date(user.banned_until).getTime() > now.getTime()) continue;
    if (acceptedByUser.get(user.id) === version) {
      alreadyAccepted++;
      continue;
    }
    if (notifiedUserIds.has(user.id)) {
      alreadyNotified++;
      continue;
    }
    recipients.push({ ...user, email });
  }

  return { recipients, alreadyAccepted, alreadyNotified };
}

export interface TermsNoticeEmail {
  subject: string;
  html: string;
  text: string;
}

const SUBJECT = "Our Terms of Service have changed";
const INTRO = "We have updated the Grimoire Terms of Service and Privacy Policy.";
const CHANGES_LEAD = "What's new:";
const NEXT_STEP = "Next time you open Grimoire you'll be asked to accept them.";
const FOOTER =
  "You are receiving this because you have a Grimoire account. It is a notice about your agreement with Grimoire, so it cannot be switched off.";

export function termsNoticeEmail(args: { version: string; changes: readonly string[] }): TermsNoticeEmail {
  const { version, changes } = args;
  const listHtml = changes.length
    ? `<p style="font-size: 1rem; line-height: 1.6; margin: 1rem 0 0.25rem;">${escapeHtml(CHANGES_LEAD)}</p>
  <ul style="font-size: 1rem; line-height: 1.6; margin: 0; padding-left: 1.25rem;">
    ${changes.map((c) => `<li>${escapeHtml(c)}</li>`).join("\n    ")}
  </ul>`
    : "";

  const html = `<div style="font-family: Georgia, 'Times New Roman', serif; max-width: 36rem; margin: 0 auto; padding: 1.5rem; color: #2a2118;">
  <p style="font-size: 0.8rem; letter-spacing: 0.08em; text-transform: uppercase; color: #8a7a5c; margin: 0 0 1rem;">Grimoire · Terms of Service, version ${escapeHtml(version)}</p>
  <p style="font-size: 1rem; line-height: 1.6;">${escapeHtml(INTRO)}</p>
  ${listHtml}
  <p style="font-size: 1rem; line-height: 1.6; margin: 1rem 0 0;">
    Read the <a href="${escapeHtml(TERMS_URL)}" style="color: #7a1f1f;">Terms of Service</a>
    and the <a href="${escapeHtml(PRIVACY_URL)}" style="color: #7a1f1f;">Privacy Policy</a>.
  </p>
  <p style="font-size: 1rem; line-height: 1.6;">${escapeHtml(NEXT_STEP)}</p>
  <p style="margin: 1.5rem 0;">
    <a href="${escapeHtml(APP_ORIGIN)}" style="display: inline-block; background: #7a1f1f; color: #f5efe0; text-decoration: none; padding: 0.6rem 1.2rem; border-radius: 0.25rem;">Open Grimoire</a>
  </p>
  <hr style="border: none; border-top: 1px solid #d9cdb4; margin: 1.5rem 0 0.75rem;" />
  <p style="font-size: 0.75rem; color: #8a7a5c; margin: 0;">${escapeHtml(FOOTER)}</p>
</div>`;

  const text = [
    INTRO,
    "",
    ...(changes.length ? [CHANGES_LEAD, ...changes.map((c) => `- ${c}`), ""] : []),
    `Terms of Service: ${TERMS_URL}`,
    `Privacy Policy: ${PRIVACY_URL}`,
    "",
    NEXT_STEP,
    APP_ORIGIN,
    "",
    FOOTER,
  ].join("\n");

  return { subject: SUBJECT, html, text };
}
