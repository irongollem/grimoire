<template>
  <!-- ── Compact inline mode ─────────────────────────────────────────────── -->
  <div v-if="compact" class="flex flex-col gap-2">
    <div class="flex items-start gap-2">
      <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider flex items-center gap-1 shrink-0 w-16 pt-1.5">
        <IconCalendarDays class="h-3.5 w-3.5" />Pins
      </span>
      <div class="flex-1 flex flex-wrap items-center gap-1.5 border border-border rounded-md px-3 py-1.5 min-h-8.5 bg-background">
        <template v-if="entityId && pins?.length">
          <div
            v-for="pin in pins"
            :key="pin.id"
            class="inline-flex items-center gap-1 rounded border border-border bg-muted/50 px-2 py-0.5"
          >
            <span :style="{ backgroundColor: pin.color }" class="w-1.5 h-1.5 rounded-full shrink-0" />
            <RouterLink :to="calendarRoute(pin)" class="font-fell text-xs text-foreground hover:text-primary transition-colors">
              {{ formatPin(pin) }}
            </RouterLink>
            <button type="button" class="text-muted-foreground hover:text-destructive transition-colors ml-0.5" @click="removePin(pin.id)">
              <IconClose class="h-3 w-3" />
            </button>
          </div>
        </template>
        <span v-else-if="!entityId || (!pins?.length && !showForm)" class="font-fell text-xs text-muted-foreground italic">None</span>
        <button
          v-if="entityId"
          type="button"
          class="inline-flex items-center gap-1 font-cinzel text-xs text-primary hover:opacity-80 transition-opacity ml-auto shrink-0"
          @click="showForm = !showForm"
        >
          <IconAdd class="h-3.5 w-3.5" />Pin date
        </button>
      </div>
    </div>
    <!-- Expandable form -->
    <div v-if="showForm && entityId" class="rounded-md border border-border bg-muted p-3 flex flex-col gap-3">
      <div class="flex rounded-md border border-border overflow-hidden">
        <button type="button" class="flex-1 py-1 font-cinzel text-xs font-semibold tracking-wider transition-colors"
          :class="dateType === 'regular' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'"
          @click="dateType = 'regular'">Regular Day</button>
        <button type="button" class="flex-1 py-1 font-cinzel text-xs font-semibold tracking-wider transition-colors"
          :class="dateType === 'festival' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'"
          @click="dateType = 'festival'">Festival Day</button>
      </div>
      <div v-if="dateType === 'regular'" class="grid grid-cols-3 gap-2">
        <div>
          <label class="block font-fell text-xs text-muted-foreground mb-1">Year</label>
          <input v-model.number="form.year" type="number" min="1" class="w-full bg-card border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>
        <div>
          <label class="block font-fell text-xs text-muted-foreground mb-1">Month</label>
          <select v-model.number="form.month" class="w-full bg-card border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
            <option v-for="m in adapter.months" :key="m.num" :value="m.num">{{ m.name }}</option>
          </select>
        </div>
        <div>
          <label class="block font-fell text-xs text-muted-foreground mb-1">Day</label>
          <input v-model.number="form.day" type="number" min="1" max="30" class="w-full bg-card border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>
      </div>
      <div v-else class="grid grid-cols-2 gap-2">
        <div>
          <label class="block font-fell text-xs text-muted-foreground mb-1">Year</label>
          <input v-model.number="form.year" type="number" min="1" class="w-full bg-card border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
        </div>
        <div>
          <label class="block font-fell text-xs text-muted-foreground mb-1">Festival</label>
          <select v-model="form.festival" class="w-full bg-card border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
            <option v-for="f in adapter.intercalaryDays" :key="f.name" :value="f.name">{{ f.name }}</option>
          </select>
        </div>
      </div>
      <div class="flex items-center gap-2 justify-end">
        <button type="button" class="font-cinzel text-xs text-muted-foreground hover:text-foreground transition-colors" @click="showForm = false">Cancel</button>
        <button type="button" :disabled="creating" class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-cinzel text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity" @click="pinDate">
          {{ creating ? "Pinning…" : "Pin" }}
        </button>
      </div>
    </div>
  </div>

  <!-- ── Full card mode (default) ────────────────────────────────────────── -->
  <div v-else class="rounded-lg border border-border bg-card p-5 flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <h2 class="font-cinzel text-sm font-bold text-foreground tracking-wider uppercase flex items-center gap-2">
        <IconCalendarDays class="h-4 w-4 text-muted-foreground" />
        Calendar Pins
      </h2>
      <button
        v-if="entityId"
        type="button"
        class="inline-flex items-center gap-1 font-cinzel text-xs text-primary hover:opacity-80 transition-opacity"
        @click="showForm = !showForm"
      >
        <IconAdd class="h-3.5 w-3.5" />
        Pin date
      </button>
    </div>

    <p v-if="!entityId" class="font-fell text-sm text-muted-foreground italic">
      Save this {{ entityTypeLabel }} first to pin calendar dates.
    </p>

    <template v-else>
      <!-- Inline add form -->
      <div v-if="showForm" class="rounded-md border border-border bg-muted p-3 flex flex-col gap-3">
        <div class="flex rounded-md border border-border overflow-hidden">
          <button type="button" class="flex-1 py-1 font-cinzel text-xs font-semibold tracking-wider transition-colors"
            :class="dateType === 'regular' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'"
            @click="dateType = 'regular'">Regular Day</button>
          <button type="button" class="flex-1 py-1 font-cinzel text-xs font-semibold tracking-wider transition-colors"
            :class="dateType === 'festival' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'"
            @click="dateType = 'festival'">Festival Day</button>
        </div>
        <div v-if="dateType === 'regular'" class="grid grid-cols-3 gap-2">
          <div>
            <label class="block font-fell text-xs text-muted-foreground mb-1">Year</label>
            <input v-model.number="form.year" type="number" min="1" class="w-full bg-card border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div>
            <label class="block font-fell text-xs text-muted-foreground mb-1">Month</label>
            <select v-model.number="form.month" class="w-full bg-card border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
              <option v-for="m in adapter.months" :key="m.num" :value="m.num">{{ m.name }}</option>
            </select>
          </div>
          <div>
            <label class="block font-fell text-xs text-muted-foreground mb-1">Day</label>
            <input v-model.number="form.day" type="number" min="1" max="30" class="w-full bg-card border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
        </div>
        <div v-else class="grid grid-cols-2 gap-2">
          <div>
            <label class="block font-fell text-xs text-muted-foreground mb-1">Year</label>
            <input v-model.number="form.year" type="number" min="1" class="w-full bg-card border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
          </div>
          <div>
            <label class="block font-fell text-xs text-muted-foreground mb-1">Festival</label>
            <select v-model="form.festival" class="w-full bg-card border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
              <option v-for="f in adapter.intercalaryDays" :key="f.name" :value="f.name">{{ f.name }}</option>
            </select>
          </div>
        </div>
        <div class="flex items-center gap-2 justify-end">
          <button type="button" class="font-cinzel text-xs text-muted-foreground hover:text-foreground transition-colors" @click="showForm = false">Cancel</button>
          <button type="button" :disabled="creating" class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 font-cinzel text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity" @click="pinDate">
            {{ creating ? "Pinning…" : "Pin" }}
          </button>
        </div>
      </div>

      <!-- Pinned dates list -->
      <div v-if="pins?.length" class="flex flex-col gap-1.5">
        <div v-for="pin in pins" :key="pin.id" class="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2">
          <span :style="{ backgroundColor: pin.color }" class="w-2 h-2 rounded-full shrink-0" />
          <span class="font-fell text-sm text-foreground flex-1">{{ formatPin(pin) }}</span>
          <RouterLink :to="calendarRoute(pin)" class="font-cinzel text-2xs text-primary hover:opacity-80 transition-opacity shrink-0">View</RouterLink>
          <button type="button" class="text-muted-foreground hover:text-destructive transition-colors" @click="removePin(pin.id)">
            <IconClose class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <p v-else-if="!showForm" class="font-fell text-sm text-muted-foreground italic">
        No dates pinned yet.
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IconAdd, IconCalendarDays, IconClose } from '@/lib/icons';
import { useCalendarStore } from "@/stores/calendar";
import {
  useEntityCalendarEvents,
  useCreateCalendarEvent,
  useDeleteCalendarEvent,
} from "@/composables/useCalendarEvents";
import type { CalendarEvent, LinkedEntityType } from "@/types/calendar.types";

const props = defineProps<{
  entityType: LinkedEntityType;
  entityId: string | null;
  entityName: string;
  compact?: boolean;
}>();

const ENTITY_DEFAULTS: Record<LinkedEntityType, { color: string; eventType: "quest" | "encounter" | "location" }> = {
  quest:     { color: "#C9920A", eventType: "quest" },
  encounter: { color: "#7C3AED", eventType: "encounter" },
  location:  { color: "#2E7D32", eventType: "location" },
};

const calendar = useCalendarStore();
const adapter = computed(() => calendar.adapter);

const entityIdRef = computed(() => props.entityId);
const entityTypeRef = computed(() => props.entityType);

const { data: pins } = useEntityCalendarEvents(entityTypeRef, entityIdRef);
const createEvent = useCreateCalendarEvent();
const deleteEvent = useDeleteCalendarEvent();

const creating = computed(() => createEvent.isPending.value);
const showForm = ref(false);
type DateType = "regular" | "festival";
const dateType = ref<DateType>("regular");

const form = ref({
  year: calendar.currentYear,
  month: calendar.currentMonth,
  day: 1,
  festival: adapter.value.intercalaryDays[0]?.name ?? "",
});

async function pinDate() {
  if (!props.entityId) return;
  const { color, eventType } = ENTITY_DEFAULTS[props.entityType];
  await createEvent.mutateAsync({
    title: props.entityName,
    description: null,
    event_type: eventType,
    color,
    harptos_year: form.value.year,
    harptos_month: dateType.value === "regular" ? form.value.month : null,
    harptos_day: dateType.value === "regular" ? form.value.day : null,
    festival_day: dateType.value === "festival" ? form.value.festival : null,
    is_multi_day: false,
    end_year: null,
    end_month: null,
    end_day: null,
    linked_quest_id: props.entityType === "quest" ? props.entityId : null,
    linked_encounter_id: props.entityType === "encounter" ? props.entityId : null,
    linked_location_id: props.entityType === "location" ? props.entityId : null,
    travel_party_member_ids: [],
    player_visible: false,
    campaign_id: null, // injected by composable
  });
  showForm.value = false;
}

async function removePin(id: string) {
  await deleteEvent.mutateAsync(id);
}

function formatPin(pin: CalendarEvent): string {
  if (pin.festival_day) return `${pin.festival_day}, ${pin.harptos_year} ${adapter.value.epochName}`;
  if (pin.harptos_month && pin.harptos_day) {
    const month = adapter.value.months.find((m) => m.num === pin.harptos_month);
    return `Day ${pin.harptos_day}, ${month?.name ?? ""} ${pin.harptos_year} ${adapter.value.epochName}`;
  }
  return `${pin.harptos_year} ${adapter.value.epochName}`;
}

function calendarRoute(pin: CalendarEvent): string {
  return `/calendar?year=${pin.harptos_year}&month=${pin.harptos_month ?? ""}`;
}

const entityTypeLabel = computed(() =>
  props.entityType === "quest" ? "quest" :
  props.entityType === "encounter" ? "encounter" : "location"
);
</script>
