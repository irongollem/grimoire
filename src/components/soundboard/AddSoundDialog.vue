<template>
  <AppModal :open="open" size="md" labelled-by="add-sound-title" @close="$emit('close')">
    <!-- Header -->
    <div class="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-border">
      <div class="shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-gold-500/15 text-gold-400">
        <IconMusic class="h-4.5 w-4.5" />
      </div>
      <h2 id="add-sound-title" class="font-cinzel text-sm font-bold text-foreground tracking-wide">
        Add Sound
      </h2>
      <AppButton
        variant="ghost"
        size="icon-xs"
        icon-size="md"
        class="ml-auto"
        :icon="IconClose"
        aria-label="Close"
        @click="$emit('close')"
      />
    </div>

    <!-- Body -->
    <div class="px-5 py-4">
      <SoundForm
        :page-id="pageId"
        :gemini-api-key="geminiApiKey"
        :campaign-id="campaignId"
        @saved="$emit('close')"
        @cancel="$emit('close')"
      />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { IconClose, IconMusic } from '@/lib/icons';
import SoundForm from "./SoundForm.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppModal from "@/components/common/AppModal.vue";

const { open } = defineProps<{
  open: boolean;
  pageId?: string | null;
  geminiApiKey?: string | null;
  campaignId?: string | null;
}>();

defineEmits<{
  (e: "close"): void;
}>();
</script>
