<template>
  <!-- "The narrator: plain print, no name. The world, the weather, and what nobody in particular did." (Voices, 02b) -->
  <div class="font-fell text-base leading-relaxed text-foreground">
    <p v-for="(paragraph, index) in paragraphs" :key="index" class="not-first:mt-3 whitespace-pre-line">
      <template v-for="(run, i) in paragraph" :key="i"><strong v-if="run.strong">{{ run.text }}</strong><em v-else-if="run.em">{{ run.text }}</em><template v-else>{{ run.text }}</template></template>
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { emphasisRuns } from "@/lib/table/emphasis";

const { text } = defineProps<{ text: string }>();

// A blank line in the model's text is a paragraph break; a lone newline is left to whitespace-pre-line.
// The marks a model puts around a name or a word are drawn as print, never shown as stars (`emphasisRuns`).
const paragraphs = computed(() => text.split(/\n{2,}/).filter((p) => p.trim() !== "").map((p) => emphasisRuns(p)));
</script>
