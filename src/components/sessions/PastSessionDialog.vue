<template>
  <AppModal :open="open" size="sm" @close="emit('update:open', false)">
    <ModalHeader
      title="Add a past session"
      subtitle="One you played before the log, or away from the app."
      :icon="IconScrollText"
      tone="primary"
    />
    <form class="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4" @submit.prevent="onSubmit">
      <PastSessionFields v-model="draft" />
    </form>
    <div class="flex shrink-0 justify-end gap-2 px-5 pb-5">
      <AppButton variant="subtle" size="sm" label="Cancel" @click="emit('update:open', false)" />
      <AppButton variant="primary" size="sm" :disabled="pending || !isPastSessionComplete(draft)" label="Add session" @click="onSubmit" />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { IconScrollText } from "@/lib/icons";
import AppModal from "@/components/common/overlays/AppModal.vue";
import ModalHeader from "@/components/common/overlays/ModalHeader.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import PastSessionFields, { isPastSessionComplete, pastSessionInput, type PastSessionDraft } from "@/components/sessions/PastSessionFields.vue";
import { useLocalToday } from "@/composables/calendar/useLocalToday";
import type { PastSessionInput } from "@/composables/sessions/useCampaignSessions";

const { open, suggestedNumber = null, pending = false } = defineProps<{
  open: boolean;
  /** The number the log would hand out next; the DM may clear it. */
  suggestedNumber?: number | null;
  pending?: boolean;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  confirm: [input: PastSessionInput];
}>();

const today = useLocalToday();
const draft = ref<PastSessionDraft>({ number: null, title: "", playedOn: today.value });

// Fresh each time it opens: a date typed for the last session must not
// outlive it.
watch(
  () => open,
  (isOpen) => {
    if (!isOpen) return;
    draft.value = { number: suggestedNumber, title: "", playedOn: today.value };
  },
  { immediate: true },
);

function onSubmit() {
  const input = pastSessionInput(draft.value);
  if (input !== null) emit("confirm", input);
}
</script>
