<template>
  <div ref="root" @focusout="onFocusOut" @keydown.esc.stop="stopEditing">
    <RichTextEditor
      v-if="editing"
      toolbar="focus"
      :model-value="modelValue"
      :size="size"
      :placeholder="placeholder"
      autofocus
      @update:model-value="emit('update:modelValue', $event)"
    />
    <div
      v-else
      role="button"
      tabindex="0"
      :aria-label="`Edit ${label}`"
      class="tap-to-edit rounded-lg border border-transparent p-3 cursor-text transition-colors hover:border-border focus-visible:border-primary focus-visible:outline-none"
      :style="{ minHeight: EDITOR_MIN_HEIGHTS[size] }"
      @click="startEditing"
      @keydown.enter.self.prevent="startEditing"
      @keydown.space.self.prevent="startEditing"
    >
      <RichTextViewer v-if="hasContent" :content="modelValue ?? null" class="text-body text-foreground" />
      <p v-else class="text-body text-muted-foreground/70 italic">{{ placeholder ?? "Tap to write…" }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * A rich-text field that reads like the page and edits when tapped. Shows the
 * stored text with `RichTextViewer`; a tap (or Enter/Space on the focused
 * block) swaps in the focus-toolbar `RichTextEditor`, and leaving it (focus
 * moving out, or Escape) swaps the viewer back. It emits `update:modelValue`
 * exactly as the editor does, so a parent's autosave needs no change.
 *
 * The editor is imported directly, not on first tap: its only reader (the Lore
 * tab) is itself a lazy panel, and an editor still downloading would leave the
 * tapped field blank for a moment on a phone.
 */
import { computed, ref } from "vue";
import RichTextEditor from "@/components/common/richtext/RichTextEditor.vue";
import RichTextViewer from "@/components/common/richtext/RichTextViewer.vue";
import { EDITOR_MIN_HEIGHTS, type EditorSize } from "./richTextEditorSizes";

const {
  modelValue,
  label,
  placeholder,
  size = "sm",
} = defineProps<{
  modelValue: string | null | undefined;
  /** Names the field for assistive tech: "Edit bonds". */
  label: string;
  placeholder?: string;
  size?: EditorSize;
}>();

const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const editing = ref(false);
const root = ref<HTMLElement | null>(null);

const BLOCKS_WITHOUT_TEXT = new Set(["doc", "paragraph", "hardBreak"]);
function holdsContent(node: unknown): boolean {
  if (!node || typeof node !== "object") return false;
  const n = node as { type?: string; text?: string; content?: unknown[] };
  if (n.text) return true;
  if (n.type && !BLOCKS_WITHOUT_TEXT.has(n.type)) return true;
  return (n.content ?? []).some(holdsContent);
}
/** An editor that was opened and left empty stores an empty doc, which must still show the prompt. */
const hasContent = computed(() => {
  if (!modelValue) return false;
  try {
    return holdsContent(JSON.parse(modelValue));
  } catch {
    return modelValue.trim().length > 0; // legacy plain text
  }
});

function startEditing() {
  editing.value = true;
}

function stopEditing() {
  editing.value = false;
}

/**
 * Focus leaving to somewhere inside this block (the editor's toolbar buttons)
 * is still editing. The focus toolbar also keeps focus on the text by itself
 * (it cancels mousedown), so this guards keyboard travel along the toolbar.
 */
function onFocusOut(e: FocusEvent) {
  if (!editing.value) return;
  // The viewer block we just swapped out was focused; some browsers report its removal as a focusout.
  if ((e.target as HTMLElement | null)?.closest?.(".tap-to-edit")) return;
  const next = e.relatedTarget as Node | null;
  if (next && root.value?.contains(next)) return;
  stopEditing();
}
</script>
