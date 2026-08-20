<template>
  <ListPageLayout
    :title="view === 'month' ? monthTitle : 'Chronicle'"
    :description="
      view === 'month'
        ? 'The Calendar of Harptos — track days, tendays, and festival tides'
        : 'A chronicle of events across the ages of Faerûn'
    "
  >
    <template #title-suffix>
      <ManualHelpLink page="calendar-system" />
    </template>

    <template #actions>
      <!-- In-game Today chip with inline date editor -->
      <div v-if="campaignStore.activeCampaignId" class="relative shrink-0">
        <AppButton
          variant="outline"
          size="sm"
          :active="showTodayEditor"
          @click="toggleTodayEditor"
        >
          <IconCalendarDays class="h-3.5 w-3.5 text-primary shrink-0" />
          <span class="hidden sm:inline">Today: </span>
          <span>{{ todayLabel }}</span>
        </AppButton>

        <!-- Inline editor popover -->
        <div
          v-if="showTodayEditor"
          class="absolute right-0 top-full mt-1 z-30 rounded-lg border border-border bg-card shadow-lg p-3 flex flex-col gap-2 min-w-52"
        >
          <p class="text-label-lg font-semibold text-muted-foreground">Set In-Game Today</p>
          <div class="grid grid-cols-3 gap-1.5">
            <div class="flex flex-col gap-0.5">
              <label class="text-label text-muted-foreground">Month</label>
              <AppInput v-model.number="todayForm.month" type="number" min="1" max="12" size="body-xs" align="right" />
            </div>
            <div class="flex flex-col gap-0.5">
              <label class="text-label text-muted-foreground">Day</label>
              <AppInput v-model.number="todayForm.day" type="number" min="1" max="30" size="body-xs" align="right" />
            </div>
            <div class="flex flex-col gap-0.5">
              <label class="text-label text-muted-foreground">Year</label>
              <AppInput v-model.number="todayForm.year" type="number" size="body-xs" align="right" />
            </div>
          </div>
          <div class="flex items-center gap-2 pt-0.5">
            <AppButton
              variant="primary"
              size="sm"
              class="flex-1"
              :label="settingToday ? 'Saving…' : 'Set Today'"
              :disabled="settingToday"
              @click="saveToday"
            />
            <AppButton variant="subtle" size="sm" label="Cancel" @click="showTodayEditor = false" />
          </div>
          <p
            v-if="triggersFireMessage"
            class="text-caption text-primary italic"
          >{{ triggersFireMessage }}</p>
        </div>
      </div>

      <!-- View toggle -->
      <SegmentedControl
        :model-value="view"
        :options="CALENDAR_VIEW_OPTIONS"
        size="sm"
        class="shrink-0"
        @update:model-value="calendar.setView"
      />

      <!-- Setting bundle import -->
      <AppButton
        v-if="hasBundleForCurrentCalendar"
        variant="outline"
        size="sm"
        :icon="IconPopulate"
        label="Setting Events"
        mobile-label="Import"
        class="shrink-0"
        @click="bundleModalOpen = true"
      />

      <!-- Add event -->
      <AppButton
        variant="primary"
        size="sm"
        :icon="IconAdd"
        label="Event"
        class="shrink-0"
        @click="openCreateModal"
      />
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
import { IconAdd, IconCalendarDays, IconPopulate } from '@/lib/icons';
import { useCalendarStore } from "@/stores/calendar";
import { useCampaignStore } from "@/stores/campaign";
import { useSetCampaignToday } from "@/composables/useCampaigns";
import { fireDueTriggers } from "@/composables/useQuests";
import { useQueryClient } from "@tanstack/vue-query";
import { SETTING_BUNDLES } from "@/data/bundles/index";
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";
import CalendarGrid from "@/components/calendar/CalendarGrid.vue";
import CalendarTimeline from "@/components/calendar/CalendarTimeline.vue";
import EventModal from "@/components/calendar/EventModal.vue";
import SettingBundleModal from "@/components/calendar/SettingBundleModal.vue";
import type { CalendarEvent } from "@/types/calendar.types";
import type { CalendarView } from "@/stores/calendar";

const CALENDAR_VIEW_OPTIONS = [
  { value: "month", label: "Month" },
  { value: "timeline", label: "Chronicle" },
] as const satisfies ReadonlyArray<{ value: CalendarView; label: string }>;

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
