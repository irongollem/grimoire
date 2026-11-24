<template>
  <div class="flex flex-col gap-1">
    <span class="text-label-lg font-semibold text-muted-foreground">{{ field.label }}</span>
    <!-- A model-prompt box stays a plain textarea (CLAUDE.md, Sanctioned Exceptions), set in the DM's hand. -->
    <MentionTextarea
      :aria-label="field.label"
      :model-value="modelValue"
      :items="mentionItems"
      :rows="4"
      :placeholder="field.placeholder"
      :disabled="disabled"
      hand
      input-class="w-full resize-none rounded-md border border-border bg-muted px-3 py-2 text-base leading-6 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      @update:model-value="emit('update:modelValue', $event)"
    />
    <p v-if="mentionItems.length" class="text-caption text-muted-foreground">Type @ to include an item in this {{ noun }}'s inventory.</p>
    <p :class="['ml-auto text-caption', modelValue.trim().length > (field.max ?? AI_PROMPT_LIMIT) ? 'text-destructive' : 'text-muted-foreground']">{{ modelValue.length }} / {{ field.max ?? AI_PROMPT_LIMIT }}</p>
  </div>
</template>

<script setup lang="ts">
/**
 * The card's first field when a generator's button opened it (#1270): what to make, in the DM's words. A generator whose
 * concept says `mentions: "items"` offers the catalogue's items on an @, as its panel did; the index is read only while
 * such a box is on screen. The text is the whole state: the adapter reads the mentions from it.
 */
import { computed } from "vue";
import type { AskGenerator } from "@edge-shared/agent/askContract";
import { AI_PROMPT_LIMIT } from "@/ai/utils";
import { useItemIndex } from "@/composables/items/useItemIndex";
import MentionTextarea from "@/components/common/controls/MentionTextarea.vue";

const { field, modelValue, disabled = false } = defineProps<{
  field: NonNullable<AskGenerator["concept"]>;
  modelValue: string;
  noun: string;
  disabled?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [text: string] }>();

const itemIndex = useItemIndex(() => ({ enabled: field.mentions === "items" && !disabled }));
const mentionItems = computed(() => (field.mentions === "items" ? (itemIndex.data.value ?? []).map((i) => ({ id: i.id, label: i.name })) : []));
</script>
