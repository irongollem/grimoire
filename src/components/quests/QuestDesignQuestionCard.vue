<template>
  <div class="space-y-2.5 rounded-lg border border-border bg-card p-4">
    <p v-if="aboutTitle" class="text-caption-sm text-muted-foreground/70">about {{ aboutTitle }}</p>
    <h3 class="font-cinzel text-sm font-semibold text-foreground">{{ question.question }}</h3>
    <p class="text-caption text-muted-foreground">{{ question.why }}</p>

    <div class="flex flex-wrap gap-2">
      <AppButton
        v-for="option in question.options"
        :key="option.key"
        variant="subtle"
        size="sm"
        :active="selectedOptionKey === option.key"
        :label="option.label"
        @click="selectOption(option.key)"
      />
    </div>

    <AppInput v-model="freeText" size="sm" placeholder="Something else…" />
  </div>
</template>

<script setup lang="ts">
/**
 * One open question from a quest-designer turn (#873) — a beat/fork the model
 * could not place without the DM's say-so. A selection is either an option key
 * or free text, never both: picking an option clears whatever was typed, and
 * typing clears whatever was picked (`toDesignAnswer` in designer.ts turns
 * exactly one of the two into the cumulative answer the next turn sends).
 */
import { ref, watch } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import type { QuestDesignQuestion } from "@/lib/quests/designer";

const { question, aboutTitle } = defineProps<{
  question: QuestDesignQuestion;
  aboutTitle: string | null;
}>();

const emit = defineEmits<{
  "update:selection": [selection: { optionKey: string | null; freeText: string }];
}>();

const selectedOptionKey = ref<string | null>(null);
const freeText = ref("");

function selectOption(key: string) {
  selectedOptionKey.value = key;
  freeText.value = "";
  emitSelection();
}

function emitSelection() {
  emit("update:selection", { optionKey: selectedOptionKey.value, freeText: freeText.value });
}

// Typing into "Something else…" is itself a selection — it must clear
// whichever option button was active, both visually and in what gets emitted.
watch(freeText, (value) => {
  if (value) selectedOptionKey.value = null;
  emitSelection();
});
</script>
