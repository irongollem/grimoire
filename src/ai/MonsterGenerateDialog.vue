<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
    @click.self="emit('close')"
  >
    <div class="bg-card rounded-xl border border-border shadow-xl w-full max-w-lg flex flex-col gap-5 p-6">

      <!-- Header -->
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 class="font-cinzel font-bold text-base tracking-wide text-foreground">Generate Monster with AI</h2>
          <p class="font-fell text-xs text-muted-foreground mt-0.5 italic">
            Describe the monster concept. Set constraints to lock specific values.
          </p>
        </div>
        <button type="button" @click="emit('close')" class="shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5">
          <X class="h-4 w-4" />
        </button>
      </div>

      <!-- Concept prompt -->
      <div class="flex flex-col gap-2">
        <label class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground">CONCEPT</label>
        <textarea
          v-model="prompt"
          :disabled="isGenerating"
          :maxlength="PROMPT_LIMIT"
          rows="5"
          placeholder="e.g. A massive spider deity that dwells in the Underdark, commanding a web of fanatical cultists. It spins webs of illusion and feeds on the fears of its prey…"
          class="field-input resize-none disabled:opacity-50"
        />
        <div class="flex justify-end">
          <span
            class="font-fell text-xs"
            :class="prompt.length >= PROMPT_LIMIT * 0.9 ? 'text-destructive' : 'text-muted-foreground/50'"
          >{{ prompt.length }} / {{ PROMPT_LIMIT }}</span>
        </div>
      </div>

      <!-- Optional constraints -->
      <div class="flex flex-col gap-3">
        <p class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground">
          CONSTRAINTS <span class="font-fell normal-case tracking-normal text-muted-foreground/60 ml-1">(optional — AI fills blanks)</span>
        </p>
        <div class="grid grid-cols-3 gap-3">
          <label class="flex flex-col gap-1">
            <span class="font-fell text-xs text-muted-foreground">Challenge Rating</span>
            <input
              v-model="options.challenge_rating"
              :disabled="isGenerating"
              placeholder="e.g. 5, 1/2"
              class="field-input disabled:opacity-50"
            />
          </label>
          <label class="flex flex-col gap-1">
            <span class="font-fell text-xs text-muted-foreground">Type</span>
            <select v-model="options.monster_type" :disabled="isGenerating" class="field-input disabled:opacity-50">
              <option value="">Any</option>
              <option v-for="t in MONSTER_TYPES" :key="t" :value="t" class="capitalize">{{ t }}</option>
            </select>
          </label>
          <label class="flex flex-col gap-1">
            <span class="font-fell text-xs text-muted-foreground">Size</span>
            <select v-model="options.size" :disabled="isGenerating" class="field-input disabled:opacity-50">
              <option value="">Any</option>
              <option v-for="s in SIZES" :key="s" :value="s" class="capitalize">{{ s }}</option>
            </select>
          </label>
        </div>
      </div>

      <!-- Image toggle -->
      <div class="flex items-center justify-between">
        <span class="font-fell text-xs text-muted-foreground">Generate portrait art</span>
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
import { ref, reactive } from "vue";
import { X, Sparkles } from "lucide-vue-next";
import { AI_PROMPT_LIMIT } from "./utils";

const PROMPT_LIMIT = AI_PROMPT_LIMIT;
import { useMonsterGeneration } from "./useMonsterGeneration";
import { currentLoadingQuote } from "./aiGenerationState";
import type { MonsterAiGenerated } from "./types";
import type { MonsterType, MonsterSize } from "@/types/monster.types";

const MONSTER_TYPES: MonsterType[] = [
  "aberration", "beast", "celestial", "construct", "dragon", "elemental",
  "fey", "fiend", "giant", "humanoid", "monstrosity", "ooze", "plant", "undead",
];
const SIZES: MonsterSize[] = ["tiny", "small", "medium", "large", "huge", "gargantuan"];

const emit = defineEmits<{
  close: [];
  generated: [result: MonsterAiGenerated];
}>();

const prompt = ref("");
const options = reactive({ challenge_rating: "", monster_type: "", size: "" });
const generateImage = ref(true);
const { isGenerating, error, generate } = useMonsterGeneration();

async function run() {
  if (!prompt.value.trim()) return;
  const result = await generate(
    prompt.value.trim(),
    {
      challenge_rating: options.challenge_rating.trim() || undefined,
      monster_type: options.monster_type || undefined,
      size: options.size || undefined,
      generateImage: generateImage.value,
    },
  );
  if (result) emit("generated", result);
}
</script>

<style scoped>
@reference "@/assets/main.css";

.field-input {
  @apply bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring w-full;
}
</style>
