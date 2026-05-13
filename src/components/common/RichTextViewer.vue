<template>
  <div class="rte-content" @click="onContentClick">
    <EditorContent v-if="editor" :editor="editor" />

    <!-- Image lightbox -->
    <Teleport to="body">
      <div
        v-if="lightboxSrc"
        class="fixed inset-0 z-200 flex items-center justify-center bg-black/80 p-4 cursor-zoom-out"
        @click="lightboxSrc = null"
      >
        <img
          :src="lightboxSrc"
          class="max-w-full max-h-full rounded-lg shadow-2xl object-contain cursor-default"
          @click.stop
        />
        <button
          type="button"
          class="absolute top-4 right-4 text-white/70 hover:text-white text-2xl leading-none transition-colors"
          @click="lightboxSrc = null"
        >
          ✕
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from "vue";
import { useEditor, EditorContent } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import { Columns } from "@/lib/tiptap/Columns";
import Highlight from "@tiptap/extension-highlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Typography from "@tiptap/extension-typography";
import { CalendarEventRef } from "@/lib/tiptap/CalendarEventRef";
import { createEntityMentionExtension } from "@/lib/tiptap/EntityMention";
import { IllustrationSuggestion } from "@/lib/tiptap/IllustrationSuggestion";

const EntityMentionViewer = createEntityMentionExtension({});

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
  extensions: [
    StarterKit.configure({
      link: {
        openOnClick: true,
        HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
      },
    }),
    Table,
    TableRow,
    TableHeader,
    TableCell,
    Image,
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Columns,
    Highlight,
    TaskList,
    TaskItem.configure({ nested: true }),
    Typography,
    CalendarEventRef,
    EntityMentionViewer,
    IllustrationSuggestion,
  ],
});

watch(
  () => props.content,
  (v) => {
    const parsed = parseContent(v);
    if (editor.value && parsed) editor.value.commands.setContent(parsed);
  },
);

onUnmounted(() => editor.value?.destroy());

// ── Image lightbox ────────────────────────────────────────────────────────────
const lightboxSrc = ref<string | null>(null);

function onContentClick(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (target.tagName === "IMG") {
    lightboxSrc.value = (target as HTMLImageElement).src;
  }
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
  @apply max-w-full rounded-md my-2 cursor-zoom-in;
}
.rte-content :deep(.ProseMirror u) {
  @apply underline;
}
.rte-content :deep(.ProseMirror mark) {
  @apply bg-yellow-400/25 text-foreground rounded-sm px-0.5;
}
.rte-content :deep(.ProseMirror a) {
  @apply text-primary underline cursor-pointer;
}
.rte-content :deep(.ProseMirror a:hover) {
  @apply opacity-80;
}
.rte-content :deep(.ProseMirror ul[data-type="taskList"]) {
  @apply list-none pl-1 mb-3 space-y-1;
}
.rte-content :deep(.ProseMirror li[data-type="taskItem"]) {
  @apply flex items-start gap-2;
}
.rte-content :deep(.ProseMirror li[data-type="taskItem"] > label) {
  @apply flex items-center pt-0.5 shrink-0;
}
.rte-content
  :deep(
    .ProseMirror li[data-type="taskItem"] > label > input[type="checkbox"]
  ) {
  @apply w-3.5 h-3.5 accent-primary cursor-pointer;
}
.rte-content
  :deep(.ProseMirror li[data-type="taskItem"][data-checked="true"] > div) {
  @apply line-through text-muted-foreground;
}
.rte-content :deep(.ProseMirror [data-type="columns"]) {
  column-count: 2;
  column-gap: 1.75rem;
  column-rule: 1px solid hsl(var(--border));
  @apply my-3;
}
</style>
