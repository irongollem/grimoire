<template>
  <span class="inline-flex items-center gap-0.5 rounded-full bg-muted py-0.5 pl-2 pr-0.5 text-caption text-foreground">
    {{ name }}<template v-if="showRoll && answer.rolled !== null"> · {{ answer.rolled }}</template>
    <AppButton
      variant="ghost"
      size="icon-xs"
      :icon="IconClose"
      :aria-label="`Reset ${name}'s answer`"
      :tooltip="`Reset ${name}'s answer`"
      @click="emit('reset')"
    />
  </span>
</template>

<script setup lang="ts">
/** One player's answer as a small chip with the DM's reset. A roll also shows its number. */
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconClose } from "@/lib/icons";
import type { TableQuestionAnswer } from "@/types/tableQuestion.types";

defineProps<{ answer: TableQuestionAnswer; name: string; showRoll: boolean }>();
const emit = defineEmits<{ reset: [] }>();
</script>
