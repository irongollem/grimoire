<template>
  <div
    class="rich-editor flex flex-col rounded-lg border border-border bg-card overflow-hidden"
    :style="{ minHeight: minHeight ?? '180px' }"
  >
    <!-- Toolbar -->
    <div class="flex flex-wrap items-center gap-0.5 p-1.5 border-b border-border bg-muted/30 shrink-0">
      <template v-if="editor">
        <button type="button" title="Bold" :class="tbCls(editor.isActive('bold'))" @click="editor.chain().focus().toggleBold().run()">
          <strong class="text-[11px] leading-none">B</strong>
        </button>
        <button type="button" title="Italic" :class="tbCls(editor.isActive('italic'))" @click="editor.chain().focus().toggleItalic().run()">
          <em class="text-[11px] leading-none">I</em>
        </button>
        <div class="w-px h-5 bg-border mx-0.5" />
        <button type="button" title="Heading 2" :class="tbCls(editor.isActive('heading', { level: 2 }))" @click="editor.chain().focus().toggleHeading({ level: 2 }).run()">
          <span class="text-[10px] font-cinzel font-bold leading-none">H2</span>
        </button>
        <button type="button" title="Heading 3" :class="tbCls(editor.isActive('heading', { level: 3 }))" @click="editor.chain().focus().toggleHeading({ level: 3 }).run()">
          <span class="text-[10px] font-cinzel font-bold leading-none">H3</span>
        </button>
        <div class="w-px h-5 bg-border mx-0.5" />
        <button type="button" title="Bullet list" :class="tbCls(editor.isActive('bulletList'))" @click="editor.chain().focus().toggleBulletList().run()">
          <List class="h-3.5 w-3.5" />
        </button>
        <button type="button" title="Ordered list" :class="tbCls(editor.isActive('orderedList'))" @click="editor.chain().focus().toggleOrderedList().run()">
          <ListOrdered class="h-3.5 w-3.5" />
        </button>
        <button type="button" title="Blockquote" :class="tbCls(editor.isActive('blockquote'))" @click="editor.chain().focus().toggleBlockquote().run()">
          <Quote class="h-3.5 w-3.5" />
        </button>
        <div class="w-px h-5 bg-border mx-0.5" />
        <button type="button" title="Undo" :class="tbCls(false)" :disabled="!editor.can().undo()" @click="editor.chain().focus().undo().run()">
          <Undo2 class="h-3.5 w-3.5" />
        </button>
        <button type="button" title="Redo" :class="tbCls(false)" :disabled="!editor.can().redo()" @click="editor.chain().focus().redo().run()">
          <Redo2 class="h-3.5 w-3.5" />
        </button>
      </template>
    </div>

    <!-- Content area -->
    <div class="flex-1 overflow-auto p-3">
      <EditorContent :editor="editor" class="rte-content h-full" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { watch, onUnmounted } from "vue";
import { useEditor, EditorContent } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { List, ListOrdered, Quote, Undo2, Redo2 } from "lucide-vue-next";

const props = defineProps<{
  modelValue: string | null;
  placeholder?: string;
  minHeight?: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

function parseContent(value: string | null): object | string | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    // Legacy plain text — Tiptap will wrap in a paragraph
    return value;
  }
}

const editor = useEditor({
  content: parseContent(props.modelValue),
  extensions: [
    StarterKit,
    Placeholder.configure({ placeholder: props.placeholder ?? "Write something…" }),
  ],
  onUpdate() {
    emit("update:modelValue", JSON.stringify(editor.value?.getJSON() ?? {}));
  },
});

// Sync external content changes (e.g. form reset when a modal reopens)
watch(
  () => props.modelValue,
  (val) => {
    if (!editor.value) return;
    const incoming = parseContent(val);
    const incomingStr = JSON.stringify(incoming ?? {});
    const currentStr = JSON.stringify(editor.value.getJSON());
    if (incomingStr !== currentStr) {
      editor.value.commands.setContent(incoming ?? "");
    }
  },
);

onUnmounted(() => editor.value?.destroy());

function tbCls(active: boolean) {
  return [
    "p-1 rounded min-w-[26px] h-[26px] flex items-center justify-center transition-colors disabled:opacity-40",
    active
      ? "bg-primary/20 text-primary"
      : "text-muted-foreground hover:text-foreground hover:bg-muted",
  ].join(" ");
}
</script>

<style scoped>
@reference "@/assets/main.css";

.rte-content :deep(.ProseMirror) {
  @apply font-fell text-sm text-foreground outline-none;
}
.rte-content :deep(.ProseMirror p) {
  @apply mb-3 leading-relaxed last:mb-0;
}
.rte-content :deep(.ProseMirror h2) {
  @apply font-cinzel text-xl font-bold mb-2 mt-4 first:mt-0;
}
.rte-content :deep(.ProseMirror h3) {
  @apply font-cinzel text-base font-bold mb-2 mt-3 first:mt-0;
}
.rte-content :deep(.ProseMirror ul) {
  @apply list-disc pl-5 mb-3 space-y-1;
}
.rte-content :deep(.ProseMirror ol) {
  @apply list-decimal pl-5 mb-3 space-y-1;
}
.rte-content :deep(.ProseMirror blockquote) {
  @apply border-l-2 border-primary/50 pl-4 italic text-muted-foreground my-3;
}
.rte-content :deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  @apply text-muted-foreground/50 italic pointer-events-none float-left h-0;
}
</style>
