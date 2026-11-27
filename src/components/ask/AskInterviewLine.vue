<template>
  <div class="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-4 py-1.5" data-testid="interview-line">
    <span class="min-w-0 truncate text-caption font-semibold text-foreground">Telling your story</span>
    <div class="flex shrink-0 items-center gap-1">
      <AppButton variant="ghost" size="inline-caption" class="whitespace-nowrap" label="Turn this into my canon" :disabled="!canTurn" data-testid="interview-turn" @click="emit('turn')" />
      <AppButton variant="ghost" size="inline-caption" class="whitespace-nowrap" label="Leave the interview" data-testid="interview-leave" @click="emit('leave')" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The interview's place under the Familiar's header (#1282, story 8b): one slim line while the DM is telling their
 * story. Turning it into canon waits until they have said something; leaving ends the interview and keeps the thread.
 */
import AppButton from "@/components/common/controls/AppButton.vue";

const { canTurn } = defineProps<{ canTurn: boolean }>();
const emit = defineEmits<{ turn: []; leave: [] }>();
</script>
