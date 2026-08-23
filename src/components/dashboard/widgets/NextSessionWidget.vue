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
      <p class="font-cinzel text-heading-sm font-semibold text-foreground">{{ next.title }}</p>
      <p class="text-body text-muted-foreground">{{ formatted }}</p>
      <!-- The deadline is the point of this widget: prep gaps matter *because*
           Thursday is coming, and a countdown says that better than a date. -->
      <p class="mt-1 font-cinzel text-label uppercase tracking-wide" :class="daysAway <= 1 ? 'text-tone-caution' : 'text-primary'">
        {{ countdown }}
      </p>
    </div>
  </DashboardWidget>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useSessionProposals } from "@/composables/useScheduling";
import DashboardWidget from "../DashboardWidget.vue";

/** The nearest date the table has agreed on, from `session_proposals`. Distinct
 *  from the live session (#758): this is when you will next play, that is
 *  whether you are playing right now. */
const { data: proposals, isLoading } = useSessionProposals();

const next = computed(() => {
  const today = new Date().toISOString().slice(0, 10);
  return (proposals.value ?? [])
    .filter((p) => p.status !== "cancelled" && p.proposed_date >= today)
    .sort((a, b) => a.proposed_date.localeCompare(b.proposed_date))[0] ?? null;
});

const daysAway = computed(() => {
  if (!next.value) return 0;
  const then = Date.parse(`${next.value.proposed_date}T00:00:00`);
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((then - midnight) / 86_400_000);
});

const countdown = computed(() =>
  daysAway.value <= 0 ? "Today" : daysAway.value === 1 ? "Tomorrow" : `In ${daysAway.value} days`,
);

const formatted = computed(() => {
  if (!next.value) return "";
  const date = new Date(`${next.value.proposed_date}T${next.value.proposed_time ?? "00:00"}`);
  return date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })
    + (next.value.proposed_time ? ` · ${next.value.proposed_time}` : "");
});
</script>
