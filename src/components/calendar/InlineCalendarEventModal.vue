<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      @click.self="close"
    >
      <div class="bg-card border border-border rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto shadow-xl">
        <!-- Header -->
        <div class="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 class="font-cinzel text-base font-bold text-foreground">Add Calendar Event</h2>
          <button type="button" class="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none" @click="close">✕</button>
        </div>

        <!-- Form -->
        <form class="px-5 py-4 space-y-4" @submit.prevent="submit">
          <!-- Title -->
          <div>
            <label class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1">TITLE</label>
            <input
              v-model="form.title"
              required
              type="text"
              placeholder="Event name…"
              class="w-full bg-muted border border-border rounded-md px-3 py-2 font-fell text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <!-- Event type -->
          <div>
            <label class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1">TYPE</label>
            <div class="flex items-center gap-2">
              <div class="w-3 h-3 rounded-full shrink-0" :style="{ backgroundColor: form.color }" />
              <select
                v-model="form.event_type"
                class="flex-1 bg-muted border border-border rounded-md px-3 py-2 font-fell text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
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
              </select>
              <p class="font-fell text-xs text-muted-foreground italic mt-1">
                Session events are created automatically from session notes.
              </p>
            </div>
          </div>

          <!-- Date -->
          <div>
            <label class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-2">DATE</label>

            <!-- Toggle regular / festival -->
            <div class="flex rounded-md border border-border overflow-hidden mb-3">
              <button
                type="button"
                class="flex-1 py-1.5 font-cinzel text-xs font-semibold tracking-wider transition-colors"
                :class="dateType === 'regular' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'"
                @click="dateType = 'regular'"
              >Regular Day</button>
              <button
                type="button"
                class="flex-1 py-1.5 font-cinzel text-xs font-semibold tracking-wider transition-colors"
                :class="dateType === 'festival' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'"
                @click="dateType = 'festival'"
              >Festival Day</button>
            </div>

            <div v-if="dateType === 'regular'" class="grid grid-cols-3 gap-2">
              <div>
                <label class="block font-fell text-xs text-muted-foreground mb-1">Year</label>
                <input v-model.number="form.harptos_year" type="number" min="1" class="w-full bg-muted border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div>
                <label class="block font-fell text-xs text-muted-foreground mb-1">Month</label>
                <select v-model.number="form.harptos_month" class="w-full bg-muted border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
                  <option v-for="m in adapter.months" :key="m.num" :value="m.num">{{ m.name }}</option>
                </select>
              </div>
              <div>
                <label class="block font-fell text-xs text-muted-foreground mb-1">Day</label>
                <input v-model.number="form.harptos_day" type="number" min="1" max="30" class="w-full bg-muted border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
            </div>

            <div v-else class="grid grid-cols-2 gap-2">
              <div>
                <label class="block font-fell text-xs text-muted-foreground mb-1">Year</label>
                <input v-model.number="form.harptos_year" type="number" min="1" class="w-full bg-muted border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
              </div>
              <div>
                <label class="block font-fell text-xs text-muted-foreground mb-1">Festival</label>
                <select v-model="form.festival_day" class="w-full bg-muted border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
                  <option v-for="f in availableFestivals" :key="f.name" :value="f.name">{{ f.name }}</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Player visibility toggle -->
          <label class="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              v-model="form.player_visible"
              type="checkbox"
              class="rounded border-border w-4 h-4 accent-primary"
            />
            <span class="font-fell text-sm text-foreground">Visible to players</span>
          </label>

          <!-- Actions -->
          <div class="flex justify-end gap-2 pt-1">
            <button
              type="button"
              class="px-4 py-2 font-cinzel text-xs font-semibold tracking-wider text-muted-foreground hover:text-foreground border border-border rounded-md transition-colors"
              @click="close"
            >Cancel</button>
            <button
              type="submit"
              :disabled="isPending || !form.title.trim()"
              class="px-4 py-2 font-cinzel text-xs font-semibold tracking-wider bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
            >{{ isPending ? 'Creating…' : 'Insert Event' }}</button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useCalendarStore } from "@/stores/calendar";
import { useCreateCalendarEvent } from "@/composables/useCalendarEvents";
import { useCampaignStore } from "@/stores/campaign";
import { EVENT_TYPE_COLORS, eventColor } from "@/types/calendar.types";
import type { CalendarEvent, CalendarEventInsert } from "@/types/calendar.types";

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{
  "update:modelValue": [value: boolean];
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

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      form.value = defaultForm();
      dateType.value = "regular";
    }
  },
);

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
  emit("update:modelValue", false);
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
