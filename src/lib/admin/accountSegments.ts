/**
 * Admin → Users: which accounts are in real use and which signed up, looked
 * around and left. Pure, so the thresholds are testable and the list, the
 * filter chips and the counts all read the same rule.
 */
import type { AdminUser } from "@/composables/admin/useAdminUsers";

export type AccountSegment = "new" | "active" | "exploring" | "lapsed" | "bounced";

/** An account younger than this is `new`, whatever else it has or has not done. */
export const NEW_ACCOUNT_DAYS = 14;
/** Active within this many days counts as recently active. */
export const RECENT_ACTIVITY_DAYS = 30;

const DAY_MS = 86_400_000;

export const SEGMENT_ORDER: readonly AccountSegment[] = ["new", "active", "exploring", "lapsed", "bounced"];

export const SEGMENT_INFO: Record<AccountSegment, { label: string; description: string }> = {
  new: { label: "New", description: `Joined in the last ${NEW_ACCOUNT_DAYS} days` },
  active: { label: "Active", description: `Has a campaign and was here in the last ${RECENT_ACTIVITY_DAYS} days` },
  exploring: { label: "Exploring", description: `No campaign yet, but here in the last ${RECENT_ACTIVITY_DAYS} days` },
  lapsed: { label: "Lapsed", description: `Has a campaign, gone ${RECENT_ACTIVITY_DAYS}+ days` },
  bounced: { label: "Bounced", description: `Signed up, made nothing, gone ${RECENT_ACTIVITY_DAYS}+ days` },
};

type SegmentInput = Pick<AdminUser, "created_at" | "last_active_at" | "campaigns_owned" | "campaigns_playing">;

export function accountSegment(user: SegmentInput, now: Date): AccountSegment {
  const age = now.getTime() - new Date(user.created_at).getTime();
  if (age < NEW_ACCOUNT_DAYS * DAY_MS) return "new";
  const hasCampaigns = user.campaigns_owned + user.campaigns_playing > 0;
  const idle = now.getTime() - new Date(user.last_active_at).getTime();
  const recent = idle <= RECENT_ACTIVITY_DAYS * DAY_MS;
  if (hasCampaigns) return recent ? "active" : "lapsed";
  return recent ? "exploring" : "bounced";
}

export function countBySegment(users: readonly SegmentInput[], now: Date): Record<AccountSegment, number> {
  const counts: Record<AccountSegment, number> = { new: 0, active: 0, exploring: 0, lapsed: 0, bounced: 0 };
  for (const u of users) counts[accountSegment(u, now)] += 1;
  return counts;
}
