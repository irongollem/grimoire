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
  { token: "{{highlights}}", meaning: "What shipped since their last visit, as a short list" },
  { token: "{{discord}}", meaning: "The link to the community Discord" },
];

export const DEFAULT_OUTREACH_TEMPLATE: OutreachTemplate = {
  subject: "Dungeon Grimoire has changed a lot since your last visit",
  body: `Hi {{name}},

You joined Dungeon Grimoire in {{joined}} and the last time we saw you was {{lastVisit}}. A lot has happened since then:

{{highlights}}

I'd really like to hear what made you step away, or what would have made it work for you. Even a one-line reply helps me decide what to build next.

If you have questions, the community Discord is the quickest place to ask: {{discord}}

Or just reply to this email. It comes straight to me.

Cheers,
Jeffrey`,
};

/** Shown when nothing in the release list is newer than their last visit. */
export const NO_HIGHLIGHTS_LINE = "Lots of smaller fixes and improvements";

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

type OutreachUser = Pick<AdminUser, "display_name" | "created_at" | "last_active_at">;

export function renderOutreach(
  template: OutreachTemplate,
  user: OutreachUser,
): OutreachTemplate {
  const picked = pickHighlights(user.last_active_at);
  const lines = picked.length > 0 ? picked.map((h) => h.line) : [NO_HIGHLIGHTS_LINE];
  const values: Record<string, string> = {
    name: user.display_name?.trim() ? user.display_name.trim() : "there",
    joined: monthYear(user.created_at),
    lastVisit: monthYear(user.last_active_at),
    highlights: lines.map((l) => `- ${l}`).join("\n"),
    discord: DISCORD_URL,
  };
  const fill = (text: string) =>
    text.replace(/\{\{(\w+)\}\}/g, (whole, key: string) => (key in values ? values[key] : whole));
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
