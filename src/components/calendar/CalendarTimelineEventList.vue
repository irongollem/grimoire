<template>
  <div v-if="events.length" class="mt-6">
    <p class="text-label-lg font-semibold text-muted-foreground mb-3">
      EVENTS IN VIEW
    </p>
    <div class="space-y-1.5">
      <div
        v-for="event in events"
        :key="event.id"
        class="flex items-center gap-2 rounded-md bg-card border border-border px-3 py-2 transition-colors"
        :class="!readOnly ? 'cursor-pointer hover:border-primary/40' : ''"
        @click="!readOnly && emit('edit-event', event)"
      >
        <span
          :style="{ backgroundColor: eventColor(event) }"
          class="w-2.5 h-2.5 rounded-full shrink-0"
        />
        <span class="text-body text-foreground flex-1">{{ event.title }}</span>
        <span class="text-caption text-muted-foreground italic">{{ formatEventDate(event) }}</span>
        <span class="text-label-lg text-muted-foreground/40 uppercase">{{ event.event_type }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { eventColor } from "@/types/calendar.types";
import type { CalendarEvent } from "@/types/calendar.types";

// No empty state of its own: the timeline above already says the period is
// empty, and a second line saying so below it read as a stutter.
const { events, readOnly = false } = defineProps<{
  events: CalendarEvent[];
  readOnly?: boolean;
  formatEventDate: (event: CalendarEvent) => string;
}>();

const emit = defineEmits<{
  "edit-event": [event: CalendarEvent];
}>();
</script>
