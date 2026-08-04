<template>
  <AiNoticeDialog v-if="mounted" v-model="open" kind="ai_use" :mode="mode" @confirm="handleConfirm" @cancel="handleCancel" />
</template>

<script setup lang="ts">
/**
 * Two things live here, both keyed off the active campaign's tri-state
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
 *    chooser (mode "choose"). Confirm records the `ai_use` acknowledgement
 *    (inside `AiNoticeDialog`) and this gate then flips `ai_enabled` to
 *    `true`; "Not now" flips it to `false` directly, with no acknowledgement
 *    and no re-prompt — settings is the way back in. Players and non-owners
 *    of a null campaign see nothing here: `isAiEnabled` stays `false` (only
 *    `=== true` counts), which already hides every AI affordance.
 *
 * Mounted once in each of the DM shell (DefaultLayout) and the player shell
 * (PlayerLayout) so whichever role loads the campaign first can trigger the
 * plain notice — the chooser only ever opens for the owner, regardless of
 * which shell happened to mount it first. See
 * context/compliance/provenance-architecture.md §3.
 */
import { ref, watch } from "vue";
import AiNoticeDialog from "@/components/campaign/AiNoticeDialog.vue";
import { useCampaignStore } from "@/stores/campaign";
import { useAuthStore } from "@/stores/auth";
import { useAiAcknowledgements } from "@/composables/useAiAcknowledgements";
import { useAiUseNoticeDismissal, shouldOfferAiChoice } from "@/composables/useAiUseNoticeDismissal";
import { useLazyMount } from "@/composables/useLazyMount";
import { useUpdateCampaign } from "@/composables/useCampaigns";
import { AI_USE_NOTICE_VERSION } from "@/lib/legal";

const campaign = useCampaignStore();
const auth = useAuthStore();
const { hasAcknowledged } = useAiAcknowledgements();
const { dismissed, dismissForSession } = useAiUseNoticeDismissal();
const { mutateAsync: updateCampaign } = useUpdateCampaign();

const open = ref(false);
const mode = ref<"notice" | "choose">("notice");
const mounted = useLazyMount(open);

watch(
  () => [campaign.activeCampaign, auth.user?.id] as const,
  ([c, userId]) => {
    if (!c || dismissed.value) return;
    if (c.ai_enabled === null) {
      if (shouldOfferAiChoice(c, userId)) {
        mode.value = "choose";
        open.value = true;
      }
      return;
    }
    if (c.ai_enabled && !hasAcknowledged("ai_use", AI_USE_NOTICE_VERSION)) {
      mode.value = "notice";
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

function handleConfirm() {
  if (mode.value === "choose") void persistChoice(true);
}

function handleCancel() {
  if (mode.value === "choose") {
    void persistChoice(false);
    return;
  }
  dismissForSession();
}
</script>
