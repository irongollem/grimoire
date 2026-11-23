<template>
  <div class="flex flex-col gap-1.5">
    <p class="text-eyebrow uppercase text-muted-foreground">{{ who ? `Grimoire · ${who}` : "Grimoire" }}</p>
    <p v-if="text" class="whitespace-pre-line text-body text-foreground">{{ text }}</p>
    <div v-if="choices.length > 0" class="flex flex-wrap gap-1.5" role="group" aria-label="Answers">
      <AppButton
        v-for="choice in choices"
        :key="choice.label"
        variant="outline"
        size="sm"
        :disabled="answered"
        @click="emit('choose', choice)"
      >
        <span>{{ choice.label }}</span>
        <span v-if="choice.note" class="text-caption-sm font-normal text-muted-foreground">{{ choice.note }}</span>
      </AppButton>
    </div>
  </div>
</template>

<script setup lang="ts">
/** Grimoire's words, in print, under a small-caps "who" line; a question under them may carry chips. */
import type { AskChoice } from "@edge-shared/agent/askContract";
import AppButton from "@/components/common/controls/AppButton.vue";

const { text, who = null, choices = [], answered = false } = defineProps<{
  text: string;
  who?: string | null;
  choices?: AskChoice[];
  /** The DM has answered; the chips stay as a record of what was offered but no longer press. */
  answered?: boolean;
}>();
const emit = defineEmits<{ choose: [choice: AskChoice] }>();
</script>
