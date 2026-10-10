<template>
  <AppModal :open="soundboardUi.addSoundDialogOpen" size="md" @close="close">
    <ModalHeader
      title="Add Sound"
      :icon="IconMusic"
      tone="gold"
      closeable
      @close="close"
    />

    <!-- Body. `SoundForm` is the largest form in the app — name, file, category,
         tags, trim, provider — so this scrolls or the shell's viewport cap
         swallows its Save button. -->
    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
      <SoundForm
        :page-id="soundboardUi.addSoundPageId"
        :gemini-api-key="campaignStore.decryptedGeminiKey || null"
        :campaign-id="campaignStore.activeCampaignId"
        @saved="close"
        @cancel="close"
      />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { IconMusic } from '@/lib/icons';
import SoundForm from "./SoundForm.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import ModalHeader from "@/components/common/overlays/ModalHeader.vue";
import { useSoundboardUiStore } from "@/stores/ui/soundboard";
import { useCampaignStore } from "@/stores/campaign";

// Mounted app-wide in AiGeneratorPanels and opened through the ui store, so
// the AiGenerationBadge can reopen it from any page after a background music
// generation fails. Its content only mounts while open (AppModal's v-if), so
// SoundForm's window drop listeners never run app-wide.
const soundboardUi = useSoundboardUiStore();
const campaignStore = useCampaignStore();

function close() {
  soundboardUi.addSoundDialogOpen = false;
}
</script>
