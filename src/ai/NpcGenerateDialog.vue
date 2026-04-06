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
          <p class="font-fell text-xs text-muted-foreground mt-0.5 italic">
            Describe the NPC you need. The more detail, the better the result.
          </p>
        </div>
        <button type="button" @click="emit('close')" class="shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5">
          <X class="h-4 w-4" />
        </button>
      </div>

      <!-- Prompt input -->
      <div class="flex flex-col gap-2">
        <label class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground">YOUR PROMPT</label>
        <textarea
          v-model="prompt"
          :disabled="isGenerating"
          rows="6"
          placeholder="e.g. A grizzled dwarven blacksmith who secretly belongs to a thieves' guild. Jovial on the surface but deeply paranoid. The party has heard rumours of him dealing in stolen magical components…"
          class="field-input resize-none disabled:opacity-50"
        />
      </div>

      <!-- Error -->
      <div v-if="error" class="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2">
        <p class="font-fell text-xs text-destructive">{{ error }}</p>
      </div>

      <!-- Generating state -->
      <div v-if="isGenerating" class="flex flex-col items-center gap-3 py-6">
        <Sparkles class="h-8 w-8 text-primary animate-pulse" />
        <p class="font-fell text-sm text-muted-foreground italic">{{ currentLoadingQuote }}</p>
      </div>

      <!-- Actions -->
      <div v-else class="flex justify-end gap-2">
        <button
          type="button"
          @click="emit('close')"
          class="px-4 py-1.5 font-cinzel text-xs font-semibold tracking-wider border border-border rounded-md hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          :disabled="!prompt.trim()"
          @click="run"
          class="inline-flex items-center gap-1.5 px-4 py-1.5 font-cinzel text-xs font-semibold tracking-wider bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          <Sparkles class="h-3.5 w-3.5" />
          Generate
        </button>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { X, Sparkles } from "lucide-vue-next";
import { useNpcGeneration } from "./useNpcGeneration";
import { currentLoadingQuote } from "./aiGenerationState";
import type { NpcAiGenerated } from "./types";

const props = defineProps<{
  apiKey: string;
  settingPrompt: string;
}>();

const emit = defineEmits<{
  close: [];
  generated: [result: NpcAiGenerated];
}>();

const prompt = ref("");
const { isGenerating, error, generate } = useNpcGeneration();

async function run() {
  if (!prompt.value.trim()) return;
  const result = await generate(props.apiKey, props.settingPrompt, prompt.value.trim());
  if (result) emit("generated", result);
}
</script>
