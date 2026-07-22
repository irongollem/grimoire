<template>
  <div class="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2.5">
    <div class="flex items-center justify-between flex-wrap gap-2">
      <p class="text-label-lg font-semibold text-primary">ABILITY SCORE INCREASE</p>
      <div class="flex rounded overflow-hidden border border-primary/30 text-xs font-cinzel font-semibold">
        <button
          type="button"
          class="px-2.5 py-1 transition-colors"
          :class="mode === 'plus2plus1' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
          @click="setMode('plus2plus1')"
        >+2 / +1</button>
        <button
          type="button"
          class="px-2.5 py-1 transition-colors"
          :class="mode === 'plus1plus1plus1' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
          @click="setMode('plus1plus1plus1')"
        >+1 / +1 / +1</button>
      </div>
    </div>

    <div v-if="mode === 'plus1plus1plus1'" class="flex flex-wrap gap-2">
      <span
        v-for="key in trio"
        :key="key"
        class="px-2.5 py-1 rounded-md bg-primary/10 border border-primary/20 font-cinzel text-xs text-primary capitalize"
      >{{ key }} +1</span>
    </div>

    <div v-else class="flex flex-col gap-2">
      <p class="text-caption text-muted-foreground italic">
        Pick one ability for +2 and a different one for +1{{ mode === null ? "" : "." }}
      </p>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="key in trio"
          :key="key"
          type="button"
          class="px-2.5 py-1 rounded-md border font-cinzel text-xs font-semibold capitalize transition-colors"
          :class="badgeClass(key)"
          @click="pick(key)"
        >{{ key }}<template v-if="modelValue?.primary === abilityToSaveKey(key)"> +2</template><template v-else-if="modelValue?.secondary === abilityToSaveKey(key)"> +1</template></button>
      </div>
    </div>

    <p v-if="missingHint" class="text-caption text-amber-600 dark:text-amber-400 italic">
      {{ missingHint }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  ABILITY_TO_SAVE_KEY,
  isValidAsiChoice,
  type BackgroundAsiChoice,
  type BackgroundAsiMode,
} from "@/lib/backgroundAsi";
import type { AbilityScoreKey } from "@/types/background.types";
import type { SaveKey } from "@/types/party.types";

const { trio, modelValue = null } = defineProps<{
  trio: AbilityScoreKey[];
  modelValue?: BackgroundAsiChoice | null;
}>();

const emit = defineEmits<{ "update:modelValue": [BackgroundAsiChoice | null] }>();

const mode = computed<BackgroundAsiMode | null>(() => modelValue?.mode ?? null);
const complete = computed(() => isValidAsiChoice(modelValue, trio));

/**
 * Inline hint for a half-made 2024 ASI choice: only shown once a +2/+1 mode
 * is picked but the trio-specific abilities aren't fully chosen yet. An
 * untouched choice (no mode picked at all) is a valid "skip" — no hint.
 */
const missingHint = computed(() => {
  if (mode.value !== "plus2plus1" || complete.value) return "";
  if (!modelValue?.primary) return "Pick an ability for +2, then a different one for +1.";
  if (!modelValue?.secondary) return "Pick a different ability for +1.";
  return "Choice incomplete — pick both a +2 and a +1 ability.";
});

function abilityToSaveKey(key: AbilityScoreKey): SaveKey {
  return ABILITY_TO_SAVE_KEY[key];
}

function setMode(next: BackgroundAsiMode) {
  if (next === "plus1plus1plus1") {
    emit("update:modelValue", { mode: next });
    return;
  }
  emit("update:modelValue", { mode: next, primary: modelValue?.primary, secondary: modelValue?.secondary });
}

function badgeClass(key: AbilityScoreKey): string {
  const saveKey = abilityToSaveKey(key);
  if (modelValue?.primary === saveKey) return "border-primary bg-primary text-primary-foreground";
  if (modelValue?.secondary === saveKey) return "border-primary/60 bg-primary/20 text-primary";
  return "border-border text-muted-foreground hover:text-foreground";
}

/**
 * Cycles a trio ability through: unset → +2 (primary) → +1 (secondary, bumping
 * any previous secondary) → unset. Clicking the current primary or secondary
 * clears that slot; clicking a third ability while both slots are full replaces
 * the secondary (primary is a more deliberate choice, left alone).
 */
function pick(key: AbilityScoreKey) {
  const saveKey = abilityToSaveKey(key);
  let primary = modelValue?.primary;
  let secondary = modelValue?.secondary;
  if (primary === saveKey) primary = undefined;
  else if (secondary === saveKey) secondary = undefined;
  else if (!primary) primary = saveKey;
  else secondary = saveKey;
  emit("update:modelValue", { mode: "plus2plus1", primary, secondary });
}
</script>
