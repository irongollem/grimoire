<template>
  <DashboardWidget tour="dm-session" title="Session">
    <div class="px-4 py-3 flex flex-col gap-4">

      <!-- Game Day -->
      <div class="flex flex-col gap-1.5">
        <p class="font-cinzel text-2xs text-muted-foreground tracking-widest uppercase">Game Day</p>
        <template v-if="!editingDate">
          <p class="text-heading-sm font-semibold text-foreground">{{ todayFormatted }}</p>
          <div class="flex items-center gap-1.5">
            <AppButton
              variant="subtle"
              size="xs"
              label="− Day"
              :disabled="setToday.isPending.value"
              @click="advanceDay(-1)"
            />
            <AppButton
              variant="subtle"
              size="xs"
              label="+ Day"
              :disabled="setToday.isPending.value"
              @click="advanceDay(1)"
            />
            <AppButton
              variant="link"
              size="inline-xs"
              label="Edit…"
              class="ml-auto"
              @click="openDateEdit"
            />
          </div>
        </template>
        <template v-else>
          <div class="flex items-center gap-1">
            <AppInput
              v-model.number="dateForm.day"
              type="number"
              min="1"
              :max="maxDayInSelectedMonth"
              size="lg"
              align="center"
              class="w-14"
            />
            <AppSelect v-model.number="dateForm.month" size="lg" class="flex-1 min-w-0">
              <option v-for="(m, i) in calendarMonths" :key="i" :value="i + 1">{{ m.name }}</option>
            </AppSelect>
            <AppInput
              v-model.number="dateForm.year"
              type="number"
              size="lg"
              align="center"
              class="w-20"
            />
          </div>
          <div class="flex gap-1.5">
            <AppButton
              type="button"
              variant="tinted"
              tone="primary"
              emphasis="soft"
              size="xs"
              class="flex-1"
              label="Save"
              :disabled="setToday.isPending.value"
              @click="saveDate"
            />
            <AppButton
              variant="subtle"
              size="xs"
              label="Cancel"
              @click="editingDate = false"
            />
          </div>
        </template>
      </div>

      <div class="border-t border-border" />

      <!-- Current Location -->
      <div class="flex flex-col gap-1.5">
        <p class="font-cinzel text-2xs text-muted-foreground tracking-widest uppercase">Current Location</p>
        <EntityCombobox
          v-model="currentLocationId"
          :options="locationOptions"
          placeholder="Set location…"
        />
        <AppButton
          v-if="auth.isDM && currentLocationId"
          variant="ghost"
          tone="primary"
          size="inline-xs"
          class="self-start"
          :disabled="syncLocation.isPending.value"
          :label="syncLocation.isPending.value ? 'Syncing…' : 'Sync to party →'"
          @click="syncLocationToParty"
        />
      </div>

    </div>
  </DashboardWidget>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { useAllLocations } from "@/composables/useLocations";
import { useSetCampaignToday, useSetCampaignLocation } from "@/composables/useCampaigns";
import { useParty, useSyncPartyLocation } from "@/composables/useParty";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { useCalendarStore } from "@/stores/calendar";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import DashboardWidget from "../DashboardWidget.vue";

/** Where and when the campaign currently is. Distinct from the *live* session
 *  (#758): this is in-world time and place, which advances whether or not the
 *  table is sitting. */
const auth = useAuthStore();
const campaign = useCampaignStore();
const calendarStore = useCalendarStore();
const { data: locations } = useAllLocations();
const { data: party } = useParty();
const setToday = useSetCampaignToday();
const setLocation = useSetCampaignLocation();
const syncLocation = useSyncPartyLocation();

const calendarMonths = computed(() => calendarStore.adapter.months);

const todayFormatted = computed(() => {
  const monthName = calendarMonths.value[campaign.todayMonth - 1]?.name ?? "";
  return `${campaign.todayDay} ${monthName}, ${campaign.todayYear} DR`;
});

const editingDate = ref(false);
const dateForm = reactive({ year: 1495, month: 1, day: 1 });
/**
 * Asked of the adapter, not read off the month, so a Gregorian campaign can
 * actually set 29 February in a leap year. Every fantasy calendar here keeps
 * its months fixed and answers with the same `.days`; only Gregorian folds a
 * leap day into a month. See `CalendarAdapter.daysInMonth`.
 */
function daysIn(year: number, month: number): number {
  const fixed = calendarMonths.value[month - 1]?.days;
  const fromAdapter = calendarStore.adapter.daysInMonth?.(year, month);
  if (fromAdapter !== undefined) return fromAdapter;
  // A month index the adapter does not have is a corrupt stored date, not a
  // real month; 30 is the same last-resort the rest of this control uses.
  return fixed === undefined ? 30 : fixed;
}

const maxDayInSelectedMonth = computed(() => daysIn(dateForm.year, dateForm.month));

function openDateEdit() {
  dateForm.year  = campaign.todayYear;
  dateForm.month = campaign.todayMonth;
  dateForm.day   = campaign.todayDay;
  editingDate.value = true;
}

function advanceDay(delta: 1 | -1) {
  if (!campaign.activeCampaignId) return;
  const months = calendarMonths.value;
  let year  = campaign.todayYear;
  let month = campaign.todayMonth;
  let day   = campaign.todayDay + delta;
  if (day > daysIn(year, month)) {
    day = 1;
    month++;
    if (month > months.length) { month = 1; year++; }
  } else if (day < 1) {
    month--;
    if (month < 1) { month = months.length; year--; }
    day = daysIn(year, month);
  }
  setToday.mutate({ id: campaign.activeCampaignId, year, month, day });
}

function saveDate() {
  if (!campaign.activeCampaignId) return;
  setToday.mutate({ id: campaign.activeCampaignId, year: dateForm.year, month: dateForm.month, day: dateForm.day });
  editingDate.value = false;
}

const locationOptions = computed(() =>
  (locations.value ?? []).map((l) => ({ id: l.id, name: l.name })),
);

const currentLocationId = computed({
  get: () => campaign.activeCampaign?.current_location_id ?? "",
  set: (val: string) => {
    if (!campaign.activeCampaignId) return;
    setLocation.mutate({ id: campaign.activeCampaignId, locationId: val || null });
  },
});

function syncLocationToParty() {
  const memberIds = (party.value ?? []).map((m) => m.id);
  const locationId = campaign.activeCampaign?.current_location_id ?? null;
  syncLocation.mutate({ memberIds, locationId });
}
</script>
