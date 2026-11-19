<template>
  <!-- A note read aloud (#1021 row 19): whoever may read it may hear it; only the Dungeon Master has it made, and is
       told what it costs first. Nothing is drawn for a reader of a note that was never read aloud. -->
  <section v-if="state !== 'none' || canMake" class="flex flex-col gap-2 border border-border bg-card px-3.5 py-3" aria-label="Read aloud" data-testid="note-reading">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <template v-if="state !== 'none'">
        <audio v-if="reading.audioUrl.value" :src="reading.audioUrl.value" controls autoplay class="h-9 min-w-0 max-w-full flex-1 basis-64" data-testid="note-reading-audio" />
        <AppButton v-else variant="outline" size="md" :icon="IconVolume" label="Listen" :loading="reading.busy.value === 'listen'" data-testid="note-reading-listen" @click="reading.listen(note.id)" />
      </template>
      <span v-else class="min-w-0 flex-1 basis-48 text-body text-foreground">Have this note read aloud in the Narrator's voice. Everyone it is shared with can then listen.</span>
      <AppButton
        v-if="canMake && !asking"
        variant="ghost"
        size="md"
        :label="state === 'none' ? 'Read aloud' : 'Read it again'"
        :loading="reading.busy.value === 'estimate'"
        data-testid="note-reading-ask"
        @click="ask"
      />
    </div>
    <p v-if="state === 'earlier'" class="text-caption text-muted-foreground" data-testid="note-reading-earlier">
      This note was changed after it was read aloud: the recording is of the earlier version.
    </p>

    <!-- The cost, before anything is made. -->
    <div v-if="asking && quote" class="flex flex-col gap-2 border-t border-dotted border-border pt-2" data-testid="note-reading-quote">
      <div class="flex flex-wrap items-center gap-2">
        <span id="note-reading-voice" class="text-label text-foreground">The Narrator speaks in</span>
        <SegmentedControl :model-value="voice" :options="NARRATOR_VOICE_OPTIONS" size="sm" aria-labelledby="note-reading-voice" @update:model-value="chooseVoice" />
      </div>
      <p class="text-body text-foreground">
        <template v-if="quote.has">This text has already been read in this voice. Reading it again makes nothing new and costs nothing.</template>
        <template v-else>
          Reading this note aloud costs <strong>{{ quote.credits }} {{ quote.credits === 1 ? "credit" : "credits" }}</strong>
          ({{ quote.chars.toLocaleString() }} characters, about {{ minutes }}). It is made once and kept; listening is free.
        </template>
      </p>
      <div class="flex flex-wrap items-center gap-2">
        <AppButton variant="primary" size="md" :label="makeLabel" :loading="reading.busy.value === 'make'" data-testid="note-reading-make" @click="make" />
        <AppButton variant="ghost" size="md" label="Never mind" :disabled="reading.busy.value === 'make'" @click="asking = false" />
        <span v-if="reading.busy.value === 'make'" class="text-caption text-muted-foreground">A long note takes a minute or two.</span>
      </div>
    </div>
    <p v-if="reading.problem.value" role="alert" class="text-caption text-destructive" data-testid="note-reading-problem">{{ reading.problem.value }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import { useNoteReading, type ReadingEstimate, type ReadingTransport, type ReadingVoice } from "@/composables/notes/useNoteReading";
import { NARRATOR_VOICE_OPTIONS } from "@/composables/table/useTableNarratorVoice";
import { IconVolume } from "@/lib/icons";
import { readingState, type ReadableNote } from "@/lib/notes/noteReading";

const { note, canMake = false, transport = undefined } = defineProps<{
  note: ReadableNote & { id: string; reading_voice?: ReadingVoice | null };
  /** The Dungeon Master: may have the note read aloud, and again. A reader only listens. */
  canMake?: boolean;
  /** For a test. */
  transport?: ReadingTransport;
}>();

const reading = useNoteReading(transport);
const state = computed(() => readingState(note));

const asking = ref(false);
const quote = ref<ReadingEstimate | null>(null);
const voice = ref<ReadingVoice>(note.reading_voice ?? "male");

// About 1,000 characters a minute, which is what the two demo readings came to.
const minutes = computed(() => {
  const m = Math.max(1, Math.round((quote.value ? quote.value.chars : 0) / 1000));
  return m === 1 ? "a minute" : `${m} minutes`;
});
const makeLabel = computed(() => (quote.value && !quote.value.has ? `Read aloud · ${quote.value.credits} ${quote.value.credits === 1 ? "credit" : "credits"}` : "Use that reading"));

async function ask(): Promise<void> {
  const estimate = await reading.estimate(note.id, voice.value);
  if (estimate === null) return;
  quote.value = estimate;
  asking.value = true;
}

async function chooseVoice(next: ReadingVoice): Promise<void> {
  voice.value = next;
  const estimate = await reading.estimate(note.id, next);
  if (estimate !== null) quote.value = estimate;
}

async function make(): Promise<void> {
  if (await reading.make(note.id, voice.value)) asking.value = false;
}
</script>
