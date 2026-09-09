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

/**
 * Whether `AiUseNoticeGate` should show the plain "AI is on" notice: the
 * campaign has AI on, this account has not acknowledged the current notice
 * version, and this account is a DM of the campaign. Players never see it
 * (maintainer decision, 9 Sep 2026): the notice is the Art 50(1)
 * *deployer-side* transparency step — it explains what the DM is about to
 * send to a provider — while what a player is owed is the marker on the
 * content itself, which the portal already carries. Pure predicate, tested
 * without mounting the gate.
 */
export function shouldShowAiUseNotice(
  campaign: Pick<Campaign, "ai_enabled">,
  isDm: boolean,
  hasAcknowledged: boolean,
): boolean {
  return campaign.ai_enabled === true && isDm && !hasAcknowledged;
}

/**
 * Whether `AiUseNoticeGate` should offer the one-time free->Pro AI re-ask
 * (context/compliance/ai-act.md §4, owner decision 4 Aug 2026) for
 * `campaign` right now: the owner previously declined AI explicitly
 * (`ai_enabled === false` — not `null`, which is `shouldOfferAiChoice`'s
 * case), `currentUserId` is the campaign's owner, the account is Pro, and
 * the re-offer hasn't already been answered (`hasAcknowledgedReoffer`,
 * whichever way — confirm and "Not now" both record it, see
 * `AiUseNoticeGate.vue`). Never true for a `null` campaign — that's the
 * plain chooser's case and takes precedence regardless of plan. Pure
 * predicate, exported for testing without mounting `AiUseNoticeGate` or
 * mocking Pinia/TanStack Query.
 */
export function shouldOfferProReoffer(
  campaign: Pick<Campaign, "ai_enabled" | "user_id">,
  currentUserId: string | null | undefined,
  isPro: boolean,
  hasAcknowledgedReoffer: boolean,
): boolean {
  return (
    campaign.ai_enabled === false &&
    !!currentUserId &&
    campaign.user_id === currentUserId &&
    isPro &&
    !hasAcknowledgedReoffer
  );
}
