<template>
  <div class="flex flex-wrap items-center gap-1">
    <AppButton
      v-if="canPreview"
      variant="subtle"
      size="icon-xs"
      tooltip="Preview"
      :icon="IconReveal"
      @click="previewOpen = true"
    />

    <AppButton
      v-if="glbUrl"
      :href="glbUrl"
      download
      variant="subtle"
      size="icon-xs"
      tooltip="Download GLB"
      :icon="IconDownload"
    />

    <AppButton
      v-if="stlUrl"
      :href="stlUrl"
      download
      variant="subtle"
      size="xs"
      tooltip="Download STL"
      :icon="IconDownload"
      label="STL"
    />

    <AppButton
      v-if="canResume && isAiEnabled"
      :to="resumeTo"
      variant="subtle"
      size="icon-xs"
      tooltip="Resume"
      :icon="IconRefresh"
    />

    <AppButton
      variant="subtle"
      tone="danger"
      size="icon-xs"
      class="ml-auto"
      tooltip="Delete"
      :icon="IconDelete"
      :disabled="deleting"
      @click="onDelete"
    />

    <!-- Preview modal. No `ModalHeader` — a chrome-less floating viewer, not a
         titled panel, so the dialog is named via `label` instead. -->
    <AppModal :open="previewOpen" size="md" :label="`${mini.label ?? 'Mini'} preview`" @close="previewOpen = false">
      <div class="relative w-full">
        <MiniModelViewer
          v-if="glbUrl"
          :src="glbUrl"
          :poster="thumbSrc ?? undefined"
          :alt="mini.label ?? 'Mini'"
        />
        <AiGeneratedBadge variant="chip" :provenance="{ provider: mini.provider, generatedAt: mini.created_at }" />
        <AppButton
          variant="ghost"
          shape="pill"
          size="icon-sm"
          :class="[CARD_OVERLAY_SCRIM, 'absolute top-4 right-4 text-white/70 hover:text-white']"
          :icon="IconClose"
          icon-size="lg"
          ariaLabel="Close preview"
          @click="previewOpen = false"
        />
      </div>
    </AppModal>
  </div>
</template>

<script setup lang="ts">
/**
 * What can be done with a mini: preview, download, resume, delete, and the
 * preview viewer they open. The card and the row both wear it, so the two
 * layouts offer the same things. The card's thumbnail also opens the preview,
 * which is why `previewOpen` is a model rather than local state.
 */
import { computed } from "vue";
import AiGeneratedBadge from "@/components/common/ai/AiGeneratedBadge.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import { CARD_OVERLAY_SCRIM } from "@/components/common/controls/appButtonVariants";
import MiniModelViewer from "@/components/simulacrum/MiniModelViewer.vue";
import { IconClose, IconDelete, IconDownload, IconRefresh, IconReveal } from "@/lib/icons";
import { useConfirm } from "@/composables/useConfirm";
import { useDeleteMini } from "@/composables/simulacrum/useMinis";
import { useMiniFiles } from "@/composables/simulacrum/useMiniFiles";
import { useCampaignStore } from "@/stores/campaign";
import type { Mini } from "@/types/mini.types";

const { mini } = defineProps<{ mini: Mini }>();
const previewOpen = defineModel<boolean>("previewOpen", { required: true });

const { confirm } = useConfirm();
// Resume re-enters the forge wizard, which is AI generation: hidden, not
// disabled, when the campaign's AI is off. Delete stays (it is not generation).
const campaignStore = useCampaignStore();
const isAiEnabled = computed(() => campaignStore.isAiEnabled);
const { mutateAsync: deleteMini, isPending: deleting } = useDeleteMini();

const { thumbSrc, glbUrl, stlUrl, canPreview } = useMiniFiles(() => mini);
// In-flight minis are resumable too: the server finishes the job whether or
// not anyone is watching (you paid, you get the result), and the wizard's
// sculpt step re-attaches to the wait on mount.
const canResume = computed(() =>
  ["stylizing", "image_ready", "sculpting", "downloading", "failed"].includes(mini.status),
);
const resumeTo = computed(() => ({
  path: "/minis/forge",
  query: { source: mini.source_table, id: mini.source_id, mini: mini.id },
}));

async function onDelete() {
  const ok = await confirm(
    `Delete "${mini.label ?? 'this mini'}"? This removes the 3D files permanently.`,
    { danger: true },
  );
  if (ok) await deleteMini(mini.id);
}
</script>
