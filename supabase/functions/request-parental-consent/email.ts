/**
 * The one email request-parental-consent sends. Pure — no Deno/https imports
 * — so vitest can cover it directly (see vitest.config.ts's
 * supabase/functions include). Same visual style as
 * send-notification-email/emails.ts, but that module isn't imported here:
 * edge functions don't import across each other's directories in this repo
 * (each is its own Deno bundle). What they share lives in `_shared/`, which is
 * where escapeHtml comes from (`_shared/emailHtml.ts`); the layout shell stays
 * local because each email's frame differs.
 *
 * Every word is fixed. Nothing the requester controls reaches this template,
 * only the request token inside the link. That includes the campaign name:
 * anyone can create a campaign, name it with a phishing line and an invite,
 * and have it mailed to any address. The parent sees the campaign's name in
 * the app, after signing in with the address the request was sent to.
 */

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

import { escapeHtml } from "../_shared/emailHtml.ts";


export interface ParentConsentRequestArgs {
  /** The request came from a valid campaign invite. Never the campaign's name: see the header. */
  fromInvite: boolean;
  /** Full URL to the parent's "Add a child player" review screen, carrying the request token. */
  addUrl: string;
}

const INVITE_LINE = "They were invited to join a campaign, and you'll see which one when you review the request.";

export function parentConsentRequestEmail({ fromInvite, addUrl }: ParentConsentRequestArgs): EmailContent {
  const campaignLine = fromInvite ? INVITE_LINE : "";
  const campaignLineText = fromInvite ? `${INVITE_LINE}\n\n` : "";

  return {
    subject: "A young player asked you to set up a Grimoire account",
    html: `<div style="font-family: Georgia, 'Times New Roman', serif; max-width: 36rem; margin: 0 auto; padding: 1.5rem; color: #2a2118;">
  <p style="font-size: 0.8rem; letter-spacing: 0.08em; text-transform: uppercase; color: #8a7a5c; margin: 0 0 1rem;">Grimoire</p>
  <p style="font-size: 1rem; line-height: 1.6;">
    A young player asked you to set up, or approve, a Grimoire account on their behalf.
    Grimoire is a tool DMs and players use to run tabletop campaigns.
  </p>
  <p style="font-size: 1rem; line-height: 1.6;">${campaignLine}</p>
  <p style="font-size: 1rem; line-height: 1.6;">
    You will need to sign in, or create your own Grimoire account, before you can continue.
  </p>
  <p style="margin: 1.5rem 0;">
    <a href="${escapeHtml(addUrl)}" style="display: inline-block; background: #7a1f1f; color: #f5efe0; text-decoration: none; padding: 0.6rem 1.2rem; border-radius: 0.25rem;">Review the request</a>
  </p>
  <hr style="border: none; border-top: 1px solid #d9cdb4; margin: 1.5rem 0 0.75rem;" />
  <p style="font-size: 0.75rem; color: #8a7a5c; margin: 0;">
    This request expires in 14 days. If you do not act on it, the request and this email address
    are deleted automatically once it expires.
  </p>
</div>`,
    text:
      "A young player asked you to set up, or approve, a Grimoire account on their behalf. " +
      "Grimoire is a tool DMs and players use to run tabletop campaigns.\n\n" +
      campaignLineText +
      "You will need to sign in, or create your own Grimoire account, before you can continue.\n\n" +
      `Review the request: ${addUrl}\n\n` +
      "This request expires in 14 days. If you do not act on it, the request and this email " +
      "address are deleted automatically once it expires.",
  };
}
