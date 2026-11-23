/**
 * How an account in Admin → Users has set AI on the campaigns it owns.
 *
 * The switch is per campaign (`campaigns.ai_enabled`), so an account's answer
 * is a count: `campaigns_ai_on` out of `campaigns_owned`, both counted over the
 * same campaigns by `get_admin_users` (the demo copy left out). A campaign
 * nobody has chosen for counts as off, as it behaves everywhere else.
 */
import type { AdminUser } from "@/composables/admin/useAdminUsers";

type AiInput = Pick<AdminUser, "campaigns_owned" | "campaigns_ai_on">;

/** "AI on", "AI on in 1 of 3", "AI off"; empty for an account that owns no campaign. */
export function aiChoiceLabel(user: AiInput): string {
  if (user.campaigns_owned === 0) return "";
  if (user.campaigns_ai_on === 0) return "AI off";
  if (user.campaigns_ai_on === user.campaigns_owned) return "AI on";
  return `AI on in ${user.campaigns_ai_on} of ${user.campaigns_owned}`;
}

/** Campaign owners with AI on in at least one campaign, and those with it off in all. */
export function countAiChoice(users: readonly AiInput[]): { on: number; off: number } {
  let on = 0;
  let off = 0;
  for (const user of users) {
    if (user.campaigns_owned === 0) continue;
    if (user.campaigns_ai_on > 0) on += 1;
    else off += 1;
  }
  return { on, off };
}
