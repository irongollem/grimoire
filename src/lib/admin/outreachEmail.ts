/**
 * The admin's personal outreach email to an account that went quiet. A
 * pre-written draft the admin can rewrite; it opens in their own mail client
 * (mailto:), so it goes out from their address and replies reach them.
 */
import { DISCORD_URL } from "@/lib/marketing";
import { safeLocalStorage } from "@/lib/safeLocalStorage";
import { RELEASE_HIGHLIGHTS, type ReleaseHighlight } from "@/lib/admin/releaseHighlights";
import type { AdminUser } from "@/composables/admin/useAdminUsers";

export interface OutreachTemplate {
  subject: string;
  body: string;
}

export const OUTREACH_PLACEHOLDERS: readonly { token: string; meaning: string }[] = [
  { token: "{{name}}", meaning: "Their display name, or \"there\" if they never set one" },
  { token: "{{joined}}", meaning: "Month and year they signed up" },
  { token: "{{lastVisit}}", meaning: "Month and year of their last visit" },
  { token: "{{highlights}}", meaning: "What is new since their last visit, only for accounts that opted in to news" },
  { token: "{{discord}}", meaning: "The link to the community Discord" },
];

export const DEFAULT_OUTREACH_TEMPLATE: OutreachTemplate = {
  subject: "How did Dungeon Grimoire work out for you?",
  body: `Hi {{name}},

You signed up for Dungeon Grimoire in {{joined}}, and the last time we saw you was {{lastVisit}}. The app has changed a fair bit since then, but that is not why I'm writing: I'd really like to know how it went for you.

What made you step away, or what would have made it work for you? Even a one-line reply helps me decide what to build next.

{{highlights}}

If you have questions, the community Discord is the quickest place to ask: {{discord}}

Or just reply to this email. It comes straight to me.

Cheers,
Jeffrey`,
};

/** Releases strictly after `lastActiveAt`, newest first, at most `max`. */
export function pickHighlights(
  lastActiveAt: string,
  all: readonly ReleaseHighlight[] = RELEASE_HIGHLIGHTS,
  max = 6,
): ReleaseHighlight[] {
  const since = new Date(lastActiveAt).getTime();
  return all
    .filter((h) => new Date(h.releasedAt).getTime() > since)
    .sort((a, b) => new Date(b.releasedAt).getTime() - new Date(a.releasedAt).getTime())
    .slice(0, max);
}

function monthYear(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

type OutreachUser = Pick<AdminUser, "display_name" | "created_at" | "last_active_at" | "product_news">;

export function renderOutreach(
  template: OutreachTemplate,
  user: OutreachUser,
): OutreachTemplate {
  // Only an account that asked to hear about updates gets the list; for the
  // rest the email is feedback-only and the placeholder renders as nothing.
  const picked = user.product_news ? pickHighlights(user.last_active_at) : [];
  const highlights =
    picked.length > 0
      ? `Since you asked to hear about updates, here is some of what is new since your last visit:\n${picked.map((h) => `- ${h.line}`).join("\n")}`
      : "";
  const values: Record<string, string> = {
    name: user.display_name?.trim() ? user.display_name.trim() : "there",
    joined: monthYear(user.created_at),
    lastVisit: monthYear(user.last_active_at),
    highlights,
    discord: DISCORD_URL,
  };
  const fill = (text: string) =>
    text
      .replace(/\{\{(\w+)\}\}/g, (whole, key: string) => (key in values ? values[key] : whole))
      // An empty placeholder must not leave a gap in the paragraphs around it.
      .replace(/\n{3,}/g, "\n\n");
  return { subject: fill(template.subject), body: fill(template.body) };
}

export function outreachMailto(email: string, mail: OutreachTemplate): string {
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(mail.subject)}&body=${encodeURIComponent(mail.body)}`;
}

export const OUTREACH_STORAGE_KEY = "grimoire:admin:outreach-template";

function isTemplate(value: unknown): value is OutreachTemplate {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.subject === "string" && typeof v.body === "string";
}

export function loadOutreachTemplate(): OutreachTemplate {
  try {
    const raw = safeLocalStorage().getItem(OUTREACH_STORAGE_KEY);
    if (raw === null) return { ...DEFAULT_OUTREACH_TEMPLATE };
    const parsed: unknown = JSON.parse(raw);
    return isTemplate(parsed) ? { subject: parsed.subject, body: parsed.body } : { ...DEFAULT_OUTREACH_TEMPLATE };
  } catch {
    return { ...DEFAULT_OUTREACH_TEMPLATE };
  }
}

export function saveOutreachTemplate(template: OutreachTemplate): void {
  try {
    safeLocalStorage().setItem(OUTREACH_STORAGE_KEY, JSON.stringify(template));
  } catch {
    // Storage blocked: the template just will not outlive the tab.
  }
}

export function resetOutreachTemplate(): OutreachTemplate {
  try {
    safeLocalStorage().removeItem(OUTREACH_STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
  return { ...DEFAULT_OUTREACH_TEMPLATE };
}
