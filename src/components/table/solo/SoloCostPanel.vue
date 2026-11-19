<template>
  <!-- "What this sitting has cost": the account of play, because a turn has no fixed price (Cost, 06). -->
  <div
    data-slip
    :class="['absolute top-full z-20 mt-2 flex max-h-[calc(100dvh-12rem)] w-80 max-w-[calc(100vw-2rem)] flex-col gap-2.5 overflow-y-auto p-4', side === 'left' ? 'left-0' : 'right-0']"
    role="dialog"
    aria-label="This sitting"
  >
    <span class="text-heading-sm text-foreground">This sitting</span>
    <dl class="flex flex-col">
      <div v-for="row in rows" :key="row.label" class="flex min-h-8 items-center justify-between gap-2 border-b border-dotted border-border py-1 text-body">
        <dt>{{ row.label }}</dt>
        <dd class="font-stat font-bold">{{ row.value }}</dd>
      </div>
    </dl>
    <p class="text-caption text-muted-foreground">
      A turn costs what the Narrator used to answer it: more when it looks things up, less for a short reply. You are charged one whole credit each time the total passes one.
    </p>
    <AppCheckbox
      v-model="watches"
      label="Let the characters talk among themselves"
      hint="They go on without waiting for you, a few lines at a time; you can always step in. Each time costs what a turn costs."
      data-testid="solo-watching"
    />
    <AppCheckbox
      v-model="helpersQuiet"
      label="Helpers act only when something changes"
      hint="In a fight, someone with you who is no fighter takes a turn of the story every round. Tick this and they act only when they are hurt, you go down or get up, or you speak; it saves about a turn's cost each round."
      data-testid="solo-helpers-quiet"
    />
    <AppCheckbox
      v-model="foesTalk"
      label="Foes speak in a fight"
      hint="An enemy with a mind and a tongue says a line when the moment earns one: it lands a hard blow, loses one of its own, is badly hurt. At most one line a round; each costs about what a turn costs."
      data-testid="solo-foes-talk"
    />
    <div class="flex flex-col items-start gap-1" data-testid="solo-narrator-voice">
      <span id="solo-narrator-voice-label" class="text-label text-foreground">The Narrator speaks in</span>
      <SegmentedControl
        :model-value="narratorVoice"
        :options="NARRATOR_VOICE_OPTIONS"
        size="sm"
        aria-labelledby="solo-narrator-voice-label"
        @update:model-value="(voice: NarratorVoice) => emit('narratorVoice', voice)"
      />
      <p class="text-caption text-muted-foreground">For the whole table, from the next line on. What was already read keeps the voice it was read in.</p>
    </div>
    <AppButton variant="outline" size="sm" label="Get credits" class="self-start" @click="emit('credits')" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import { NARRATOR_VOICE_OPTIONS, type NarratorVoice } from "@/composables/table/useTableNarratorVoice";
import { useTableHelpers } from "@/composables/table/useTableHelpers";
import { useTableFoes } from "@/composables/table/useTableFoes";
import { useTableWatching } from "@/composables/table/useTableWatching";

const { turns, credits, balance, side = "right" } = defineProps<{
  /** Which edge of the meter the panel hangs from; the bar picks the one that keeps it on the page. */
  side?: "left" | "right";
  turns: number;
  credits: number;
  balance: number | null;
  /** The voice this table's Narrator speaks in. */
  narratorVoice: NarratorVoice;
}>();
const emit = defineEmits<{ credits: []; narratorVoice: [voice: NarratorVoice] }>();
const { quiet: helpersQuiet } = useTableHelpers();
const { talk: foesTalk } = useTableFoes();
const { watches } = useTableWatching();

const rows = computed(() => [
  { label: "Turns played", value: String(turns) },
  { label: "Credits charged", value: String(credits) },
  ...(balance === null ? [] : [{ label: "Your balance", value: String(balance) }]),
]);
</script>
