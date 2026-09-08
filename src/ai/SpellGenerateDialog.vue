<template>
  <!-- No backdrop dismiss: see AppModal's `backdropDismiss` docstring (#816). -->
  <AppModal :open="visible" size="md" :backdrop-dismiss="false" @close="emit('close')">
    <ModalHeader
      title="Generate Spell with AI"
      subtitle="Describe the spell concept. Lock the level or school to constrain the result."
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
          placeholder="e.g. A cantrip that draws a faintly glowing chalk circle on the floor — anyone crossing it sees a single illusory image of their choosing for one round…"
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
        <div class="grid grid-cols-2 gap-3">
          <label class="flex flex-col gap-1">
            <span class="text-caption text-muted-foreground">Level</span>
            <AppSelect v-model="levelChoice" tone="filled" size="body" weight="normal" :disabled="isGenerating">
              <option value="">Any</option>
              <option value="0">Cantrip</option>
              <option v-for="n in 9" :key="n" :value="String(n)">{{ n }}{{ levelSuffix(n) }}</option>
            </AppSelect>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-caption text-muted-foreground">School</span>
            <AppSelect v-model="schoolChoice" tone="filled" size="body" weight="normal" :disabled="isGenerating" class="capitalize">
              <option value="">Any</option>
              <option v-for="s in SPELL_SCHOOLS" :key="s" :value="s" class="capitalize">{{ s }}</option>
            </AppSelect>
          </label>
        </div>
      </div>

      <!-- Image toggle -->
      <div class="flex items-center justify-between">
        <span class="text-caption text-muted-foreground">Generate spell-effect art</span>
        <ToggleSwitch v-model="generateImage" aria-label="Generate spell-effect art" />
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
import { ref, watch } from "vue";
import { IconGenerate } from '@/lib/icons';
import AppButton from "@/components/common/AppButton.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import AppModal from "@/components/common/AppModal.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";
import ToggleSwitch from "@/components/common/ToggleSwitch.vue";
import { AI_PROMPT_LIMIT } from "./utils";

const PROMPT_LIMIT = AI_PROMPT_LIMIT;
import { useSpellGeneration } from "./useSpellGeneration";
import { currentLoadingQuote } from "./aiGenerationState";
import type { SpellAiGenerated } from "./types";
import { SPELL_SCHOOLS, type SpellSchool } from "@/types/spell.types";

const { visible } = defineProps<{ visible: boolean }>();

const emit = defineEmits<{
  close: [];
  generated: [result: SpellAiGenerated];
}>();

const prompt = ref("");
const levelChoice = ref("");
const schoolChoice = ref<"" | SpellSchool>("");
const generateImage = ref(true);
const { isGenerating, error, generate } = useSpellGeneration();

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
    levelChoice.value = "";
    schoolChoice.value = "";
    generateImage.value = true;
  }
});

function levelSuffix(n: number): string {
  if (n === 1) return "st";
  if (n === 2) return "nd";
  if (n === 3) return "rd";
  return "th";
}

async function run() {
  if (!prompt.value.trim()) return;
  const result = await generate(prompt.value.trim(), {
    level: levelChoice.value === "" ? undefined : Number(levelChoice.value),
    school: schoolChoice.value || undefined,
    generateImage: generateImage.value,
  });
  if (result) emit("generated", result);
}
</script>

<style scoped>
@reference "@/assets/main.css";

.field-input {
  @apply bg-muted border border-border rounded-md px-3 py-1.5 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring w-full;
}
</style>
