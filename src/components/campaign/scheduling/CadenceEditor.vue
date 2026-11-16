<template>
  <div class="rounded-lg border border-border bg-card p-4 space-y-3">
    <!-- Summary -->
    <template v-if="!editing">
      <div v-if="!cadence" class="flex items-center gap-3 flex-wrap">
        <p class="flex-1 min-w-0 text-body text-muted-foreground">
          Playing on a rhythm? Set it once and only ask the table when an evening moves.
        </p>
        <AppButton variant="tinted" tone="primary" emphasis="soft" size="sm" :icon="IconRepeat" label="Set a regular rhythm" @click="startEditing" />
      </div>
      <template v-else>
        <div class="flex items-start gap-3">
          <IconRepeat class="h-4 w-4 text-primary shrink-0 mt-1" />
          <div class="flex-1 min-w-0">
            <p class="text-heading-sm font-semibold text-foreground">{{ summary }}</p>
            <p v-if="nextDates.length > 0" class="text-caption text-muted-foreground">
              Next: {{ nextDates.map(shortDate).join(", ") }}
            </p>
          </div>
          <AppButton variant="ghost" size="icon-xs" :icon="IconEdit" tooltip="Edit rhythm" @click="startEditing" />
          <AppButton variant="ghost" size="icon-xs" class="hover:text-destructive" :icon="IconDelete" tooltip="Remove rhythm" @click="askRemove" />
        </div>
      </template>
    </template>

    <!-- Form -->
    <template v-else>
      <SegmentedControl v-model="repeat" :options="REPEAT_OPTIONS" />

      <div class="grid grid-cols-2 gap-3">
        <div v-if="repeat === 'weekly'">
          <label class="block text-label text-muted-foreground mb-1">How often</label>
          <AppSelect v-model.number="everyWeeks" block aria-label="How often">
            <option v-for="o in EVERY_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
          </AppSelect>
        </div>
        <div v-else>
          <label class="block text-label text-muted-foreground mb-1">Which week</label>
          <AppSelect v-model.number="weekOfMonth" block aria-label="Which week">
            <option v-for="o in WEEK_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
          </AppSelect>
        </div>
        <div>
          <label class="block text-label text-muted-foreground mb-1">Day</label>
          <AppSelect v-model.number="weekday" block aria-label="Day">
            <option v-for="(name, i) in WEEKDAYS" :key="name" :value="i + 1">{{ name }}</option>
          </AppSelect>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-label text-muted-foreground mb-1">Start time</label>
          <VueDatePicker
            v-model="timeModel"
            time-picker
            :time-config="{ is24: true }"
            :teleport="true"
            :input-attrs="{ clearable: false }"
            placeholder="Pick a time…"
            class="grimoire-datepicker"
          />
        </div>
        <div>
          <label class="block text-label text-muted-foreground mb-1">Duration (hours)</label>
          <AppInput v-model.number="durationHours" type="number" min="0.5" step="0.5" />
        </div>
      </div>

      <div>
        <label class="block text-label text-muted-foreground mb-1">Title</label>
        <AppInput v-model="title" placeholder="Session" />
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label class="block text-label text-muted-foreground mb-1">Starts on</label>
          <VueDatePicker
            v-model="startsOn"
            :time-config="{ enableTimePicker: false }"
            :teleport="true"
            model-type="yyyy-MM-dd"
            :formats="{ input: 'yyyy-MM-dd' }"
            :input-attrs="{ clearable: false }"
            placeholder="Pick a day…"
            class="grimoire-datepicker"
          />
        </div>
        <div>
          <label class="block text-label text-muted-foreground mb-1">Ends on (optional)</label>
          <VueDatePicker
            v-model="endsOnModel"
            :time-config="{ enableTimePicker: false }"
            :teleport="true"
            model-type="yyyy-MM-dd"
            :formats="{ input: 'yyyy-MM-dd' }"
            placeholder="No end"
            class="grimoire-datepicker"
          />
        </div>
      </div>

      <p class="text-caption text-muted-foreground">
        <template v-if="previewDates.length > 0">Next evenings: {{ previewDates.map(shortDate).join(", ") }}</template>
        <template v-else>No evenings fall inside these dates.</template>
      </p>

      <div class="flex justify-end gap-2">
        <AppButton variant="subtle" size="sm" label="Cancel" @click="editing = false" />
        <AppButton variant="primary" size="sm" label="Save rhythm" :disabled="!canSave || saving" @click="save" />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * The campaign's regular rhythm (#1213): shown as a one-line summary, edited
 * in a form with an explicit Save, because changing the rule moves evenings in
 * every player's calendar and should never happen by accident.
 *
 * It owns the form and the "a new rule starts from today" rule; the parent
 * owns the mutations.
 */
import { computed, ref } from "vue";
import { VueDatePicker, type TimeModel } from "@vuepic/vue-datepicker";
import "@/assets/vendor/datepicker.css";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import { IconDelete, IconEdit, IconRepeat } from "@/lib/icons";
import { useConfirm } from "@/composables/useConfirm";
import { sessionTimeRange } from "@/lib/calendar/nextSession";
import type { SessionCadence, SessionCadenceInput, SessionProposal } from "@/types/scheduling.types";
import { describeCadence, eveningsBetween, type CadenceRule } from "@edge-shared/cadence.ts";

const { cadence, proposals, today, saving = false } = defineProps<{
  cadence: SessionCadence | null;
  proposals: readonly SessionProposal[];
  /** Local "YYYY-MM-DD". */
  today: string;
  saving?: boolean;
}>();

const emit = defineEmits<{
  (e: "save", input: SessionCadenceInput): void;
  (e: "remove"): void;
}>();

const { confirm } = useConfirm();

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const REPEAT_OPTIONS = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
] as const;
const EVERY_OPTIONS = [
  { value: 1, label: "Every week" },
  { value: 2, label: "Every other week" },
  { value: 3, label: "Every 3 weeks" },
  { value: 4, label: "Every 4 weeks" },
];
const WEEK_OPTIONS = [
  { value: 1, label: "First" },
  { value: 2, label: "Second" },
  { value: 3, label: "Third" },
  { value: 4, label: "Fourth" },
  { value: -1, label: "Last" },
];

const editing = ref(false);
const repeat = ref<"weekly" | "monthly">("weekly");
const everyWeeks = ref(1);
const weekOfMonth = ref(1);
const weekday = ref(4);
const startTime = ref("19:00");
const durationHours = ref(4);
const title = ref("Session");
const startsOn = ref("");
const endsOn = ref("");

function startEditing() {
  const c = cadence;
  repeat.value = c?.repeat ?? "weekly";
  everyWeeks.value = c?.every_weeks ?? 1;
  weekOfMonth.value = c?.week_of_month ?? 1;
  weekday.value = c?.weekday ?? 4;
  startTime.value = c ? c.start_time.slice(0, 5) : "19:00";
  durationHours.value = c ? c.duration_minutes / 60 : 4;
  title.value = c?.title ?? "Session";
  startsOn.value = c?.starts_on ?? today;
  endsOn.value = c?.ends_on ?? "";
  editing.value = true;
}

// The picker speaks {hours, minutes}; the form and the column speak "HH:mm".
const timeModel = computed<TimeModel | null>({
  get() {
    if (!startTime.value) return null;
    const [hours, minutes] = startTime.value.split(":").map(Number);
    return { hours, minutes };
  },
  set(v) {
    const pad = (n: number | string) => String(n).padStart(2, "0");
    startTime.value = v ? `${pad(v.hours)}:${pad(v.minutes)}` : "";
  },
});

// Clearing the picker gives null; the ref holds "" for "no end".
const endsOnModel = computed<string | null>({
  get: () => (endsOn.value ? endsOn.value : null),
  set: (v) => {
    endsOn.value = v ? v : "";
  },
});

const draftRule = computed<CadenceRule>(() => ({
  repeat: repeat.value,
  every_weeks: repeat.value === "weekly" ? everyWeeks.value : 1,
  weekday: weekday.value,
  week_of_month: repeat.value === "monthly" ? weekOfMonth.value : null,
  starts_on: startsOn.value || today,
  ends_on: endsOn.value ? endsOn.value : null,
}));

const canSave = computed(
  () =>
    startTime.value !== "" &&
    durationHours.value > 0 &&
    startsOn.value !== "" &&
    (endsOn.value === "" || endsOn.value >= startsOn.value),
);

const previewDates = computed(() => (canSave.value ? eveningsBetween(draftRule.value, today, null, 3) : []));

const summary = computed(() => {
  if (!cadence) return "";
  const range = sessionTimeRange({ time: cadence.start_time, durationMinutes: cadence.duration_minutes });
  return range ? `${describeCadence(cadence)} · ${range}` : describeCadence(cadence);
});

// The rule's own dates, less any evening a moved or cancelled row stands in for.
const nextDates = computed(() => {
  if (!cadence) return [];
  const replaced = new Set(proposals.flatMap((p) => (p.replaces_date ? [p.replaces_date] : [])));
  return eveningsBetween(cadence, today, null, 3 + replaced.size)
    .filter((d) => !replaced.has(d))
    .slice(0, 3);
});

function shortDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function save() {
  if (!canSave.value) return;
  const rule = draftRule.value;
  const ruleChanged =
    !!cadence &&
    (rule.repeat !== cadence.repeat ||
      rule.every_weeks !== cadence.every_weeks ||
      rule.weekday !== cadence.weekday ||
      rule.week_of_month !== cadence.week_of_month);
  // A new rule starts from today: past evenings are history and must not be
  // re-dated by it. Only when the DM left "Starts on" alone, so a date they
  // chose on purpose is kept.
  const startsFromToday = ruleChanged && cadence.starts_on < today && startsOn.value === cadence.starts_on;
  emit("save", {
    repeat: rule.repeat,
    every_weeks: rule.every_weeks,
    weekday: rule.weekday,
    week_of_month: rule.week_of_month,
    start_time: startTime.value,
    duration_minutes: Math.round(durationHours.value * 60),
    title: title.value.trim() || "Session",
    starts_on: startsFromToday ? today : startsOn.value,
    ends_on: rule.ends_on,
  });
  editing.value = false;
}

async function askRemove() {
  const ok = await confirm(
    "Evenings you have moved or cancelled stay as they are. Players will no longer see the regular evenings.",
    { title: "Remove the regular rhythm?", confirmLabel: "Remove rhythm" },
  );
  if (ok) emit("remove");
}
</script>
