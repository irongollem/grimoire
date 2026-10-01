/**
 * One-off product announcements shown at the top of the DM shell
 * (AnnouncementBanner). Each is shown once per account until dismissed; the
 * dismissal is stored server-side (announcement_dismissals), so it stays gone
 * on every device.
 *
 * To announce something: add an entry with a new, never-reused `id`. Entries
 * can be deleted once they are old; a stale dismissal row for a deleted id is
 * harmless.
 */
export interface Announcement {
  /** Stable and unique forever; it is the dismissal key. */
  id: string;
  title: string;
  body: string;
  /** ISO date. Accounts created after this never see it (nothing changed for them). */
  publishedAt: string;
  /** Optional link shown as the notice's action. */
  action?: { label: string; to: string };
}

export const ANNOUNCEMENTS: Announcement[] = [
  {
    id: "2026-10-vellum",
    title: "A new look for Dungeon Grimoire",
    body:
      "We've moved Dungeon Grimoire to a new look we prefer: Vellum, with Vellum Lamplight if you were using the dark theme. " +
      "If you prefer the old look, you can switch back to the Tome or Grimoire theme in your campaign settings.",
    publishedAt: "2026-10-02",
    action: { label: "Campaign settings", to: "/campaign/settings" },
  },
];

/**
 * The announcements an account still has to see, oldest first: published
 * after the account was created are skipped (a new account has nothing to be
 * told about), and dismissed ones are gone. Pure, for testing.
 */
export function pendingAnnouncements(
  all: readonly Announcement[],
  dismissedIds: ReadonlySet<string>,
  accountCreatedAt: string | null | undefined,
): Announcement[] {
  const created = accountCreatedAt ? Date.parse(accountCreatedAt) : NaN;
  return all
    .filter((a) => !dismissedIds.has(a.id))
    .filter((a) => Number.isNaN(created) || created < Date.parse(a.publishedAt))
    .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt));
}
