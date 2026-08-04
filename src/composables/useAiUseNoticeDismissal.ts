import { ref } from "vue";
import type { Campaign } from "@/types/campaign.types";

/**
 * Whether the once-per-account AI-use notice (see `AiUseNoticeGate.vue`) has
 * been dismissed *without* being acknowledged during this browser session.
 *
 * Module-scoped ref, not `useUiStore` and not `localStorage` — same pattern as
 * `useCast.ts`'s device-singleton state. `useUiStore` is for list-filter/UI
 * state that survives navigation (Filter State Pattern); this is a one-shot
 * "don't nag again this load" flag, and it must NOT survive a reload/new tab —
 * an unacknowledged campaign has to keep prompting until the user actually
 * confirms. A plain module-level ref gives exactly that lifetime: shared by
 * every mount of `AiUseNoticeGate` (the DM shell and the player shell can both
 * mount it across a session) and reset only when the module is re-evaluated,
 * i.e. on a full page reload.
 *
 * Not used by the chooser flow (`ai_enabled === null`) — "Not now" there
 * persists an explicit `false` immediately, which is itself a decision that
 * never needs to re-prompt, so there is nothing session-scoped to track.
 */
const dismissed = ref(false);

export function useAiUseNoticeDismissal() {
  function dismissForSession() {
    dismissed.value = true;
  }

  return { dismissed, dismissForSession };
}

/**
 * Whether `AiUseNoticeGate` should offer the AI chooser (as opposed to the
 * plain "AI is on" notice, or nothing) for `campaign` right now:
 * `ai_enabled` has never been explicitly chosen (`null`) and
 * `currentUserId` is the campaign's owner (`campaigns.user_id`) — the only
 * one allowed to make this campaign-wide call. Players and non-owner co-DMs
 * of a null campaign get `false` here; the campaign behaves as AI-off
 * (`useCampaignStore().isAiEnabled` is `=== true` only) until the owner
 * decides. Pure predicate, exported for testing without mounting
 * `AiUseNoticeGate` or mocking Pinia — see
 * context/compliance/ai-act.md §4.
 */
export function shouldOfferAiChoice(
  campaign: Pick<Campaign, "ai_enabled" | "user_id">,
  currentUserId: string | null | undefined,
): boolean {
  return campaign.ai_enabled === null && !!currentUserId && campaign.user_id === currentUserId;
}
