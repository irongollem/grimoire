<template>
  <div class="rounded-lg border border-border bg-muted/20 p-4 space-y-3">
    <p class="text-label-lg font-semibold text-muted-foreground">SESSION DATES</p>

    <!-- Start date -->
    <div class="space-y-1.5">
      <p class="text-caption text-muted-foreground">Start date (in-game)</p>
      <div class="flex gap-2 flex-wrap">
        <AppInput
          v-model.number="model.startYear"
          type="number"
          min="1"
          placeholder="Year"
          tone="card"
          size="body-xs"
          class="w-24"
        />
        <AppSelect v-model.number="model.startMonth" size="body">
          <option :value="null">— Month —</option>
          <option v-for="m in calendarAdapter.months" :key="m.num" :value="m.num">{{ m.name }}</option>
        </AppSelect>
        <AppInput
          v-model.number="model.startDay"
          type="number"
          min="1"
          max="30"
          placeholder="Day"
          tone="card"
          size="body-xs"
          class="w-20"
        />
      </div>
    </div>

    <!-- End date -->
    <div class="space-y-1.5">
      <p class="text-caption text-muted-foreground">End date (in-game, optional)</p>
      <div class="flex gap-2 flex-wrap">
        <AppInput
          v-model.number="model.endYear"
          type="number"
          min="1"
          placeholder="Year"
          tone="card"
          size="body-xs"
          class="w-24"
        />
        <AppSelect v-model.number="model.endMonth" size="body">
          <option :value="null">— Month —</option>
          <option v-for="m in calendarAdapter.months" :key="m.num" :value="m.num">{{ m.name }}</option>
        </AppSelect>
        <AppInput
          v-model.number="model.endDay"
          type="number"
          min="1"
          max="30"
          placeholder="Day"
          tone="card"
          size="body-xs"
          class="w-20"
        />
      </div>
    </div>

    <!-- Real-world date -->
    <div class="space-y-1.5">
      <p class="text-caption text-muted-foreground">Real-world date (optional)</p>
      <VueDatePicker
        v-model="model.realDate"
        :dark="true"
        :enable-time-picker="false"
        :teleport="true"
        model-type="yyyy-MM-dd"
        format="yyyy-MM-dd"
        placeholder="Pick real-world date…"
        class="grimoire-datepicker"
      />
    </div>

    <!-- Linked calendar event indicator -->
    <div v-if="linkedCalendarEventId" class="flex items-center gap-2 font-cinzel text-xs text-primary">
      <IconCalendarDays class="h-3 w-3" />
      Calendar event linked
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import { VueDatePicker } from "@vuepic/vue-datepicker";
import "@/assets/vendor/datepicker.css";
import { IconCalendarDays } from "@/lib/icons";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import { useNotes } from "@/composables/notes/useNotes";
import { useCalendarStore } from "@/stores/calendar";
import type { NoteSessionDates } from "@/types/notes.types";

const { isNewNote, linkedCalendarEventId } = defineProps<{
  isNewNote: boolean;
  linkedCalendarEventId: string | null;
}>();

const model = defineModel<NoteSessionDates>({ required: true });

const calendarStore = useCalendarStore();
const calendarAdapter = computed(() => calendarStore.adapter);

const { data: allNotes } = useNotes();

// ── Pre-fill start date from the last session note's end date ─────────────────
// Only applies when creating a new session note. This panel mounts exactly when
// the parent's category switches to (or starts as) "session" — v-if in
// NoteEditor — which is the same transition the original watch(category, ...)
// in NoteEditor fired on.
//
// Driven by `allNotes` rather than by mount, though, and that difference is
// load-bearing. `useNotes()` used to be called in NoteEditor's setup, so its
// query had the whole time the DM spent picking a category to resolve. Called
// here it starts at the instant the answer is needed, and a one-shot read on
// mount would see `undefined` and silently skip the prefill — which is exactly
// what happens when you land on /notes/new directly, as the dashboard's Quick
// Create and a quest's attachment panel both do, with a cold cache.
//
// `prefillDone` makes it fire at most once, so a later refetch cannot undo a
// date the DM has since cleared on purpose.
let prefillDone = false;

watch(allNotes, (notes) => {
  if (prefillDone || notes === undefined) return;
  prefillDone = true;

  if (!isNewNote) return; // editing — don't overwrite
  if (model.value.startYear !== null) return; // already set

  const sessionNotes = notes.filter(
    (n) => n.category === "session" && n.session_num !== null,
  );
  if (!sessionNotes.length) return;

  const last = sessionNotes.reduce((a, b) =>
    (a.session_num ?? 0) > (b.session_num ?? 0) ? a : b,
  );

  // Use end date if set, otherwise fall back to start date
  const prefillYear  = last.session_end_year  ?? last.session_start_year;
  const prefillMonth = last.session_end_month ?? last.session_start_month;
  const prefillDay   = last.session_end_day   ?? last.session_start_day;

  if (prefillYear !== null) {
    model.value.startYear  = prefillYear;
    model.value.startMonth = prefillMonth;
    model.value.startDay   = prefillDay;
  }
}, { immediate: true });
</script>
