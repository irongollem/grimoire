/**
 * The emails notify-join-request sends (#927). Pure, no Deno imports, so
 * vitest covers it directly. Same look as request-parental-consent/email.ts.
 *
 * Every word is fixed. Neither the campaign's name nor the joiner's name
 * appears, because anyone can name a campaign or an account with a phishing
 * line and have this mailed to a parent. The parent sees the names in the
 * app, after signing in.
 */

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

/**
 * Which side of the request the parent is on: `joiner` (their young player
 * asked to join a campaign), `dm` (someone asked to join a campaign their
 * young player runs), or `both` (siblings: one parent, both sides).
 */
export type JoinRequestRole = "joiner" | "dm" | "both";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const COPY: Record<JoinRequestRole, { subject: string; line: string }> = {
  joiner: {
    subject: "Your young player asked to join a campaign",
    line: "Your young player asked to join a campaign on Grimoire. They can only join once you say yes.",
  },
  dm: {
    subject: "Someone asked to join your young player's campaign",
    line: "Someone asked to join a campaign your young player runs on Grimoire. They can only join once you say yes.",
  },
  both: {
    subject: "A request involving your young player is waiting",
    line: "A request involving your young player is waiting on Grimoire. Nobody is added to a campaign until you say yes.",
  },
};

const SEE_LINE = "You'll see who and which campaign when you open your Family page.";
const BUTTON = "Open your Family page";

export function joinRequestEmail({ role, familyUrl }: { role: JoinRequestRole; familyUrl: string }): EmailContent {
  const { subject, line } = COPY[role];
  return {
    subject,
    html: `<div style="font-family: Georgia, 'Times New Roman', serif; max-width: 36rem; margin: 0 auto; padding: 1.5rem; color: #2a2118;">
  <p style="font-size: 0.8rem; letter-spacing: 0.08em; text-transform: uppercase; color: #8a7a5c; margin: 0 0 1rem;">Grimoire</p>
  <p style="font-size: 1rem; line-height: 1.6;">${escapeHtml(line)}</p>
  <p style="font-size: 1rem; line-height: 1.6;">${escapeHtml(SEE_LINE)}</p>
  <p style="margin: 1.5rem 0;">
    <a href="${escapeHtml(familyUrl)}" style="display: inline-block; background: #7a1f1f; color: #f5efe0; text-decoration: none; padding: 0.6rem 1.2rem; border-radius: 0.25rem;">${BUTTON}</a>
  </p>
  <hr style="border: none; border-top: 1px solid #d9cdb4; margin: 1.5rem 0 0.75rem;" />
  <p style="font-size: 0.75rem; color: #8a7a5c; margin: 0;">
    You are getting this because your Grimoire account manages a young player's account.
  </p>
</div>`,
    text:
      `${line}\n\n${SEE_LINE}\n\n${BUTTON}: ${familyUrl}\n\n` +
      "You are getting this because your Grimoire account manages a young player's account.",
  };
}
