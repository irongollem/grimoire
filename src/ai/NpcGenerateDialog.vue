<template>
  <!-- No backdrop dismiss: `generate()` awaits a paid call and hands the result
       to the parent — see AppModal's `backdropDismiss` docstring. -->
  <AppModal :open="visible" size="md" :backdrop-dismiss="false" @close="emit('close')">
    <ModalHeader
      title="Generate NPC with AI"
      subtitle="Describe the NPC you need. The more detail, the better the result."
      closeable
      @close="emit('close')"
    />

    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain flex flex-col gap-4 px-5 py-4">
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
        <AppCheckbox
          v-model="generateAlterEgo"
          :disabled="isGenerating || !generateImage"
          label-role="label-lg"
          label="Generate Alter Ego"
          label-tone="foreground"
          class="gap-2.5"
        />
        <p v-if="generateAlterEgo" class="text-caption text-amber-500 italic">
          ⚠ Uses 2× generation credits — a true-form portrait is generated first, then used as seed for the disguise portrait.
        </p>
        <p v-else class="text-caption text-muted-foreground italic">
          Also generate a disguised identity (name + portrait) for this NPC.
        </p>
      </div>

      <!-- Image toggle -->
      <div class="flex items-center justify-between">
        <span class="text-caption text-muted-foreground">Generate portrait art</span>
        <ToggleSwitch v-model="generateImage" aria-label="Generate portrait art" />
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
      <AppButton type="button" variant="subtle" size="sm" label="Cancel" @click="emit('close')" />
      <AppButton
        type="button"
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
import AppButton from "@/components/common/AppButton.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import AppModal from "@/components/common/AppModal.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";
import ToggleSwitch from "@/components/common/ToggleSwitch.vue";
import { IconGenerate } from '@/lib/icons';
import { AI_PROMPT_LIMIT } from "./utils";

const PROMPT_LIMIT = AI_PROMPT_LIMIT;
import { useNpcGeneration } from "./useNpcGeneration";
import { currentLoadingQuote } from "./aiGenerationState";
import type { NpcAiGenerated } from "./types";

const { visible } = defineProps<{ visible: boolean }>();

const emit = defineEmits<{
  close: [];
  generated: [result: NpcAiGenerated];
}>();

const prompt = ref("");
const generateAlterEgo = ref(false);
const generateImage = ref(true);
const { isGenerating, error, generate } = useNpcGeneration();

// The dialog now stays mounted behind AppModal's own v-if (see #816), so its
// form is reset on open rather than recreated from scratch each time. This
// also fixes a real bug: under the old v-if, closing during a generation
// unmounted the component, so `emit("generated", result)` after the awaited
// paid call landed nowhere and the credits were spent for nothing. Staying
// mounted means the component survives and the result still arrives.
watch(() => visible, (v) => {
  if (v) {
    prompt.value = "";
    generateAlterEgo.value = false;
    generateImage.value = true;
  }
});

async function run() {
  if (!prompt.value.trim()) return;
  const result = await generate(
    prompt.value.trim(),
    { generateAlterEgo: generateAlterEgo.value, generateImage: generateImage.value },
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
