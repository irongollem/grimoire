<template>
  <div class="flex flex-wrap items-end gap-2">
    <label class="flex flex-col gap-0.5">
      <span class="text-caption text-muted-foreground">Number</span>
      <AppInput v-model.number="number" type="number" min="1" tone="card" size="md" class="w-20" />
    </label>
    <label class="flex min-w-40 flex-1 flex-col gap-0.5">
      <span class="text-caption text-muted-foreground">Title</span>
      <AppInput v-model="title" tone="card" size="md" placeholder="Optional" />
    </label>
    <label class="flex flex-col gap-0.5">
      <span class="text-caption text-muted-foreground">Played on</span>
      <VueDatePicker
        v-model="playedOn"
        :time-config="{ enableTimePicker: false }"
        :teleport="true"
        model-type="yyyy-MM-dd"
        :formats="{ input: 'yyyy-MM-dd' }"
        placeholder="Pick a day…"
        class="grimoire-datepicker grimoire-datepicker--card"
      />
    </label>
  </div>
</template>

<script lang="ts">
import type { PastSessionInput } from "@/composables/sessions/useCampaignSessions";

/** The three things a session that never went through the app needs. */
export interface PastSessionDraft {
  number: number | null;
  title: string;
  /** "YYYY-MM-DD", or "" while no day is picked. */
  playedOn: string;
}

/** The one rule: a past session needs a day. Number and title are optional. */
export function isPastSessionComplete(draft: PastSessionDraft): boolean {
  return draft.playedOn !== "";
}

/** The mutation input for a complete draft; null while no day is picked. */
export function pastSessionInput(draft: PastSessionDraft): PastSessionInput | null {
  if (!isPastSessionComplete(draft)) return null;
  return {
    number: typeof draft.number === "number" && Number.isFinite(draft.number) ? draft.number : null,
    title: draft.title.trim() || null,
    played_on: draft.playedOn,
  };
}
</script>

<script setup lang="ts">
import { computed } from "vue";
import { VueDatePicker } from "@vuepic/vue-datepicker";
import AppInput from "@/components/common/AppInput.vue";

/** The parent prefills the number (the log's next) and the day (today). */
const fields = defineModel<PastSessionDraft>({ required: true });

const number = computed<number | null>({
  get: () => fields.value.number,
  set: (n) => {
    fields.value = { ...fields.value, number: n };
  },
});
const title = computed<string>({
  get: () => fields.value.title,
  set: (t) => {
    fields.value = { ...fields.value, title: t };
  },
});

// The picker speaks null for "no day"; the draft speaks "".
const playedOn = computed<string | null>({
  get: () => (fields.value.playedOn === "" ? null : fields.value.playedOn),
  set: (day) => {
    fields.value = { ...fields.value, playedOn: day ?? "" };
  },
});
</script>
