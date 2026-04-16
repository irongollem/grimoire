<template>
  <ListPageLayout
    :title="view === 'month' ? monthTitle : 'Chronicle'"
    :description="
      view === 'month'
        ? 'The Calendar of Harptos — track days, tendays, and festival tides'
        : 'A chronicle of events across the ages of Faerûn'
    "
  >
    <template #actions>
      <!-- View toggle -->
      <div class="flex rounded-md border border-border overflow-hidden shrink-0">
        <button
          class="px-3 py-1.5 font-cinzel text-xs font-semibold tracking-wider transition-colors"
          :class="
            view === 'month'
              ? 'bg-primary text-primary-foreground'
              : 'bg-card text-muted-foreground hover:text-foreground'
          "
          @click="calendar.setView('month')"
        >
          Month
        </button>
        <button
          class="px-3 py-1.5 font-cinzel text-xs font-semibold tracking-wider transition-colors"
          :class="
            view === 'timeline'
              ? 'bg-primary text-primary-foreground'
              : 'bg-card text-muted-foreground hover:text-foreground'
          "
          @click="calendar.setView('timeline')"
        >
          Chronicle
        </button>
      </div>

      <!-- Setting bundle import -->
      <button
        v-if="hasBundleForCurrentCalendar"
        class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 font-cinzel text-xs font-semibold text-foreground hover:border-primary/50 transition-colors shrink-0"
        @click="bundleModalOpen = true"
      >
        <BookOpen class="h-3.5 w-3.5" />
        <span class="hidden sm:inline">Setting Events</span>
        <span class="sm:hidden">Import</span>
      </button>

      <!-- Add event -->
      <button
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity shrink-0"
        @click="openCreateModal"
      >
        <Plus class="h-3.5 w-3.5" />
        Add Event
      </button>
    </template>

    <!-- Month grid view -->
    <CalendarGrid v-if="view === 'month'" @edit-event="openEditModal" @create-event="openCreateModalForDay" />

    <!-- Timeline view -->
    <CalendarTimeline v-else @edit-event="openEditModal" />

    <!-- Event modal -->
    <EventModal v-model="modalOpen" :edit-event="editingEvent" :initial-day="initialDay" @update:model-value="onModalClose" />

    <!-- Setting bundle import modal -->
    <SettingBundleModal v-model="bundleModalOpen" />
  </ListPageLayout>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Plus, BookOpen } from "lucide-vue-next";
import { useCalendarStore } from "@/stores/calendar";
import { SETTING_BUNDLES } from "@/data/bundles/index";
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import CalendarGrid from "@/components/calendar/CalendarGrid.vue";
import CalendarTimeline from "@/components/calendar/CalendarTimeline.vue";
import EventModal from "@/components/calendar/EventModal.vue";
import SettingBundleModal from "@/components/calendar/SettingBundleModal.vue";
import type { CalendarEvent } from "@/types/calendar.types";

const calendar = useCalendarStore();
const view = computed(() => calendar.view);

const monthTitle = computed(() => {
  const m = calendar.adapter.months.find((mo) => mo.num === calendar.currentMonth);
  return m ? `${m.name}, ${calendar.currentYear} ${calendar.adapter.epochName}` : "Calendar";
});

const modalOpen = ref(false);
const editingEvent = ref<CalendarEvent | null>(null);
const initialDay = ref<number | null>(null);
const bundleModalOpen = ref(false);

const hasBundleForCurrentCalendar = computed(
  () => calendar.activeCalendarId in SETTING_BUNDLES,
);

function openCreateModal() {
  editingEvent.value = null;
  initialDay.value = null;
  modalOpen.value = true;
}

function openCreateModalForDay(day: number) {
  editingEvent.value = null;
  initialDay.value = day;
  modalOpen.value = true;
}

function openEditModal(event: CalendarEvent) {
  editingEvent.value = event;
  modalOpen.value = true;
}

function onModalClose(open: boolean) {
  if (!open) {
    editingEvent.value = null;
    initialDay.value = null;
  }
}
</script>
