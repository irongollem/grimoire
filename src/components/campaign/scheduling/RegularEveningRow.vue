<template>
  <div class="rounded-lg border border-border bg-card overflow-hidden">
    <div v-if="moving" class="px-4 py-3 space-y-2">
      <p class="text-caption text-muted-foreground">Move {{ whenLabel }} to:</p>
      <VueDatePicker v-model="newDatetime" :teleport="true" :min-date="minDate" placeholder="Pick a date & time…" class="grimoire-datepicker" />
      <div class="flex justify-end gap-2">
        <AppButton variant="subtle" size="sm" label="Cancel" @click="moving = false" />
        <AppButton variant="primary" size="sm" label="Move evening" :disabled="!newDatetime || busy" @click="submitMove" />
      </div>
    </div>
    <div v-else class="flex items-center gap-3 px-4 py-3 flex-wrap">
      <IconRepeat class="h-4 w-4 text-muted-foreground shrink-0" />
      <div class="flex-1 min-w-0">
        <p class="text-heading-sm font-semibold text-foreground">
          {{ evening.title }}
          <AppButton as="span" variant="chip" size="xs" label="Regular" class="ml-1 align-middle" />
        </p>
        <p class="text-caption text-muted-foreground">{{ whenLabel }}</p>
        <p v-if="absentNames.length > 0" class="text-caption text-muted-foreground">
          {{ absentNames.map((n) => `${n} can't make it`).join(", ") }}
        </p>
      </div>
      <AppButton
        v-if="playerCount > 0"
        as="span"
        size="xs"
        :variant="absentNames.length > 0 ? 'tinted' : 'chip'"
        tone="success"
        :label="`${playerCount - absentNames.length}/${playerCount} available`"
      />
      <div class="flex items-center gap-1 shrink-0">
        <AppButton variant="subtle" size="xs" :icon="IconCalendar" label="Move" :disabled="busy" @click="startMove" />
        <AppButton variant="ghost" size="xs" class="hover:text-destructive" :icon="IconRemoveEvent" label="Cancel evening" :disabled="busy" @click="emit('cancel')" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * One regular evening of the campaign's cadence (#1213), computed rather than
 * stored. Moving it asks for a new date here; the parent turns that into a
 * proposal that replaces this evening, and cancelling it is the parent's too.
 */
import { computed, ref } from "vue";
import { VueDatePicker } from "@vuepic/vue-datepicker";
import "@/assets/vendor/datepicker.css";
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconCalendar, IconRemoveEvent, IconRepeat } from "@/lib/icons";
import type { ScheduledEvening } from "@/lib/calendar/nextSession";

const { evening, whenLabel, absentNames, playerCount, busy = false } = defineProps<{
  evening: ScheduledEvening;
  whenLabel: string;
  /** Display names of the players who said they cannot make it. */
  absentNames: readonly string[];
  playerCount: number;
  busy?: boolean;
}>();

const emit = defineEmits<{
  (e: "move", to: Date): void;
  (e: "cancel"): void;
}>();

const moving = ref(false);
const newDatetime = ref<Date | null>(null);

// Date-only minimum, for the reason given on SchedulingTab's own picker.
const minDate = computed(() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
});

function startMove() {
  newDatetime.value = new Date(`${evening.date}T${evening.time ?? "19:00"}`);
  moving.value = true;
}

function submitMove() {
  if (!newDatetime.value) return;
  emit("move", newDatetime.value);
  moving.value = false;
  newDatetime.value = null;
}
</script>
