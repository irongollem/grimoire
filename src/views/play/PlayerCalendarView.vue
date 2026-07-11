<template>
  <div class="space-y-6">
    <!-- Current date hero -->
    <div class="rounded-lg border border-border bg-card px-5 py-4 flex flex-wrap items-center gap-4">
      <IconCalendarDays class="h-8 w-8 text-primary shrink-0" />
      <div>
        <p class="font-cinzel text-xs font-semibold tracking-widest text-muted-foreground uppercase mb-0.5">
          Current In-Game Date
        </p>
        <p class="font-cinzel text-xl font-bold text-foreground">
          {{ currentDateLabel }}
        </p>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="flex justify-center py-12">
      <LoadingSpinner />
    </div>

    <template v-else>
      <!-- Chronicle timeline (primary) -->
      <div>
        <p class="font-cinzel text-xs font-semibold tracking-widest text-muted-foreground mb-3">
          CHRONICLE
        </p>
        <CalendarTimeline
          :events-override="playerEvents"
          :read-only="true"
        />
      </div>

      <!-- Month grid -->
      <div>
        <p class="font-cinzel text-xs font-semibold tracking-widest text-muted-foreground mb-3">
          CALENDAR
        </p>
        <CalendarGrid
          :events-override="playerEvents"
          :read-only="true"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconCalendarDays } from '@/lib/icons';
import { useCalendarStore } from "@/stores/calendar";
import { useCampaignStore } from "@/stores/campaign";
import { usePlayerCalendarEventsRange } from "@/composables/useCalendarEvents";
import CalendarTimeline from "@/components/calendar/CalendarTimeline.vue";
import CalendarGrid from "@/components/calendar/CalendarGrid.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";

const calendar = useCalendarStore();
const campaign = useCampaignStore();

// Fetch a 3-year window around the current year so the timeline has context
const startYear = computed(() => calendar.currentYear - 1);
const endYear = computed(() => calendar.currentYear + 1);
const { data: playerEvents, isLoading } = usePlayerCalendarEventsRange(startYear, endYear);

// The hero shows the real campaign date (campaign.todayYear/Month/Day), not the
// month-grid browsing cursor (calendar.currentYear/Month) — those are separate
// concepts and only the grid below should follow the browse cursor.
const currentDateLabel = computed(() => {
  const adapter = calendar.adapter;
  const month = adapter.months.find((m) => m.num === campaign.todayMonth);
  return `${month?.name ?? ""} ${campaign.todayDay}, ${campaign.todayYear} ${adapter.epochName}`;
});
</script>
