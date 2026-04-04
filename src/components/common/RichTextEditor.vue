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
        <button type="button" title="Heading 1" :class="tbCls(editor.isActive('heading', { level: 1 }))" @click="editor.chain().focus().toggleHeading({ level: 1 }).run()">
          <span class="text-[10px] font-cinzel font-bold leading-none">H1</span>
        </button>
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
        <!-- Table controls -->
        <button
          type="button"
          title="Insert table"
          :class="tbCls(editor.isActive('table'))"
          @click="editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()"
        >
          <TableIcon class="h-3.5 w-3.5" />
        </button>
        <template v-if="editor.isActive('table')">
          <button type="button" title="Add column after" :class="tbCls(false)" @click="editor.chain().focus().addColumnAfter().run()">
            <BetweenVerticalEnd class="h-3.5 w-3.5" />
          </button>
          <button type="button" title="Add row after" :class="tbCls(false)" @click="editor.chain().focus().addRowAfter().run()">
            <BetweenHorizontalEnd class="h-3.5 w-3.5" />
          </button>
          <button type="button" title="Delete column" :class="tbCls(false)" @click="editor.chain().focus().deleteColumn().run()">
            <span class="text-[9px] font-cinzel font-bold leading-none text-destructive">−C</span>
          </button>
          <button type="button" title="Delete row" :class="tbCls(false)" @click="editor.chain().focus().deleteRow().run()">
            <span class="text-[9px] font-cinzel font-bold leading-none text-destructive">−R</span>
          </button>
          <button type="button" title="Delete table" :class="tbCls(false)" @click="editor.chain().focus().deleteTable().run()">
            <Trash2 class="h-3.5 w-3.5 text-destructive" />
          </button>
        </template>
        <button type="button" title="Upload image" :class="tbCls(false)" :disabled="uploadingImage" @click="insertImage">
          <ImageIcon class="h-3.5 w-3.5" :class="uploadingImage ? 'animate-pulse' : ''" />
        </button>
        <div class="w-px h-5 bg-border mx-0.5" />
        <button type="button" title="Undo" :class="tbCls(false)" :disabled="!editor.can().undo()" @click="editor.chain().focus().undo().run()">
          <Undo2 class="h-3.5 w-3.5" />
        </button>
        <button type="button" title="Redo" :class="tbCls(false)" :disabled="!editor.can().redo()" @click="editor.chain().focus().redo().run()">
          <Redo2 class="h-3.5 w-3.5" />
        </button>
        <div class="w-px h-5 bg-border mx-0.5" />
        <button type="button" title="Toggle two-column layout" :class="tbCls(twoColumn)" @click="twoColumn = !twoColumn">
          <Columns2 class="h-3.5 w-3.5" />
        </button>
      </template>
      <slot name="toolbar-end" />
    </div>

    <!-- Content area -->
    <div class="flex-1 overflow-auto p-3">
      <EditorContent :editor="editor" :class="['rte-content h-full', twoColumn ? 'rte-two-col' : '']" />
    </div>

    <!-- Hidden file input for image upload -->
    <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onFileSelected" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from "vue";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useEditor, EditorContent } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import Image from "@tiptap/extension-image";
import { parseMarkdown, looksLikeMarkdown } from "@/lib/markdownToTiptap";
import { List, ListOrdered, Quote, Undo2, Redo2, Table as TableIcon, BetweenVerticalEnd, BetweenHorizontalEnd, Trash2, ImageIcon, Columns2 } from "lucide-vue-next";

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
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    Image,
  ],
  editorProps: {
    handlePaste(view, event) {
      const text = event.clipboardData?.getData("text/plain") ?? "";
      if (!looksLikeMarkdown(text)) return false;
      event.preventDefault();
      const content = parseMarkdown(text);
      view.dispatch(
        view.state.tr.replaceSelectionWith(
          view.state.schema.nodeFromJSON({ type: "doc", content }),
          false,
        ),
      );
      return true;
    },
  },
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

const twoColumn = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const uploadingImage = ref(false);

function insertImage() {
  fileInput.value?.click();
}

async function onFileSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file || !editor.value) return;
  (e.target as HTMLInputElement).value = "";

  uploadingImage.value = true;
  try {
    const user = getCurrentUser();
    const ext = file.name.split(".").pop() ?? "png";
    const path = `${user!.id}/rte-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("asset-images").upload(path, file);
    if (error) throw error;
    const { data } = supabase.storage.from("asset-images").getPublicUrl(path);
    editor.value.chain().focus().setImage({ src: data.publicUrl }).run();
  } catch {
  } finally {
    uploadingImage.value = false;
  }
}

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
.rte-content :deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  @apply text-muted-foreground/50 italic pointer-events-none float-left h-0;
}

/* Table styles */
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
.rte-content :deep(.ProseMirror td) {
  @apply font-fell text-foreground;
}
.rte-content :deep(.ProseMirror .selectedCell) {
  @apply bg-primary/10;
}

/* Two-column layout */
.rte-two-col :deep(.ProseMirror) {
  column-count: 2;
  column-gap: 1.75rem;
  column-rule: 1px solid hsl(var(--border));
}
.rte-two-col :deep(.ProseMirror table),
.rte-two-col :deep(.ProseMirror .ProseMirror-widget) {
  break-inside: avoid;
  column-span: none;
}

/* Image styles */
.rte-content :deep(.ProseMirror img) {
  @apply max-w-full rounded-md my-2;
}
.rte-content :deep(.ProseMirror img.ProseMirror-selectednode) {
  @apply ring-2 ring-primary;
}
</style>
