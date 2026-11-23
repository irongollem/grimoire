<template>
  <div class="group flex flex-col gap-1 rounded px-2 py-1.5 hover:bg-muted/40 transition-colors">
    <div class="flex items-center gap-2">
      <QuestClockDial :label="clock.label" :segments="clock.segments" :filled="clock.filled" small />
      <AppInput
        :key="`label-${redraw}`"
        v-model.lazy="label"
        tone="underline"
        size="body"
        class="min-w-0 flex-1"
        aria-label="Clock label"
        @change="commitLabel"
      />
      <label class="flex shrink-0 items-center gap-1 text-caption text-muted-foreground">
        <span>Segments</span>
        <AppInput
          :key="`segments-${redraw}`"
          v-model.lazy.number="segments"
          type="number"
          :min="QUEST_CLOCK_MIN_SEGMENTS"
          :max="QUEST_CLOCK_MAX_SEGMENTS"
          tone="muted"
          size="body-xs"
          align="right"
          class="w-16"
          aria-label="Clock segments"
          @change="commitSegments"
        />
      </label>
      <span class="w-10 shrink-0 text-right text-caption text-muted-foreground">{{ clockProgressLabel(clock.filled, clock.segments) }}</span>
      <AppButton
        variant="ghost"
        tone="danger"
        size="inline-xs"
        class="[@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        :icon="IconClose"
        aria-label="Remove clock"
        @click="emit('remove')"
      />
    </div>
    <div class="flex flex-col gap-0.5 pl-1">
      <div class="flex items-center gap-2">
        <span class="shrink-0 text-caption text-muted-foreground">Moves a force</span>
        <EntityCombobox
          :model-value="clock.moves_force_id ?? ''"
          :options="forceOptions"
          placeholder="Moves no force"
          class="min-w-0 flex-1"
          @update:model-value="setForce"
        />
      </div>
      <p class="text-caption text-muted-foreground">Ticking this clock also ticks the force's clock, with the clock's name as the reason.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * One clock in the quest overview's authoring list (#1011). Under it, "Moves a force" (#1255 item 20): the database ticks
 * that force's clock whenever this one moves, so the client only stores the tie and never writes a force tick itself. Label and segment
 * count commit on change, not per keystroke; `filled` is never edited here (it
 * moves through `tick_quest_clock`), so a resize below the current fill is the
 * server's to refuse. The row owns its save so that a refusal can put the
 * draft back: the sync watchers below only fire when the stored value changes,
 * and a refused write changes nothing.
 */
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import { useCanonEntries } from "@/composables/canon/useCanonEntries";
import { useUpdateQuestClock } from "@/composables/quests/useQuestClocks";
import { useToast } from "@/composables/useToast";
import { IconClose } from "@/lib/icons";
import { clockProgressLabel } from "@/lib/quests/clockDial";
import { QUEST_CLOCK_MAX_SEGMENTS, QUEST_CLOCK_MIN_SEGMENTS, type QuestClock, type QuestClockUpdate } from "@/types/quest.types";
import QuestClockDial from "./QuestClockDial.vue";

const { clock, questId } = defineProps<{ clock: QuestClock; questId: string }>();
const emit = defineEmits<{ remove: [] }>();

const { mutateAsync: updateClock } = useUpdateQuestClock();
const toast = useToast();

// The forces still moving, plus the one this clock already moves even if it has since ended, so it can be seen and cleared.
const { data: entries } = useCanonEntries();
const forceOptions = computed(() =>
  (entries.value ?? [])
    .filter((e) => e.part === "force" && (e.closed_as === null || e.id === clock.moves_force_id))
    .map((e) => ({ id: e.id, name: e.title })),
);

const label = ref(clock.label);
const segments = ref(clock.segments);
// Restoring a rejected draft to the value it already holds changes nothing Vue
// can see, so the input would keep showing what was typed; bumping this key
// redraws the inputs from the stored clock.
const redraw = ref(0);
function restoreDraft() {
  label.value = clock.label;
  segments.value = clock.segments;
  redraw.value += 1;
}
// A refetch (another device) is the truth; the draft follows it.
watch(() => clock.label, (value) => { label.value = value; });
watch(() => clock.segments, (value) => { segments.value = value; });

async function save(update: QuestClockUpdate) {
  try {
    await updateClock({ id: clock.id, questId, update });
  } catch (e: unknown) {
    // Refused (a resize at or below the current fill, a check constraint):
    // show why, and put the rejected draft back to what is stored.
    toast.error(toast.fromError(e));
    restoreDraft();
  }
}

function setForce(id: string) {
  const next = id === "" ? null : id;
  if (next !== clock.moves_force_id) void save({ moves_force_id: next });
}

function commitLabel() {
  const next = label.value.trim();
  if (!next) { restoreDraft(); return; }
  if (next !== clock.label) void save({ label: next });
}

function commitSegments() {
  const next = Math.round(segments.value);
  if (!Number.isFinite(next) || next < QUEST_CLOCK_MIN_SEGMENTS || next > QUEST_CLOCK_MAX_SEGMENTS) {
    restoreDraft();
    return;
  }
  if (next !== clock.segments) void save({ segments: next });
}
</script>
