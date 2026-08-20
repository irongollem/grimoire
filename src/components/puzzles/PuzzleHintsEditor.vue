<template>
  <div class="rounded-lg border border-border bg-card overflow-hidden">
    <div class="px-3 py-2 border-b border-border bg-muted/20 flex items-center justify-between">
      <span class="text-label-lg font-semibold text-muted-foreground">Hints</span>
      <AppButton
        variant="link"
        size="inline-xs"
        label="+ Add Hint"
        @click="emit('add-hint')"
      />
    </div>
    <div class="p-4 space-y-3">
      <p v-if="!sortedHints.length" class="text-caption text-muted-foreground italic">
        No hints yet. Add tiered hints from subtle to obvious.
      </p>
      <div v-for="(hint, i) in sortedHints" :key="hint.order" class="flex items-start gap-2">
        <span class="shrink-0 mt-1.5 font-cinzel text-2xs font-bold text-muted-foreground w-6 text-right">{{ hint.order }}</span>
        <RichTextEditor
          :model-value="hint.text"
          :placeholder="`Hint ${hint.order}…`"
          size="sm"
          class="flex-1"
          @update:model-value="emit('update-hint-text', hint.order, $event)"
        />
        <div class="shrink-0 flex flex-col gap-0.5 mt-1">
          <AppButton
            v-if="i > 0"
            variant="ghost"
            size="inline-xs"
            :icon="IconChevronUp"
            aria-label="Move hint up"
            @click="emit('move-hint', i, -1)"
          />
          <AppButton
            v-if="i < sortedHints.length - 1"
            variant="ghost"
            size="inline-xs"
            :icon="IconChevronDown"
            aria-label="Move hint down"
            @click="emit('move-hint', i, 1)"
          />
          <AppButton
            variant="ghost"
            tone="danger"
            size="inline-xs"
            :icon="IconClose"
            aria-label="Remove hint"
            @click="emit('remove-hint', i)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconChevronDown, IconChevronUp, IconClose } from "@/lib/icons";
import type { PuzzleHint } from "@/types/puzzle.types";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import AppButton from "@/components/common/AppButton.vue";

defineProps<{
  sortedHints: PuzzleHint[];
}>();

const emit = defineEmits<{
  (e: "add-hint"): void;
  (e: "remove-hint", sortedIndex: number): void;
  (e: "move-hint", sortedIndex: number, direction: -1 | 1): void;
  (e: "update-hint-text", order: number, text: string): void;
}>();
</script>
