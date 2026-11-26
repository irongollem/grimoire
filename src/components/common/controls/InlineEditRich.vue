<template>
  <div ref="root" role="group" :aria-label="ariaLabel">
    <RichTextEditor
      v-if="editing"
      :model-value="modelValue"
      :placeholder="placeholder"
      :size="size"
      :allow-secrets="allowSecrets"
      :entity-mention-items="entityMentionItems"
      autofocus
      @update:model-value="emit('update:modelValue', $event)"
      @keydown.esc="close"
    />
    <!-- A div, not a <button>: it holds block content (paragraphs, lists) a button may not contain. -->
    <div
      v-else
      role="button"
      tabindex="0"
      :aria-label="`Edit ${ariaLabel}`"
      class="cursor-text hover:bg-muted/40"
      @click="editing = true"
      @keydown.enter.self.prevent="editing = true"
      @keydown.space.self.prevent="editing = true"
    >
      <RichTextViewer v-if="hasContent" :content="modelValue" />
      <p v-else class="italic text-muted-foreground">{{ placeholder }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Click-to-edit description (#1283): the rendered text is the control; clicking
 * it makes it the rich editor, clicking outside or Escape solidifies it again.
 * Emits `update:modelValue` as the editor changes so a parent's autosave sees it.
 */
import { computed, ref, useTemplateRef } from "vue";
import { onClickOutside } from "@vueuse/core";
import RichTextEditor from "@/components/common/richtext/RichTextEditor.vue";
import RichTextViewer from "@/components/common/richtext/RichTextViewer.vue";
import type { EditorSize } from "@/components/common/richtext/richTextEditorSizes";
import type { EntityMentionItem } from "@/lib/tiptap/EntityMention";

const { modelValue, placeholder, ariaLabel, allowSecrets, entityMentionItems, size } = defineProps<{
  modelValue: string | null;
  placeholder: string;
  ariaLabel: string;
  allowSecrets?: boolean;
  entityMentionItems?: EntityMentionItem[];
  size?: EditorSize;
}>();

const emit = defineEmits<{ "update:modelValue": [value: string]; done: [] }>();

const editing = ref(false);
const root = useTemplateRef<HTMLElement>("root");

/** Empty means no stored document, or one whose only block is an empty paragraph. */
const hasContent = computed(() => {
  if (!modelValue) return false;
  try {
    const blocks = (JSON.parse(modelValue) as { content?: { content?: unknown[] }[] }).content;
    if (blocks === undefined || blocks.length === 0) return false;
    const first = blocks[0].content;
    return blocks.length > 1 || (first !== undefined && first.length > 0);
  } catch {
    return modelValue.trim() !== "";
  }
});

function close() {
  if (!editing.value) return;
  editing.value = false;
  emit("done");
}

// Menus the editor teleports to <body> sit outside root but belong to it.
onClickOutside(root, close, {
  ignore: [".entity-suggestion-popup", "[data-slip]", ".tippy-box", "[role='dialog']", "[role='menu']"],
});
</script>
