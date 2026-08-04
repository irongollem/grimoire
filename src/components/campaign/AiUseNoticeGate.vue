<template>
  <AiNoticeDialog v-if="mounted" v-model="open" kind="ai_use" @cancel="dismissForSession" />
</template>

<script setup lang="ts">
/**
 * Once-per-account AI-use notice for campaigns where `ai_enabled` was already
 * true before this account ever acknowledged it — a fresh toggle-on goes
 * through `AiTab.vue`'s own gate instead, which records the acknowledgement
 * before the toggle takes effect. Mounted once in each of the DM shell
 * (DefaultLayout) and the player shell (PlayerLayout) so whichever role loads
 * the campaign first gets prompted. See
 * context/compliance/provenance-architecture.md §3.
 *
 * Confirming records the acknowledgement (handled inside AiNoticeDialog) and
 * this gate never re-opens for the account. Dismissing without confirming
 * suppresses the notice only for the rest of this session — see
 * useAiUseNoticeDismissal for why that isn't useUiStore or localStorage.
 */
import { ref, watch } from "vue";
import AiNoticeDialog from "@/components/campaign/AiNoticeDialog.vue";
import { useCampaignStore } from "@/stores/campaign";
import { useAiAcknowledgements } from "@/composables/useAiAcknowledgements";
import { useAiUseNoticeDismissal } from "@/composables/useAiUseNoticeDismissal";
import { useLazyMount } from "@/composables/useLazyMount";
import { AI_USE_NOTICE_VERSION } from "@/lib/legal";

const campaign = useCampaignStore();
const { hasAcknowledged } = useAiAcknowledgements();
const { dismissed, dismissForSession } = useAiUseNoticeDismissal();

const open = ref(false);
const mounted = useLazyMount(open);

watch(
  () => campaign.activeCampaign,
  (c) => {
    if (!c || dismissed.value) return;
    if (c.ai_enabled && !hasAcknowledged("ai_use", AI_USE_NOTICE_VERSION)) {
      open.value = true;
    }
  },
  { immediate: true },
);
</script>
