<template>
  <!-- "The narrator: plain print, no name. The world, the weather, and what nobody in particular did." (Voices, 02b) -->
  <div class="relative font-fell text-base leading-relaxed text-foreground">
    <AppButton v-if="replayable" variant="ghost" size="inline" :icon="IconVolume" aria-label="Hear the narrator say this again" class="float-right ml-2" data-testid="solo-replay-narration" @click="emit('replay')" />
    <p v-for="(paragraph, index) in paragraphs" :key="index" class="not-first:mt-3 whitespace-pre-line">
      <template v-for="(run, i) in paragraph" :key="i"><strong v-if="run.strong">{{ run.text }}</strong><em v-else-if="run.em">{{ run.text }}</em><template v-else>{{ run.text }}</template></template>
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconVolume } from "@/lib/icons";
import { emphasisRuns } from "@/lib/table/solo/emphasis";

const { text, replayable = false } = defineProps<{
  text: string;
  /** The narrator's voice is on: this offers to be heard again. */
  replayable?: boolean;
}>();
const emit = defineEmits<{ replay: [] }>();

// A blank line in the model's text is a paragraph break; a lone newline is left to whitespace-pre-line.
// The marks a model puts around a name or a word are drawn as print, never shown as stars (`emphasisRuns`).
const paragraphs = computed(() => text.split(/\n{2,}/).filter((p) => p.trim() !== "").map((p) => emphasisRuns(p)));
</script>
