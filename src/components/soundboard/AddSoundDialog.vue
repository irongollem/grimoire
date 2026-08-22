<template>
  <AppModal :open="open" size="md" @close="$emit('close')">
    <ModalHeader
      title="Add Sound"
      :icon="IconMusic"
      tone="gold"
      closeable
      @close="$emit('close')"
    />

    <!-- Body. `SoundForm` is the largest form in the app — name, file, category,
         tags, trim, provider — so this scrolls or the shell's viewport cap
         swallows its Save button. -->
    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
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
import { IconMusic } from '@/lib/icons';
import SoundForm from "./SoundForm.vue";
import AppModal from "@/components/common/AppModal.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";

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
