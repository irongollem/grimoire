<template>
  <div class="flex flex-col gap-4" data-testid="world-time">
    <div class="grid gap-3 sm:grid-cols-2">
      <label class="flex flex-col gap-1">
        <span class="text-eyebrow text-muted-foreground">How the world keeps time</span>
        <AppSelect :model-value="campaign?.calendar_id ?? null" tone="filled" weight="normal" size="body" block aria-label="Calendar" @change="onCalendar">
          <option v-if="campaign?.calendar_id === null" :value="null" disabled>Choose a calendar…</option>
          <option v-for="cal in availableCalendars" :key="cal.id" :value="cal.id">{{ cal.name }}</option>
          <option value="custom">Blank calendar (make your own)…</option>
        </AppSelect>
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-eyebrow text-muted-foreground">Its weather</span>
        <AppSelect :model-value="campaign?.climate ?? 'temperate'" tone="filled" weight="normal" size="body" block aria-label="Climate" @change="onClimate">
          <option v-for="c in CLIMATES" :key="c" :value="c">{{ CLIMATE_LABELS[c] }}</option>
        </AppSelect>
        <span class="text-caption italic text-muted-foreground">Sets the weather the calendar shows; any place in the Atlas can name its own.</span>
      </label>
    </div>

    <div class="flex flex-col gap-1">
      <span class="text-eyebrow text-muted-foreground">Where it is now<template v-if="today"> · {{ today }}</template></span>
      <WorldDateField v-if="campaign" :date="{ year: campaign.current_year, month: campaign.current_month, day: campaign.current_day }" :optional="false" @change="onToday" />
    </div>

    <div v-if="campaign?.calendar_id === 'custom' && draft.calendar" class="-mx-2 max-w-3xl sm:mx-0">
      <CalendarEditor v-model="draft.calendar" />
      <AutosaveStatus :status="status" :error="saveError" paused-label="Fix the calendar to save it" />
    </div>

    <WorldPopulate :calendar-id="campaign?.calendar_id ?? null" />
  </div>
</template>

<script setup lang="ts">
/**
 * How the world keeps time (frame 11): its calendar (or one the DM makes), today's date in it, and its weather. These
 * were the Details tab's; they save themselves here, one field at a time. The custom calendar saves after a pause, and
 * not at all while the editor flags a problem with it.
 */
import { computed, reactive, watch } from "vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import AutosaveStatus from "@/components/common/feedback/AutosaveStatus.vue";
import CalendarEditor from "@/components/calendar/CalendarEditor.vue";
import WorldDateField from "./WorldDateField.vue";
import WorldPopulate from "./WorldPopulate.vue";
import { useCampaignById, useUpdateCampaign } from "@/composables/campaign/useCampaigns";
import { useAutosave } from "@/composables/useAutosave";
import { customCalendarProblem } from "@/lib/calendar/customCalendar";
import { CLIMATE_LABELS } from "@/lib/calendar/weather";
import { createDefaultCustomCalendarDef, listCalendarAdapters } from "@/settings/index";
import type { SettingCalendarDef } from "@/settings/types";
import { useCalendarStore } from "@/stores/calendar";
import { useCampaignStore } from "@/stores/campaign";
import type { Campaign, CampaignUpdate } from "@/types/campaign.types";
import { CLIMATES } from "@/types/calendar.types";
import type { WorldDate } from "@/lib/canon/canonLore";

const campaignStore = useCampaignStore();
const { mutateAsync: updateCampaign } = useUpdateCampaign();
// The live campaign row, not the store's copy: the store is set once per boot (#946).
const { data: live } = useCampaignById(() => campaignStore.activeCampaignId);
const campaign = computed<Campaign | null>(() => live.value ?? campaignStore.activeCampaign);
const availableCalendars = listCalendarAdapters();
const calendar = useCalendarStore();

const today = computed(() => {
  const c = campaign.value;
  return c ? calendar.adapter.formatDate(c.current_year, c.current_month, c.current_day, null) : "";
});

async function save(update: CampaignUpdate) {
  const c = campaign.value;
  if (!c) return;
  const updated = await updateCampaign({ id: c.id, update });
  campaignStore.switchToCampaign(updated);
}

/** A write by a select or the date: failures are toasted by the mutation, and the field shows the saved value again. */
function write(update: CampaignUpdate) {
  void save(update).catch(() => undefined);
}

function onCalendar(event: Event) {
  const id = (event.target as HTMLSelectElement).value;
  if (id === "custom") {
    write({ calendar_id: "custom", custom_calendar: campaign.value?.custom_calendar ?? createDefaultCustomCalendarDef() });
    return;
  }
  write({ calendar_id: id, custom_calendar: null });
}

function onClimate(event: Event) {
  const value = (event.target as HTMLSelectElement).value;
  const climate = CLIMATES.find((c) => c === value);
  if (climate) write({ climate });
}

function onToday(date: WorldDate) {
  if (date.year === null || date.month === null || date.day === null) return;
  write({ current_year: date.year, current_month: date.month, current_day: date.day });
}

// The custom calendar is a document the editor changes keystroke by keystroke: it autosaves after a pause.
interface CalendarDraft { calendar: SettingCalendarDef | null }
const draft = reactive<CalendarDraft>({ calendar: campaign.value?.custom_calendar ?? null });
const { status, saveError, dirty, reset } = useAutosave<CalendarDraft>({
  draft,
  initial: () => ({ calendar: campaign.value?.custom_calendar ?? null }),
  equal: (a, b) => JSON.stringify(a.calendar) === JSON.stringify(b.calendar),
  canSave: () => draft.calendar !== null && customCalendarProblem(draft.calendar) === null,
  save: (snapshot) => save({ custom_calendar: snapshot.calendar }),
});
watch(() => campaign.value?.custom_calendar, (next) => {
  if (!dirty.value) reset({ calendar: next ?? null });
});
</script>
