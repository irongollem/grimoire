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
 * server's to refuse and the parent surfaces that error.
 */
import { ref, watch } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import { IconClose } from "@/lib/icons";
import { clockProgressLabel } from "@/lib/quests/clockDial";
import { QUEST_CLOCK_MAX_SEGMENTS, QUEST_CLOCK_MIN_SEGMENTS, type QuestClock, type QuestClockUpdate } from "@/types/quest.types";
import QuestClockDial from "./QuestClockDial.vue";

const { clock } = defineProps<{ clock: QuestClock }>();
const emit = defineEmits<{ update: [update: QuestClockUpdate]; remove: [] }>();

const label = ref(clock.label);
const segments = ref(clock.segments);
// A refetch (another device, a refused write) is the truth; the draft follows it.
watch(() => clock.label, (value) => { label.value = value; });
watch(() => clock.segments, (value) => { segments.value = value; });

function commitLabel() {
  const next = label.value.trim();
  if (!next) { label.value = clock.label; return; }
  if (next !== clock.label) emit("update", { label: next });
}

function commitSegments() {
  const next = Math.round(segments.value);
  if (!Number.isFinite(next) || next < QUEST_CLOCK_MIN_SEGMENTS || next > QUEST_CLOCK_MAX_SEGMENTS) {
    segments.value = clock.segments;
    return;
  }
  if (next !== clock.segments) emit("update", { segments: next });
}
</script>
