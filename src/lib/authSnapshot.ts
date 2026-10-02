import type { CampaignMember } from "@/types/campaign.types";
import type { ChildAccountLink } from "@/types/childAccount.types";

const KEY = "grimoire:auth-snapshot";

export interface AuthSnapshot {
  v: 1;
  userId: string;
  membership: CampaignMember | null;
  username: string | null;
  childLink: ChildAccountLink | null;
  childLinkLoaded: boolean;
}

/**
 * The identity facts the boot used to wait on the network for: membership,
 * profile username and the child-account link. One entry, for the last
 * signed-in user.
 *
 * This is a display hint so the shell can mount before the network answers.
 * Every fact in it is re-read in the background, and the server stays the only
 * boundary for all of them (RLS, `private.is_child_account`), so a stale value
 * shows a control that then refuses, never a capability.
 *
 * Every storage access is wrapped: private mode and a full quota are a miss on
 * read and a no-op on write, never a throw that would break sign-in.
 */
export function readAuthSnapshot(
  userId: string,
  campaignId: string | undefined,
): AuthSnapshot | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AuthSnapshot> | null;
    if (!parsed || parsed.v !== 1 || parsed.userId !== userId) return null;
    const membership = parsed.membership ?? null;
    // A snapshot only stands in for the read initialize() would have made: for
    // a named campaign that is this campaign's row, and a snapshot of another
    // campaign (or of none) would show the wrong role until the network answers.
    if (campaignId !== undefined && membership?.campaign_id !== campaignId) return null;
    return {
      v: 1,
      userId,
      membership,
      username: parsed.username ?? null,
      childLink: parsed.childLink ?? null,
      childLinkLoaded: parsed.childLinkLoaded === true,
    };
  } catch {
    return null;
  }
}

export function writeAuthSnapshot(snapshot: AuthSnapshot): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot));
  } catch {
    /* storage unavailable: the next boot simply misses */
  }
}

export function clearAuthSnapshot(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear if storage is unavailable */
  }
}
