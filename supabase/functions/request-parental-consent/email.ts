/**
 * The one email request-parental-consent sends. Pure — no Deno/https imports
 * — so vitest can cover it directly (see vitest.config.ts's
 * supabase/functions include). Same visual style as
 * send-notification-email/emails.ts, but that module isn't imported here:
 * edge functions don't import across each other's directories in this repo
 * (each is its own Deno bundle), so the handful of shared bits (escapeHtml,
 * the layout shell) are kept small and duplicated rather than reached for
 * across a function boundary.
 *
 * Every word is fixed. NOTHING the requester typed reaches this template —
 * only a token and, when it resolved to one, a campaign name already stored
 * in the database. A free-text field here would turn a parent's inbox into a
 * spam vector for an address they never gave out themselves.
 */

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface ParentConsentRequestArgs {
  /** null when the request carried no invite, or an invalid/expired/exhausted one. */
  campaignName: string | null;
  /** Full URL to the parent's "Add a child player" review screen, carrying the request token. */
  addUrl: string;
}

export function parentConsentRequestEmail({ campaignName, addUrl }: ParentConsentRequestArgs): EmailContent {
  const campaignLine = campaignName
    ? `They would join the campaign <strong>${escapeHtml(campaignName)}</strong>.`
    : "";
  const campaignLineText = campaignName ? `They would join the campaign: ${campaignName}.\n\n` : "";

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
