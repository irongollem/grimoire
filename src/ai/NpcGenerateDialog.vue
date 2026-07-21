<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
    @click.self="emit('close')"
  >
    <div class="bg-card rounded-xl border border-border shadow-xl w-full max-w-lg flex flex-col gap-5 p-6">

      <!-- Header -->
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 class="font-cinzel font-bold text-base tracking-wide text-foreground">Generate NPC with AI</h2>
          <p class="text-caption text-muted-foreground mt-0.5 italic">
            Describe the NPC you need. The more detail, the better the result.
          </p>
        </div>
        <button type="button" @click="emit('close')" class="shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5">
          <IconClose class="h-4 w-4" />
        </button>
      </div>

      <!-- Prompt input -->
      <div class="flex flex-col gap-2">
        <label class="text-label-lg font-semibold text-muted-foreground">YOUR PROMPT</label>
        <textarea
          v-model="prompt"
          :disabled="isGenerating"
          :maxlength="PROMPT_LIMIT"
          rows="6"
          placeholder="e.g. A grizzled dwarven blacksmith who secretly belongs to a thieves' guild. Jovial on the surface but deeply paranoid. The party has heard rumours of him dealing in stolen magical components…"
          class="field-input resize-none disabled:opacity-50"
        />
        <div class="flex justify-end">
          <span
            class="text-caption"
            :class="prompt.length >= PROMPT_LIMIT * 0.9 ? 'text-destructive' : 'text-muted-foreground/50'"
          >{{ prompt.length }} / {{ PROMPT_LIMIT }}</span>
        </div>
      </div>

      <!-- Alter ego toggle -->
      <div class="rounded-md border border-border bg-muted/30 px-3 py-2.5 flex flex-col gap-1.5">
        <label class="flex items-center gap-2.5 cursor-pointer">
          <input type="checkbox" v-model="generateAlterEgo" :disabled="isGenerating || !generateImage" class="rounded accent-primary" />
          <span class="font-cinzel text-[0.6875rem] font-semibold tracking-wider text-foreground">Generate Alter Ego</span>
        </label>
        <p v-if="generateAlterEgo" class="font-fell text-[0.6875rem] text-amber-500 italic">
          ⚠ Uses 2× generation credits — a true-form portrait is generated first, then used as seed for the disguise portrait.
        </p>
        <p v-else class="font-fell text-[0.6875rem] text-muted-foreground italic">
          Also generate a disguised identity (name + portrait) for this NPC.
        </p>
      </div>

      <!-- Image toggle -->
      <div class="flex items-center justify-between">
        <span class="text-caption text-muted-foreground">Generate portrait art</span>
        <button
          type="button"
          class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none"
          :class="generateImage ? 'bg-primary' : 'bg-muted border border-border'"
          @click="generateImage = !generateImage"
        >
          <span
            class="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm"
            :class="generateImage ? 'translate-x-4.5' : 'translate-x-0.5'"
          />
        </button>
      </div>

      <!-- Error -->
      <div v-if="error" class="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2">
        <p class="text-caption text-destructive">{{ error }}</p>
      </div>

      <!-- Generating state -->
      <div v-if="isGenerating" class="flex flex-col items-center gap-3 py-6">
        <IconGenerate class="h-8 w-8 text-primary animate-pulse" />
        <p class="text-body text-muted-foreground italic">{{ currentLoadingQuote }}</p>
      </div>

      <!-- Actions -->
      <div v-else class="flex justify-end gap-2">
        <button
          type="button"
          @click="emit('close')"
          class="px-4 py-1.5 text-label-lg font-semibold border border-border rounded-md hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          :disabled="!prompt.trim()"
          @click="run"
          class="inline-flex items-center gap-1.5 px-4 py-1.5 text-label-lg font-semibold bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          <IconGenerate class="h-3.5 w-3.5" />
          Generate
        </button>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { IconClose, IconGenerate } from '@/lib/icons';
import { AI_PROMPT_LIMIT } from "./utils";

const PROMPT_LIMIT = AI_PROMPT_LIMIT;
import { useNpcGeneration } from "./useNpcGeneration";
import { currentLoadingQuote } from "./aiGenerationState";
import type { NpcAiGenerated } from "./types";

const emit = defineEmits<{
  close: [];
  generated: [result: NpcAiGenerated];
}>();

const prompt = ref("");
const generateAlterEgo = ref(false);
const generateImage = ref(true);
const { isGenerating, error, generate } = useNpcGeneration();

async function run() {
  if (!prompt.value.trim()) return;
  const result = await generate(
    prompt.value.trim(),
    { generateAlterEgo: generateAlterEgo.value, generateImage: generateImage.value },
  );
  if (result) emit("generated", result);
}
</script>
