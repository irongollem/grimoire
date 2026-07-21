<template>
  <div v-if="events.length" class="mt-6">
    <p class="font-cinzel text-xs font-semibold tracking-widest text-muted-foreground mb-3">
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
  <div v-else-if="!isLoading" class="mt-6">
    <p class="text-body text-muted-foreground italic text-center">
      No events in this period.
    </p>
  </div>
</template>

<script setup lang="ts">
import { eventColor } from "@/types/calendar.types";
import type { CalendarEvent } from "@/types/calendar.types";

const { events, readOnly = false, isLoading = false } = defineProps<{
  events: CalendarEvent[];
  readOnly?: boolean;
  isLoading?: boolean;
  formatEventDate: (event: CalendarEvent) => string;
}>();

const emit = defineEmits<{
  "edit-event": [event: CalendarEvent];
}>();
</script>
