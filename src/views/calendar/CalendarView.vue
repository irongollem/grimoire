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
      <!-- In-game Today chip with inline date editor -->
      <div v-if="campaignStore.activeCampaignId" class="relative shrink-0">
        <button
          class="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 font-cinzel text-xs font-semibold text-foreground hover:border-primary/50 transition-colors"
          :class="showTodayEditor ? 'border-primary/60 bg-primary/5' : ''"
          @click="toggleTodayEditor"
        >
          <CalendarDays class="h-3.5 w-3.5 text-primary shrink-0" />
          <span class="hidden sm:inline">Today: </span>
          <span>{{ todayLabel }}</span>
        </button>

        <!-- Inline editor popover -->
        <div
          v-if="showTodayEditor"
          class="absolute right-0 top-full mt-1 z-30 rounded-lg border border-border bg-card shadow-lg p-3 flex flex-col gap-2 min-w-52"
        >
          <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Set In-Game Today</p>
          <div class="grid grid-cols-3 gap-1.5">
            <div class="flex flex-col gap-0.5">
              <label class="font-cinzel text-[10px] text-muted-foreground tracking-wider">Month</label>
              <input
                v-model.number="todayForm.month"
                type="number"
                min="1"
                max="12"
                class="w-full bg-background border border-border rounded px-2 py-1 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div class="flex flex-col gap-0.5">
              <label class="font-cinzel text-[10px] text-muted-foreground tracking-wider">Day</label>
              <input
                v-model.number="todayForm.day"
                type="number"
                min="1"
                max="30"
                class="w-full bg-background border border-border rounded px-2 py-1 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div class="flex flex-col gap-0.5">
              <label class="font-cinzel text-[10px] text-muted-foreground tracking-wider">Year</label>
              <input
                v-model.number="todayForm.year"
                type="number"
                class="w-full bg-background border border-border rounded px-2 py-1 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
          <div class="flex items-center gap-2 pt-0.5">
            <button
              type="button"
              :disabled="settingToday"
              class="flex-1 rounded-md bg-primary px-3 py-1.5 font-cinzel text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
              @click="saveToday"
            >
              {{ settingToday ? 'Saving…' : 'Set Today' }}
            </button>
            <button
              type="button"
              class="rounded-md border border-border px-3 py-1.5 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
              @click="showTodayEditor = false"
            >
              Cancel
            </button>
          </div>
          <p
            v-if="triggersFireMessage"
            class="font-fell text-xs text-primary italic"
          >{{ triggersFireMessage }}</p>
        </div>
      </div>

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
        Event
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
import { Plus, BookOpen, CalendarDays } from "lucide-vue-next";
import { useCalendarStore } from "@/stores/calendar";
import { useCampaignStore } from "@/stores/campaign";
import { useSetCampaignToday } from "@/composables/useCampaigns";
import { fireDueTriggers } from "@/composables/useQuests";
import { useQueryClient } from "@tanstack/vue-query";
import { SETTING_BUNDLES } from "@/data/bundles/index";
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import CalendarGrid from "@/components/calendar/CalendarGrid.vue";
import CalendarTimeline from "@/components/calendar/CalendarTimeline.vue";
import EventModal from "@/components/calendar/EventModal.vue";
import SettingBundleModal from "@/components/calendar/SettingBundleModal.vue";
import type { CalendarEvent } from "@/types/calendar.types";

const calendar = useCalendarStore();
const campaignStore = useCampaignStore();
const queryClient = useQueryClient();
const view = computed(() => calendar.view);

const monthTitle = computed(() => {
  const m = calendar.adapter.months.find((mo) => mo.num === calendar.currentMonth);
  return m ? `${m.name}, ${calendar.currentYear} ${calendar.adapter.epochName}` : "Calendar";
});

// ── Today date management ─────────────────────────────────────────────────────

const showTodayEditor = ref(false);
const settingToday = ref(false);
const triggersFireMessage = ref("");

const todayForm = ref({
  year:  campaignStore.todayYear,
  month: campaignStore.todayMonth,
  day:   campaignStore.todayDay,
});

const todayLabel = computed(() => {
  const monthObj = calendar.adapter.months.find((m) => m.num === campaignStore.todayMonth);
  const monthName = monthObj?.name ?? monthObj?.alias ?? `Month ${campaignStore.todayMonth}`;
  return `${monthName} ${campaignStore.todayDay}, ${campaignStore.todayYear}`;
});

function toggleTodayEditor() {
  if (!showTodayEditor.value) {
    todayForm.value = {
      year:  campaignStore.todayYear,
      month: campaignStore.todayMonth,
      day:   campaignStore.todayDay,
    };
  }
  showTodayEditor.value = !showTodayEditor.value;
  triggersFireMessage.value = "";
}

const { mutateAsync: setToday } = useSetCampaignToday();

async function saveToday() {
  const campaignId = campaignStore.activeCampaignId;
  if (!campaignId) return;

  settingToday.value = true;
  triggersFireMessage.value = "";

  try {
    await setToday({
      id: campaignId,
      year: todayForm.value.year,
      month: todayForm.value.month,
      day: todayForm.value.day,
    });

    const count = await fireDueTriggers(campaignId, {
      year: todayForm.value.year,
      month: todayForm.value.month,
      day: todayForm.value.day,
    });

    if (count > 0) {
      triggersFireMessage.value = `⚡ ${count} scheduled consequence${count > 1 ? "s" : ""} triggered!`;
      queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      queryClient.invalidateQueries({ queryKey: ["quest_trigger_scheduled"] });
    } else {
      showTodayEditor.value = false;
    }
  } finally {
    settingToday.value = false;
  }
}

// ── Event modal ───────────────────────────────────────────────────────────────

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
