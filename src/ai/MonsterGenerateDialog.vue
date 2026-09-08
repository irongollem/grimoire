<template>
  <!-- No backdrop dismiss: see AppModal's `backdropDismiss` docstring (#816). -->
  <AppModal :open="visible" size="md" :backdrop-dismiss="false" @close="emit('close')">
    <ModalHeader
      title="Generate Monster with AI"
      subtitle="Describe the monster concept. Set constraints to lock specific values."
      closeable
      @close="emit('close')"
    />

    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain flex flex-col gap-4 px-5 py-4">
      <!-- Concept prompt -->
      <div class="flex flex-col gap-2">
        <label class="text-label-lg font-semibold text-muted-foreground">CONCEPT</label>
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
            class="text-caption"
            :class="prompt.length >= PROMPT_LIMIT * 0.9 ? 'text-destructive' : 'text-muted-foreground/50'"
          >{{ prompt.length }} / {{ PROMPT_LIMIT }}</span>
        </div>
      </div>

      <!-- Optional constraints -->
      <div class="flex flex-col gap-3">
        <p class="text-label-lg font-semibold text-muted-foreground">
          CONSTRAINTS <span class="font-fell normal-case tracking-normal text-muted-foreground/60 ml-1">(optional — AI fills blanks)</span>
        </p>
        <div class="grid grid-cols-3 gap-3">
          <label class="flex flex-col gap-1">
            <span class="text-caption text-muted-foreground">Challenge Rating</span>
            <AppInput
              v-model="options.challenge_rating"
              tone="filled"
              size="body"
              :disabled="isGenerating"
              placeholder="e.g. 5, 1/2"
            />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-caption text-muted-foreground">Type</span>
            <AppSelect v-model="options.monster_type" tone="filled" size="body" weight="normal" :disabled="isGenerating">
              <option value="">Any</option>
              <option v-for="t in MONSTER_TYPES" :key="t" :value="t" class="capitalize">{{ t }}</option>
            </AppSelect>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-caption text-muted-foreground">Size</span>
            <AppSelect v-model="options.size" tone="filled" size="body" weight="normal" :disabled="isGenerating">
              <option value="">Any</option>
              <option v-for="s in SIZES" :key="s" :value="s" class="capitalize">{{ s }}</option>
            </AppSelect>
          </label>
        </div>
      </div>

      <!-- Image toggle -->
      <div class="flex items-center justify-between">
        <span class="text-caption text-muted-foreground">Generate portrait art</span>
        <ToggleSwitch v-model="generateImage" size="md" aria-label="Generate portrait art" />
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
    </div>

    <!-- Actions -->
    <div v-if="!isGenerating" class="flex gap-2 justify-end items-center shrink-0 px-5 py-3 border-t border-border">
      <AppButton
        variant="outline"
        fill="muted"
        size="sm"
        label="Cancel"
        @click="emit('close')"
      />
      <AppButton
        variant="primary"
        size="sm"
        :disabled="!prompt.trim()"
        :icon="IconGenerate"
        label="Generate"
        @click="run"
      />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from "vue";
import { IconGenerate } from '@/lib/icons';
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import AppModal from "@/components/common/AppModal.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";
import ToggleSwitch from "@/components/common/ToggleSwitch.vue";
import { AI_PROMPT_LIMIT } from "./utils";

const PROMPT_LIMIT = AI_PROMPT_LIMIT;
import { useMonsterGeneration } from "./useMonsterGeneration";
import { currentLoadingQuote } from "./aiGenerationState";
import type { MonsterAiGenerated } from "./types";
import { MONSTER_SIZES as SIZES, MONSTER_TYPES } from "@/types/monster.types";

const { visible } = defineProps<{ visible: boolean }>();

const emit = defineEmits<{
  close: [];
  generated: [result: MonsterAiGenerated];
}>();

const prompt = ref("");
const options = reactive({ challenge_rating: "", monster_type: "", size: "" });
const generateImage = ref(true);
const { isGenerating, error, generate } = useMonsterGeneration();

// The dialog now stays mounted behind `visible` (AppModal owns its own v-if
// inside a Teleport, and the enter animation only plays on an `open`
// transition — a modal mounted already-open would skip it). That also fixes
// a real bug: under the old `v-if`, closing mid-generation unmounted this
// component, so the awaited paid `generate()` call resolved into nothing and
// the credits were spent for no result. Reset the form on each reopen since
// the instance is no longer recreated for us.
watch(() => visible, (v) => {
  if (v) {
    prompt.value = "";
    options.challenge_rating = "";
    options.monster_type = "";
    options.size = "";
    generateImage.value = true;
  }
});

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
  @apply bg-muted border border-border rounded-md px-3 py-1.5 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring w-full;
}
</style>
