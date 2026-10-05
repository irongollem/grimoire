<template>
  <DashboardWidget
    title="Next session"
    to="/settings?tab=scheduling"
    action-label="Scheduling →"
    :loading="isLoading"
    :empty="!next"
    empty-text="No date on the calendar yet."
    max-height="none"
  >
    <div v-if="next" class="px-4 py-3">
      <p class="text-heading-sm font-semibold text-foreground">{{ next.title }}</p>
      <p class="text-body text-muted-foreground">{{ formatted }}</p>
      <!-- The deadline is the point of this widget: prep gaps matter *because*
           Thursday is coming, and a countdown says that better than a date. -->
      <p class="mt-1 text-label uppercase" :class="daysAway <= 1 ? 'text-tone-caution' : 'text-primary'">
        {{ countdown }}
      </p>
    </div>
  </DashboardWidget>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useSessionProposals } from "@/composables/calendar/useScheduling";
import { useLocalToday } from "@/composables/calendar/useLocalToday";
import { countdownLabel, daysUntil, pickNextSession } from "@/lib/calendar/nextSession";
import DashboardWidget from "../DashboardWidget.vue";

/** The nearest date the table has agreed on, from `session_proposals`. Distinct
 *  from the live session (#758): this is when you will next play, that is
 *  whether you are playing right now. */
const { data: proposals, isLoading } = useSessionProposals();

const today = useLocalToday();
const next = computed(() => pickNextSession(proposals.value ?? [], today.value));

const daysAway = computed(() => (next.value ? daysUntil(next.value.proposed_date, today.value) : 0));

const countdown = computed(() => countdownLabel(daysAway.value));

const formatted = computed(() => {
  if (!next.value) return "";
  const date = new Date(`${next.value.proposed_date}T${next.value.proposed_time ?? "00:00"}`);
  return date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })
    + (next.value.proposed_time ? ` · ${next.value.proposed_time}` : "");
});
</script>
