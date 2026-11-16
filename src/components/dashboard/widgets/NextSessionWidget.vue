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
      <!-- A regular evening is not asked, so the only news about it is who
           said, unasked, that they cannot come (#1213). -->
      <p v-if="next.status === 'regular' && absent.length" class="text-caption text-tone-caution">
        {{ absent.join(", ") }} can't make it
      </p>
      <p v-else-if="next.status === 'proposed'" class="text-caption text-muted-foreground">Proposed, waiting on answers</p>
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
import { useSessionAbsences, useSessionCadence, useSessionProposals } from "@/composables/calendar/useScheduling";
import { useCampaignMembers } from "@/composables/campaign/useCampaignMembers";
import { useLocalToday } from "@/composables/calendar/useLocalToday";
import { countdownLabel, daysUntil, pickNextSession, sessionTimeRange } from "@/lib/calendar/nextSession";
import DashboardWidget from "../DashboardWidget.vue";

/** The next evening: a regular one from the cadence (#1213) or a scheduled
 *  date. Distinct from the live session (#758): this is when you will next
 *  play, that is whether you are playing right now. */
const { data: proposals, isLoading } = useSessionProposals();
const { data: cadence } = useSessionCadence();
const { data: absences } = useSessionAbsences();
const { data: members } = useCampaignMembers();

const today = useLocalToday();
const next = computed(() => pickNextSession(cadence.value, proposals.value ?? [], today.value));

const daysAway = computed(() => (next.value ? daysUntil(next.value.date, today.value) : 0));

const countdown = computed(() => countdownLabel(daysAway.value));

const formatted = computed(() => {
  if (!next.value) return "";
  const date = new Date(`${next.value.date}T12:00:00`);
  const time = sessionTimeRange(next.value);
  return date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })
    + (time ? ` · ${time}` : "");
});

const absent = computed(() => {
  const date = next.value?.date;
  if (!date) return [];
  const out = new Set((absences.value ?? []).filter((a) => a.absent_on === date).map((a) => a.user_id));
  return (members.value ?? [])
    .filter((m) => m.role === "player" && out.has(m.user_id))
    .map((m) => m.display_name || "A player");
});
</script>
