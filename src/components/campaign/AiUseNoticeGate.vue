<template>
  <AiNoticeDialog
    v-if="mounted"
    v-model="open"
    :kind="kind"
    :mode="mode"
    :pro-reoffer="proReoffer"
    @confirm="handleConfirm"
    @cancel="handleCancel"
  />
</template>

<script setup lang="ts">
/**
 * Three things live here, all keyed off the active campaign's tri-state
 * `ai_enabled` (context/compliance/ai-act.md §4):
 *
 *  - `ai_enabled === true` and this account hasn't acknowledged the AI-use
 *    notice yet → the plain once-per-account notice (mode "notice", existing
 *    behavior) — for campaigns where AI was already on before this account
 *    ever saw the dialog. A fresh toggle-on goes through `AiTab.vue`'s own
 *    gate instead, which records the acknowledgement before the toggle takes
 *    effect.
 *  - `ai_enabled === null` (never explicitly chosen) and the current user is
 *    the campaign's OWNER (`shouldOfferAiChoice`) → the inviting-but-honest
 *    chooser (mode "choose", kind "ai_use"). Confirm records the `ai_use`
 *    acknowledgement (inside `AiNoticeDialog`) and this gate then flips
 *    `ai_enabled` to `true`; "Not now" flips it to `false` directly, with no
 *    acknowledgement and no re-prompt — settings is the way back in. Players
 *    and non-owners of a null campaign see nothing here: `isAiEnabled` stays
 *    `false` (only `=== true` counts), which already hides every AI
 *    affordance.
 *  - `ai_enabled === false` (explicitly declined) and the owner has since
 *    upgraded to Pro → the one-time free->Pro re-ask (mode "choose", kind
 *    "ai_pro_reoffer", `proReoffer: true` for Pro-aware copy). Owner decision
 *    4 Aug 2026: people pay for Pro expecting AI and may have forgotten an
 *    old "Not now", so they get exactly one re-ask, never an auto-flip.
 *    Confirm records BOTH `ai_use` (if this account hadn't already recorded
 *    it — e.g. a decline before ever seeing the plain notice) AND
 *    `ai_pro_reoffer`, then flips `ai_enabled` to `true`. "Not now" records
 *    ONLY `ai_pro_reoffer` and leaves `ai_enabled` false — that reconsidered
 *    "no" is final, on every device, forever (the acknowledgement is
 *    user-level, not per-campaign — see `shouldOfferProReoffer`). These two
 *    branches are mutually exclusive by construction (`ai_enabled` can't be
 *    both `null` and `false`), and this branch never fires ahead of the two
 *    above: a null campaign already prompts regardless of plan, and a
 *    true-but-unacknowledged campaign only needs the plain notice.
 *
 * Multi-campaign note: the re-ask fires for whichever owned AI-off campaign
 * this account opens first after upgrading. Because `ai_pro_reoffer` is
 * recorded per-user (not per-campaign), answering it there silences it for
 * every other AI-off campaign this account owns too — intended, not a bug:
 * this is a one-time "have you reconsidered" moment for the person, not a
 * per-campaign setting.
 *
 * Mounted once in each of the DM shell (DefaultLayout) and the player shell
 * (PlayerLayout) so whichever role loads the campaign first can trigger the
 * plain notice — the chooser (either kind) only ever opens for the owner,
 * regardless of which shell happened to mount it first. See
 * context/compliance/provenance-architecture.md §3.
 */
import { ref, watch } from "vue";
import AiNoticeDialog from "@/components/campaign/AiNoticeDialog.vue";
import { useCampaignStore } from "@/stores/campaign";
import { useAuthStore } from "@/stores/auth";
import { useSubscription } from "@/composables/billing/useSubscription";
import { useAiAcknowledgements, type AiAcknowledgementKind } from "@/composables/ai/useAiAcknowledgements";
import { useAiUseNoticeDismissal, shouldOfferAiChoice, shouldOfferProReoffer } from "@/composables/ai/useAiUseNoticeDismissal";
import { useLazyMount } from "@/composables/useLazyMount";
import { useUpdateCampaign } from "@/composables/campaign/useCampaigns";
import { AI_USE_NOTICE_VERSION, AI_PRO_REOFFER_NOTICE_VERSION } from "@/lib/legal";

const campaign = useCampaignStore();
const auth = useAuthStore();
const { isPro } = useSubscription();
const {
  acknowledgements,
  isLoading: acknowledgementsLoading,
  isError: acknowledgementsError,
  hasAcknowledged,
  acknowledge,
} = useAiAcknowledgements();
const { dismissed, dismissForSession } = useAiUseNoticeDismissal();
const { mutateAsync: updateCampaign } = useUpdateCampaign();

const open = ref(false);
const mode = ref<"notice" | "choose">("notice");
const kind = ref<AiAcknowledgementKind>("ai_use");
const proReoffer = ref(false);
const mounted = useLazyMount(open);

watch(
  () => [
    campaign.activeCampaign,
    auth.user?.id,
    isPro.value,
    acknowledgementsLoading.value,
    acknowledgementsError.value,
    acknowledgements.value,
  ] as const,
  ([c, userId, pro, loading, loadFailed]) => {
    // `hasAcknowledged()` reads an async query. Do not interpret its initial
    // empty value as an explicit "not acknowledged" result, and observe the
    // rows themselves so this watcher reruns when the fetch completes.
    if (!c || dismissed.value || loading) return;
    // A backend/network failure is not evidence that the account has never
    // acknowledged the notice. Suppress the gate until the read can succeed;
    // otherwise the failure itself creates an undismissable popup loop.
    if (loadFailed) {
      open.value = false;
      return;
    }
    if (c.ai_enabled === null) {
      if (shouldOfferAiChoice(c, userId)) {
        mode.value = "choose";
        kind.value = "ai_use";
        proReoffer.value = false;
        open.value = true;
      }
      return;
    }
    if (c.ai_enabled && !hasAcknowledged("ai_use", AI_USE_NOTICE_VERSION)) {
      mode.value = "notice";
      kind.value = "ai_use";
      proReoffer.value = false;
      open.value = true;
      return;
    }
    if (shouldOfferProReoffer(c, userId, pro, hasAcknowledged("ai_pro_reoffer", AI_PRO_REOFFER_NOTICE_VERSION))) {
      mode.value = "choose";
      kind.value = "ai_pro_reoffer";
      proReoffer.value = true;
      open.value = true;
    }
  },
  { immediate: true },
);

async function persistChoice(aiEnabled: boolean) {
  if (!campaign.activeCampaignId) return;
  const updated = await updateCampaign({ id: campaign.activeCampaignId, update: { ai_enabled: aiEnabled } });
  campaign.switchToCampaign(updated);
}

async function handleProReofferConfirm() {
  // The dialog's own confirm() already recorded 'ai_pro_reoffer' (its
  // `kind`) — this only adds the sibling 'ai_use' acknowledgement, if this
  // account somehow declined before ever recording it, then flips the
  // campaign on, mirroring the null-chooser confirm path above.
  if (!hasAcknowledged("ai_use", AI_USE_NOTICE_VERSION)) {
    await acknowledge("ai_use", AI_USE_NOTICE_VERSION);
  }
  await persistChoice(true);
}

function handleConfirm() {
  if (mode.value !== "choose") return;
  if (kind.value === "ai_pro_reoffer") {
    void handleProReofferConfirm();
    return;
  }
  void persistChoice(true);
}

function handleCancel() {
  if (mode.value !== "choose") {
    dismissForSession();
    return;
  }
  if (kind.value === "ai_pro_reoffer") {
    // "Not now" on the re-ask: the dialog's cancel() never auto-records (only
    // confirm does), so this gate records it explicitly. ai_enabled is
    // already false — nothing to persist, and this row means no future
    // re-prompt on any device (see the file-header note above).
    void acknowledge("ai_pro_reoffer", AI_PRO_REOFFER_NOTICE_VERSION);
    return;
  }
  void persistChoice(false);
}
</script>
