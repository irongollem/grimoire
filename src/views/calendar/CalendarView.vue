<template>
  <div>
    <PageHeader
      :title="view === 'month' ? monthTitle : 'Chronicle'"
      :description="view === 'month'
        ? 'The Calendar of Harptos — track days, tendays, and festival tides'
        : 'A chronicle of events across the ages of Faerûn'"
    >
      <template #actions>
        <div class="flex items-center gap-2">
          <!-- View toggle -->
          <div class="flex rounded-md border border-border overflow-hidden">
            <button
              class="px-3 py-1.5 font-cinzel text-xs font-semibold tracking-wider transition-colors"
              :class="view === 'month'
                ? 'bg-primary text-primary-foreground'
                : 'bg-card text-muted-foreground hover:text-foreground'"
              @click="calendar.setView('month')"
            >
              Month
            </button>
            <button
              class="px-3 py-1.5 font-cinzel text-xs font-semibold tracking-wider transition-colors"
              :class="view === 'timeline'
                ? 'bg-primary text-primary-foreground'
                : 'bg-card text-muted-foreground hover:text-foreground'"
              @click="calendar.setView('timeline')"
            >
              Chronicle
            </button>
          </div>

          <!-- Add event -->
          <button
            class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity"
            @click="openCreateModal"
          >
            <Plus class="h-3.5 w-3.5" />
            Add Event
          </button>
        </div>
      </template>
    </PageHeader>

    <!-- Month grid view -->
    <CalendarGrid
      v-if="view === 'month'"
      @edit-event="openEditModal"
    />

    <!-- Timeline view -->
    <CalendarTimeline
      v-else
      @edit-event="openEditModal"
    />

    <!-- Event modal -->
    <EventModal
      v-model="modalOpen"
      :edit-event="editingEvent"
      @update:model-value="onModalClose"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Plus } from 'lucide-vue-next'
import { useCalendarStore } from '@/stores/calendar'
import PageHeader from '@/components/common/PageHeader.vue'
import CalendarGrid from '@/components/calendar/CalendarGrid.vue'
import CalendarTimeline from '@/components/calendar/CalendarTimeline.vue'
import EventModal from '@/components/calendar/EventModal.vue'
import type { CalendarEvent } from '@/types/calendar.types'

const calendar = useCalendarStore()
const view = computed(() => calendar.view)

const monthTitle = computed(() => {
  const m = calendar.adapter.months.find(mo => mo.num === calendar.currentMonth)
  return m ? `${m.name}, ${calendar.currentYear} ${calendar.adapter.epochName}` : 'Calendar'
})

const modalOpen = ref(false)
const editingEvent = ref<CalendarEvent | null>(null)

function openCreateModal() {
  editingEvent.value = null
  modalOpen.value = true
}

function openEditModal(event: CalendarEvent) {
  editingEvent.value = event
  modalOpen.value = true
}

function onModalClose(open: boolean) {
  if (!open) editingEvent.value = null
}
</script>
