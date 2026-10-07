<template>
  <div class="group flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/40 transition-colors">
    <QuestClockDial :label="clock.label" :segments="clock.segments" :filled="clock.filled" small />
    <AppInput
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
</template>

<script setup lang="ts">
/**
 * One clock in the quest overview's authoring list (#1011). Label and segment
 * count commit on change, not per keystroke; `filled` is never edited here (it
 * moves through `tick_quest_clock`), so a resize below the current fill is the
 * server's to refuse. The row owns its save so that a refusal can put the
 * draft back: the sync watchers below only fire when the stored value changes,
 * and a refused write changes nothing.
 */
import { ref, watch } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
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

const label = ref(clock.label);
const segments = ref(clock.segments);
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
    label.value = clock.label;
    segments.value = clock.segments;
  }
}

function commitLabel() {
  const next = label.value.trim();
  if (!next) { label.value = clock.label; return; }
  if (next !== clock.label) void save({ label: next });
}

function commitSegments() {
  const next = Math.round(segments.value);
  if (!Number.isFinite(next) || next < QUEST_CLOCK_MIN_SEGMENTS || next > QUEST_CLOCK_MAX_SEGMENTS) {
    segments.value = clock.segments;
    return;
  }
  if (next !== clock.segments) void save({ segments: next });
}
</script>
