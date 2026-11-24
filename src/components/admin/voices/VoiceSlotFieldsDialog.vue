<template>
  <!-- The slot a library or account voice will fill: its fields, prefilled from the voice, no design prompt. -->
  <AppModal :open="open" size="md" :label="title" @close="emit('close')">
    <form class="flex flex-col gap-4 p-5" @submit.prevent="emit('save', draft)">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h2 class="text-heading-sm font-semibold text-foreground">{{ title }}</h2>
          <p v-if="note" class="mt-0.5 text-caption text-muted-foreground">{{ note }}</p>
        </div>
        <!-- Heard while it is described: "Who it fits" is written best with the voice in your ear. -->
        <AppButton
          v-if="previewUrl"
          variant="outline"
          size="sm"
          :icon="preview.playing.value === previewUrl ? IconPause : IconPlay"
          :label="preview.playing.value === previewUrl ? 'Stop' : 'Listen'"
          @click="preview.toggle(previewUrl)"
        />
      </div>
      <VoiceFieldsForm v-model="draft" />
      <p v-if="error" role="alert" class="text-body text-destructive">{{ error }}</p>
      <div class="flex justify-end gap-2">
        <AppButton variant="outline" label="Cancel" @click="emit('close')" />
        <AppButton type="submit" variant="primary" :label="confirmLabel" :loading="saving" :disabled="draft.name.trim() === ''" />
      </div>
    </form>
  </AppModal>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import { useUrlPreview } from "@/composables/voices/useSpeechVoices";
import { IconPause, IconPlay } from "@/lib/icons";
import type { SpeechVoiceFields } from "@/types/speechVoice.types";
import VoiceFieldsForm from "./VoiceFieldsForm.vue";

const { open, initial, previewUrl = null } = defineProps<{
  open: boolean;
  title: string;
  note?: string;
  confirmLabel: string;
  initial: SpeechVoiceFields;
  saving: boolean;
  error: string | null;
  /** The voice's own free preview file, when the service has one. */
  previewUrl?: string | null;
}>();
const preview = useUrlPreview();
const emit = defineEmits<{ (e: "close"): void; (e: "save", fields: SpeechVoiceFields): void }>();

const draft = ref<SpeechVoiceFields>({ ...initial });
watch(
  () => [open, initial] as const,
  () => {
    if (open) draft.value = { ...initial };
  },
);
</script>
