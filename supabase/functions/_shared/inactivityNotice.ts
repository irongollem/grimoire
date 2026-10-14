/**
 * The inactivity notice (send-inactivity-notice): what it says. Pure, no Deno
 * imports, so vitest covers it directly. A service notice about the reader's
 * account, so there is no marketing in it; every dynamic string is HTML-escaped.
 */
import { escapeHtml } from "./emailHtml.ts";
import type { EmailContent } from "./resend.ts";

const APP_ORIGIN = "https://app.dungeongrimoire.com";
const PRIVACY_URL = "https://dungeongrimoire.com/privacy";

/** The notice's deletion date is the send date plus this many days. */
export const NOTICE_GRACE_DAYS = 30;

const SUBJECT = "Your Dungeon Grimoire account will be deleted unless you sign in";
const FOOTER =
  "You are receiving this because of the retention period in our privacy policy. It is a notice about your account, so it cannot be switched off.";

/** "13 November 2026", always English and UTC so the copy never depends on the server's locale. */
export function formatNoticeDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function formatMonthYear(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function inactivityNoticeEmail(args: {
  lastActiveAt: string;
  deleteAfter: string;
  forParent: boolean;
}): EmailContent {
  const { lastActiveAt, deleteAfter, forParent } = args;
  const lastSeen = formatMonthYear(lastActiveAt);
  const deadline = formatNoticeDate(deleteAfter);

  const paragraphs = forParent
    ? [
        `We have not seen the account you set up for your young player on Dungeon Grimoire since ${lastSeen}.`,
        `Under our privacy policy, an account that has not been used for 12 months is deleted. If nobody signs in to it before ${deadline}, the account and everything in it will be deleted.`,
        `To keep it, your young player just needs to sign in once before ${deadline}. Nothing else is needed.`,
        "If you would like to keep their work but not the account, export it first from the account settings.",
        "If you are happy for the account to go, you do not need to do anything.",
      ]
    : [
        `We have not seen you on Dungeon Grimoire since ${lastSeen}.`,
        `Under our privacy policy, an account that has not been used for 12 months is deleted. If you do not sign in before ${deadline}, your account and everything in it will be deleted.`,
        `To keep it, just sign in any time before ${deadline}. Nothing else is needed.`,
        "If you would like to keep your work but not the account, export it first from your account settings.",
        "If you are happy for the account to go, you do not need to do anything.",
      ];

  const pStyle = 'style="font-size: 1rem; line-height: 1.6;"';
  const html = `<div style="font-family: Georgia, 'Times New Roman', serif; max-width: 36rem; margin: 0 auto; padding: 1.5rem; color: #2a2118;">
  <p style="font-size: 0.8rem; letter-spacing: 0.08em; text-transform: uppercase; color: #8a7a5c; margin: 0 0 1rem;">Dungeon Grimoire · Account notice</p>
  ${paragraphs.map((p) => `<p ${pStyle}>${escapeHtml(p)}</p>`).join("\n  ")}
  <p style="margin: 1.5rem 0;">
    <a href="${escapeHtml(APP_ORIGIN)}" style="display: inline-block; background: #7a1f1f; color: #f5efe0; text-decoration: none; padding: 0.6rem 1.2rem; border-radius: 0.25rem;">Sign in to Grimoire</a>
  </p>
  <p style="font-size: 1rem; line-height: 1.6;">Read the <a href="${escapeHtml(PRIVACY_URL)}" style="color: #7a1f1f;">Privacy Policy</a>.</p>
  <hr style="border: none; border-top: 1px solid #d9cdb4; margin: 1.5rem 0 0.75rem;" />
  <p style="font-size: 0.75rem; color: #8a7a5c; margin: 0;">${escapeHtml(FOOTER)}</p>
</div>`;

  const text = [...paragraphs.flatMap((p) => [p, ""]), `Sign in: ${APP_ORIGIN}`, `Privacy Policy: ${PRIVACY_URL}`, "", FOOTER].join(
    "\n",
  );

  return { subject: SUBJECT, html, text };
}
