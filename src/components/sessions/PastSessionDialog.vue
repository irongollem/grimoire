<template>
  <AppModal :open="open" size="sm" @close="emit('update:open', false)">
    <ModalHeader
      title="Add a past session"
      subtitle="One you played before the log, or away from the app."
      :icon="IconScrollText"
      tone="primary"
    />
    <form class="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4" @submit.prevent="onSubmit">
      <div class="space-y-1.5">
        <label for="past-session-number" class="text-label-lg font-semibold text-foreground">
          Session number <span class="font-normal text-muted-foreground">(optional)</span>
        </label>
        <AppInput id="past-session-number" v-model.number="number" type="number" size="md" placeholder="No number" />
      </div>
      <div class="space-y-1.5">
        <label for="past-session-title" class="text-label-lg font-semibold text-foreground">
          Title <span class="font-normal text-muted-foreground">(optional)</span>
        </label>
        <AppInput id="past-session-title" v-model.trim="title" size="md" placeholder="The road to Phandalin" />
      </div>
      <div class="space-y-1.5">
        <label for="past-session-date" class="text-label-lg font-semibold text-foreground">Played on</label>
        <AppInput id="past-session-date" v-model="playedOn" type="date" size="md" />
      </div>
    </form>
    <div class="flex shrink-0 justify-end gap-2 px-5 pb-5">
      <AppButton variant="subtle" size="sm" label="Cancel" @click="emit('update:open', false)" />
      <AppButton variant="primary" size="sm" :disabled="pending || playedOn === ''" label="Add session" @click="onSubmit" />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { IconScrollText } from "@/lib/icons";
import AppModal from "@/components/common/AppModal.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
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
const number = ref<number | null>(null);
const title = ref("");
const playedOn = ref("");

// Fresh each time it opens: a date typed for the last session must not
// outlive it.
watch(
  () => open,
  (isOpen) => {
    if (!isOpen) return;
    number.value = suggestedNumber;
    title.value = "";
    playedOn.value = today.value;
  },
  { immediate: true },
);

function onSubmit() {
  if (playedOn.value === "") return;
  emit("confirm", {
    number: number.value,
    title: title.value.trim() || null,
    played_on: playedOn.value,
  });
}
</script>
