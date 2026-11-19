<template>
  <!-- Set before sitting down (the maintainer, 18 Nov 2026): the voices could only be switched on once the first
       rounds were already past, and nothing said what they cost. -->
  <section class="flex flex-col gap-3 border border-border bg-card p-4" aria-labelledby="table-settings" data-testid="table-settings">
    <h2 id="table-settings" class="text-heading-sm text-foreground">Before you sit down</h2>

    <div class="flex flex-col gap-2">
      <h3 class="text-label-lg font-semibold text-foreground">Read aloud</h3>
      <p v-if="costLine" class="text-caption text-muted-foreground" data-testid="table-voice-cost">{{ costLine }}</p>
      <p v-else-if="rates.data.value && !rates.data.value.on" class="text-caption text-muted-foreground">Voices are not switched on for this server.</p>
      <div class="flex flex-col gap-1.5">
        <AppCheckbox
          v-for="v in VOICES"
          :key="v.part"
          :model-value="voices.parts.value[v.part]"
          :label="v.label"
          :hint="v.hint"
          :disabled="rates.data.value?.on === false"
          :data-testid="`table-voice-${v.part}`"
          @update:model-value="(on: boolean) => voices.setPart(v.part, on)"
        />
      </div>
      <div class="flex flex-col items-start gap-1" data-testid="table-narrator-voice">
        <span id="table-narrator-voice-label" class="text-label text-foreground">The Narrator speaks in</span>
        <SegmentedControl
          :model-value="narrator.voice.value"
          :options="NARRATOR_VOICE_OPTIONS"
          size="sm"
          aria-labelledby="table-narrator-voice-label"
          @update:model-value="narrator.choose"
        />
        <p class="text-caption text-muted-foreground">One voice for the whole table, so a line is only ever made, and paid for, once. The man's voice tells with more feeling and costs more by the minute; the woman's is the cheaper.</p>
      </div>
    </div>

    <div class="flex flex-col gap-2">
      <h3 class="text-label-lg font-semibold text-foreground">In a conversation</h3>
      <AppCheckbox
        v-model="watches"
        label="Let the characters talk among themselves"
        hint="When the people around you are in the middle of a conversation, they go on without waiting for you, a few lines at a time, and you can step in whenever you like. Each time they go on costs what a turn costs."
        data-testid="table-watching"
      />
    </div>

    <div class="flex flex-col gap-2">
      <h3 class="text-label-lg font-semibold text-foreground">In a fight</h3>
      <AppCheckbox
        v-model="helpersQuiet"
        label="Helpers act only when something changes"
        hint="Someone with you who is no fighter takes a turn of the story every round, which costs about what a turn costs. Tick this and they act only when they are hurt, you go down or get up, or you speak."
        data-testid="table-helpers-quiet"
      />
      <AppCheckbox
        v-model="foesTalk"
        label="Foes speak in a fight"
        hint="An enemy with a mind and a tongue says a line when the moment earns one: it lands a hard blow, loses one of its own, is badly hurt. At most one line a round; each costs about what a turn costs."
        data-testid="table-foes-talk"
      />
    </div>
    <p class="text-caption text-muted-foreground">You can change all of this at the table: the voices in the bar, the rest under the credits.</p>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import { NARRATOR_VOICE_OPTIONS, useTableNarratorVoice } from "@/composables/table/useTableNarratorVoice";
import { useTableHelpers } from "@/composables/table/useTableHelpers";
import { useTableFoes } from "@/composables/table/useTableFoes";
import { useTableWatching } from "@/composables/table/useTableWatching";
import { useTableVoicePrefs, useTableVoiceRates } from "@/composables/table/useTableVoice";
import { voiceCostLine } from "@/lib/table/voiceCost";
import type { VoicePart } from "@/lib/table/voiceLines";

const voices = useTableVoicePrefs();
// No table yet: this is the voice the next one begins on.
const narrator = useTableNarratorVoice(null);
const rates = useTableVoiceRates();
const { quiet: helpersQuiet } = useTableHelpers();
const { talk: foesTalk } = useTableFoes();
const { watches } = useTableWatching();

const VOICES: { part: VoicePart; label: string; hint: string }[] = [
  { part: "narrator", label: "The Narrator", hint: "The narration, and what characters do." },
  { part: "characters", label: "The characters", hint: "Each in a voice of their own." },
  { part: "player", label: "Your own character", hint: "What you say aloud, read back in their voice." },
];

const costLine = computed(() => (rates.data.value ? voiceCostLine(rates.data.value) : null));
</script>
