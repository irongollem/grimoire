<template>
  <AppModal :open="open" size="md" @close="close">
    <ModalHeader title="Add Calendar Event" closeable @close="close" />

    <!-- Form -->
    <form class="min-h-0 flex-1 flex flex-col overflow-hidden" @submit.prevent="submit">
      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">
        <!-- Title -->
        <div>
          <label class="block text-label-lg font-semibold text-muted-foreground mb-1">TITLE</label>
          <AppInput
            v-model="form.title"
            required
            type="text"
            tone="muted"
            size="body"
            placeholder="Event name…"
          />
        </div>

        <!-- Event type -->
        <div>
          <label class="block text-label-lg font-semibold text-muted-foreground mb-1">TYPE</label>
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 rounded-full shrink-0" :style="{ backgroundColor: form.color }" />
            <AppSelect v-model="form.event_type" tone="muted" size="body" block class="min-w-0" aria-label="Event type">
              <option value="campaign">Campaign Event</option>
              <option value="world">World Event</option>
              <option value="festival">Festival</option>
              <option value="deadline">Deadline</option>
              <option value="quest">Quest</option>
              <option value="player_death">💀 Player Death</option>
              <option value="boss_fight">⚔ Boss Fight</option>
              <option value="discovery">🔍 Discovery</option>
              <option value="npc_death">🗡 NPC Death</option>
              <option value="travel">🗺 Travel</option>
            </AppSelect>
            <p class="text-caption text-muted-foreground italic mt-1">
              Session events are created automatically from session notes.
            </p>
          </div>
        </div>

        <!-- Date -->
        <div>
          <label class="block text-label-lg font-semibold text-muted-foreground mb-2">DATE</label>

          <!-- Toggle regular / festival -->
          <SegmentedControl v-model="dateType" :options="DATE_TYPE_OPTIONS" size="sm" block class="mb-3" />

          <div v-if="dateType === 'regular'" class="grid grid-cols-3 gap-2">
            <div>
              <label class="block text-caption text-muted-foreground mb-1">Year</label>
              <AppInput v-model.number="form.harptos_year" type="number" min="1" tone="muted" size="body-xs" align="right" />
            </div>
            <div>
              <label class="block text-caption text-muted-foreground mb-1">Month</label>
              <AppSelect v-model.number="form.harptos_month" tone="muted" size="body-xs" block aria-label="Month">
                <option v-for="m in adapter.months" :key="m.num" :value="m.num">{{ m.name }}</option>
              </AppSelect>
            </div>
            <div>
              <label class="block text-caption text-muted-foreground mb-1">Day</label>
              <AppInput v-model.number="form.harptos_day" type="number" min="1" max="30" tone="muted" size="body-xs" align="right" />
            </div>
          </div>

          <div v-else class="grid grid-cols-2 gap-2">
            <div>
              <label class="block text-caption text-muted-foreground mb-1">Year</label>
              <AppInput v-model.number="form.harptos_year" type="number" min="1" tone="muted" size="body-xs" align="right" />
            </div>
            <div>
              <label class="block text-caption text-muted-foreground mb-1">Festival</label>
              <AppSelect v-model="form.festival_day" tone="muted" size="body-xs" block aria-label="Festival">
                <option v-for="f in availableFestivals" :key="f.name" :value="f.name">{{ f.name }}</option>
              </AppSelect>
            </div>
          </div>
        </div>

        <!-- Player visibility toggle -->
        <AppCheckbox
          v-model="form.player_visible"
          label="Visible to players"
          class="gap-2.5 select-none"
        />
      </div>

      <!-- Actions -->
      <div class="shrink-0 flex justify-end gap-2 px-5 py-3">
        <AppButton variant="subtle" size="md" label="Cancel" @click="close" />
        <AppButton
          type="submit"
          variant="primary"
          size="md"
          :label="isPending ? 'Creating…' : 'Insert Event'"
          :disabled="isPending || !form.title.trim()"
        />
      </div>
    </form>
  </AppModal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppModal from "@/components/common/AppModal.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";
import { useCalendarStore } from "@/stores/calendar";
import { useCreateCalendarEvent } from "@/composables/calendar/useCalendarEvents";
import { useCampaignStore } from "@/stores/campaign";
import { EVENT_TYPE_COLORS, eventColor } from "@/types/calendar.types";
import type { CalendarEvent, CalendarEventInsert } from "@/types/calendar.types";

const open = defineModel<boolean>({ required: true });
const emit = defineEmits<{
  "event-created": [event: CalendarEvent];
}>();

const calendar = useCalendarStore();
const campaign = useCampaignStore();
const { mutateAsync: createEvent, isPending } = useCreateCalendarEvent();

const adapter = computed(() => calendar.adapter);
const availableFestivals = computed(() =>
  adapter.value.intercalaryDays.filter(
    (d) => !d.isLeapOnly || adapter.value.isLeapYear(form.value.harptos_year),
  ),
);

type DateType = "regular" | "festival";
const dateType = ref<DateType>("regular");
const DATE_TYPE_OPTIONS = [
  { value: "regular", label: "Regular Day" },
  { value: "festival", label: "Festival Day" },
] as const satisfies ReadonlyArray<{ value: DateType; label: string }>;

function defaultForm(): CalendarEventInsert {
  return {
    campaign_id: campaign.activeCampaignId,
    title: "",
    description: null,
    event_type: "campaign",
    color: EVENT_TYPE_COLORS["campaign"],
    harptos_year: calendar.currentYear,
    harptos_month: calendar.currentMonth,
    harptos_day: 1,
    festival_day: null,
    is_multi_day: false,
    end_year: null,
    end_month: null,
    end_day: null,
    linked_quest_id: null,
    linked_encounter_id: null,
    linked_location_id: null,
    linked_note_id: null,
    travel_party_member_ids: [],
    player_visible: false,
  };
}

const form = ref<CalendarEventInsert>(defaultForm());

watch(open, (isOpen) => {
  if (isOpen) {
    form.value = defaultForm();
    dateType.value = "regular";
  }
});

watch(dateType, (type) => {
  if (type === "festival") {
    form.value.harptos_month = null;
    form.value.harptos_day = null;
    form.value.festival_day = availableFestivals.value[0]?.name ?? null;
  } else {
    form.value.festival_day = null;
    form.value.harptos_month = calendar.currentMonth;
    form.value.harptos_day = 1;
  }
});

watch(
  () => form.value.event_type,
  (newType) => { form.value.color = eventColor({ event_type: newType }); },
);

function close() {
  open.value = false;
}

async function submit() {
  const payload: CalendarEventInsert = {
    ...form.value,
    harptos_month: dateType.value === "regular" ? form.value.harptos_month : null,
    harptos_day: dateType.value === "regular" ? form.value.harptos_day : null,
    festival_day: dateType.value === "festival" ? form.value.festival_day : null,
  };
  const created = await createEvent(payload);
  emit("event-created", created);
  close();
}
</script>
