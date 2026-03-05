<template>
  <div>
    <!-- Month navigation -->
    <div class="flex items-center justify-between mb-6">
      <button
        class="rounded-md border border-border px-3 py-1.5 font-fell text-sm text-foreground hover:bg-accent transition-colors"
        @click="calendar.prevMonth()"
      >
        ← Previous
      </button>

      <div class="text-center">
        <p class="font-cinzel text-lg font-semibold text-foreground">
          {{ currentMonthName }}
        </p>
        <p class="font-fell text-sm text-muted-foreground italic">
          {{ calendar.currentYear }} {{ calendar.adapter.epochName }}
        </p>
      </div>

      <button
        class="rounded-md border border-border px-3 py-1.5 font-fell text-sm text-foreground hover:bg-accent transition-colors"
        @click="calendar.nextMonth()"
      >
        Next →
      </button>
    </div>

    <EmptyState
      title="Calendar coming soon"
      description="The Calendar of Harptos will be rendered here, complete with festival days and campaign events."
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useCalendarStore } from '@/stores/calendar'
import EmptyState from '@/components/common/EmptyState.vue'

const calendar = useCalendarStore()

const currentMonthName = computed(() => {
  const month = calendar.adapter.months.find(m => m.num === calendar.currentMonth)
  return month ? `${month.name} — ${month.alias}` : ''
})
</script>
