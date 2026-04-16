<template>
  <div v-if="editor" class="rte-content">
    <EditorContent :editor="editor" />
  </div>
</template>

<script setup lang="ts">
import { watch, onUnmounted } from "vue";
import { useEditor, EditorContent } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import Image from "@tiptap/extension-image";

const props = defineProps<{ content: object | string | null }>();

function parseContent(v: object | string | null) {
  if (!v) return undefined;
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }
  return v;
}

const editor = useEditor({
  content: parseContent(props.content),
  editable: false,
  extensions: [StarterKit, Table, TableRow, TableHeader, TableCell, Image],
});

watch(
  () => props.content,
  (v) => {
    const parsed = parseContent(v);
    if (editor.value && parsed) editor.value.commands.setContent(parsed);
  },
);

onUnmounted(() => editor.value?.destroy());
</script>

<style scoped>
@reference "@/assets/main.css";

.rte-content :deep(.ProseMirror) {
  @apply font-fell text-sm text-foreground outline-none;
}
.rte-content :deep(.ProseMirror p) {
  @apply mb-3 leading-relaxed last:mb-0;
}
.rte-content :deep(.ProseMirror h1) {
  @apply font-cinzel text-lg font-bold mb-3 mt-5 first:mt-0;
}
.rte-content :deep(.ProseMirror h2) {
  @apply font-cinzel text-base font-bold mb-2 mt-4 first:mt-0 pb-1.5;
  border-bottom: 1px solid rgba(201, 146, 10, 0.35);
}
.rte-content :deep(.ProseMirror h3) {
  @apply font-cinzel text-sm font-bold mb-2 mt-3 first:mt-0;
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
.rte-content :deep(.ProseMirror table) {
  @apply w-full border-collapse my-3 text-sm;
}
.rte-content :deep(.ProseMirror th),
.rte-content :deep(.ProseMirror td) {
  @apply border border-border px-3 py-1.5 text-left align-top;
}
.rte-content :deep(.ProseMirror th) {
  @apply font-cinzel text-xs font-semibold tracking-wider bg-muted/50 text-foreground;
}
.rte-content :deep(.ProseMirror img) {
  @apply max-w-full rounded-md my-2;
}
</style>
