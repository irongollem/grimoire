<template>
  <div class="flex flex-col gap-4">
    <!-- Top bar -->
    <div class="flex flex-wrap items-center gap-2">
      <label class="flex-1 min-w-48">
        <span class="sr-only">Note title</span>
        <input
          v-model="title"
          placeholder="Note title…"
          class="w-full bg-card border border-border rounded-md px-3 py-2 font-cinzel text-lg font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </label>

      <!-- Category -->
      <select
        v-model="category"
        class="bg-card border border-border rounded-md px-3 py-2 font-cinzel text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option v-for="c in CATEGORIES" :key="c.value" :value="c.value">{{ c.label }}</option>
      </select>

      <!-- Session # — only relevant for session notes -->
      <label v-if="category === 'session'" class="flex items-center gap-1.5">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">#</span>
        <input
          v-model.number="sessionNum"
          type="number"
          min="1"
          placeholder="Session"
          class="w-20 bg-card border border-border rounded-md px-3 py-2 font-cinzel text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </label>

      <!-- Pin toggle -->
      <button
        type="button"
        :title="isPinned ? 'Unpin note' : 'Pin note'"
        class="p-2 rounded-md border border-border transition-colors"
        :class="isPinned ? 'bg-primary/10 text-primary border-primary/30' : 'bg-card text-muted-foreground hover:text-foreground'"
        @click="isPinned = !isPinned"
      >
        <Pin class="h-3.5 w-3.5" />
      </button>

      <!-- Player visibility toggle -->
      <button
        type="button"
        :title="isPlayerVisible ? 'Visible to players — click to hide' : 'Hidden from players — click to share'"
        class="p-2 rounded-md border border-border transition-colors"
        :class="isPlayerVisible ? 'bg-elven-green/15 text-elven-green border-elven-green/30' : 'bg-card text-muted-foreground hover:text-foreground'"
        @click="isPlayerVisible = !isPlayerVisible"
      >
        <Eye class="h-3.5 w-3.5" />
      </button>

      <button
        type="button"
        :disabled="saving || !title.trim()"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
        @click="save"
      >
        <Save class="h-3.5 w-3.5" />
        {{ saving ? "Saving…" : props.note ? "Save" : "Create" }}
      </button>

      <button
        v-if="props.note"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-destructive px-3 py-2 font-cinzel text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors"
        @click="remove"
      >
        <Trash2 class="h-3.5 w-3.5" />
        Delete
      </button>
    </div>

    <!-- Tags -->
    <div class="flex flex-wrap items-center gap-1 min-h-8 bg-muted/50 border border-border rounded-md px-2 py-1">
      <span
        v-for="tag in tags"
        :key="tag"
        class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-card font-cinzel text-[11px] text-muted-foreground tracking-wider"
      >
        {{ tag }}
        <button type="button" class="hover:text-destructive transition-colors leading-none text-sm" @click="removeTag(tag)">×</button>
      </span>
      <input
        v-model="tagInput"
        placeholder="Add tag…"
        class="bg-transparent border-none outline-none font-fell text-xs text-muted-foreground placeholder:text-muted-foreground/60 min-w-24 flex-1"
        @keydown.enter.prevent="addTag"
        @keydown="onTagKeydown"
      />
    </div>

    <p v-if="saveError" class="text-destructive font-fell text-sm">{{ saveError }}</p>

    <!-- Tiptap editor -->
    <div class="flex flex-col rounded-lg border border-border bg-card overflow-hidden" style="min-height: 500px">
      <!-- Toolbar -->
      <div class="flex flex-wrap items-center gap-0.5 p-1.5 border-b border-border bg-muted/30 shrink-0">
        <template v-if="editor">
          <button type="button" title="Bold" :class="tbCls(editor.isActive('bold'))" @click="editor.chain().focus().toggleBold().run()">
            <strong class="text-[11px] leading-none">B</strong>
          </button>
          <button type="button" title="Italic" :class="tbCls(editor.isActive('italic'))" @click="editor.chain().focus().toggleItalic().run()">
            <em class="text-[11px] leading-none">I</em>
          </button>
          <button type="button" title="Strikethrough" :class="tbCls(editor.isActive('strike'))" @click="editor.chain().focus().toggleStrike().run()">
            <Strikethrough class="h-3.5 w-3.5" />
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
          <button type="button" title="Divider" :class="tbCls(false)" @click="editor.chain().focus().setHorizontalRule().run()">
            <Minus class="h-3.5 w-3.5" />
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

      <!-- Editor content -->
      <div class="flex-1 overflow-auto p-4">
        <EditorContent :editor="editor" class="note-editor h-full" />
      </div>

      <!-- Word count -->
      <div class="px-4 py-1.5 border-t border-border bg-muted/20 flex justify-end shrink-0">
        <span class="font-fell text-[11px] text-muted-foreground italic">{{ wordCount }} words</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { useEditor, EditorContent } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Save, Trash2, Pin, Eye, Strikethrough, List, ListOrdered,
  Quote, Minus, Undo2, Redo2,
} from "lucide-vue-next";
import { useCreateNote, useUpdateNote, useDeleteNote } from "@/composables/useNotes";
import type { Note, NoteCategory } from "@/types/notes.types";

const CATEGORIES: { value: NoteCategory; label: string }[] = [
  { value: "general",  label: "General" },
  { value: "session",  label: "Session" },
  { value: "lore",     label: "Lore" },
  { value: "location", label: "Location" },
  { value: "quest",    label: "Quest" },
  { value: "faction",  label: "Faction" },
];

const props = defineProps<{ note: Note | null }>();
const router = useRouter();

const title      = ref(props.note?.title ?? "");
const category   = ref<NoteCategory>(props.note?.category ?? "general");
const sessionNum = ref<number | null>(props.note?.session_num ?? null);
const isPinned         = ref(props.note?.is_pinned ?? false);
const isPlayerVisible  = ref(props.note?.is_player_visible ?? false);
const tags       = ref<string[]>(props.note?.tags ? [...props.note.tags] : []);
const tagInput   = ref("");
const saving     = ref(false);
const saveError  = ref("");

function addTag() {
  const val = tagInput.value.replace(/,\s*$/, "").trim();
  if (val && !tags.value.includes(val)) tags.value.push(val);
  tagInput.value = "";
}
function onTagKeydown(e: KeyboardEvent) {
  if (e.key === ",") { e.preventDefault(); addTag(); }
}
function removeTag(tag: string) {
  tags.value = tags.value.filter((t) => t !== tag);
}

const editor = useEditor({
  content: props.note?.content ? JSON.parse(props.note.content) : undefined,
  extensions: [
    StarterKit,
    Placeholder.configure({ placeholder: "Write your note here…" }),
  ],
});

onUnmounted(() => editor.value?.destroy());

const wordCount = computed(() => {
  const text = editor.value?.getText() ?? "";
  return text.trim() ? text.trim().split(/\s+/).length : 0;
});

function tbCls(active: boolean) {
  return [
    "p-1 rounded min-w-[26px] h-[26px] flex items-center justify-center transition-colors disabled:opacity-40",
    active ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted",
  ].join(" ");
}

const { mutateAsync: create } = useCreateNote();
const { mutateAsync: update } = useUpdateNote();
const { mutateAsync: del }    = useDeleteNote();

function buildPayload() {
  return {
    title:       title.value.trim() || "Untitled Note",
    category:    category.value,
    session_num: category.value === "session" ? (sessionNum.value ?? null) : null,
    is_pinned:          isPinned.value,
    is_player_visible:  isPlayerVisible.value,
    tags:        tags.value,
    content:     JSON.stringify(editor.value?.getJSON() ?? {}),
    campaign_id: null as string | null,
  };
}

async function save() {
  if (!title.value.trim() && !editor.value?.getText().trim()) return;
  saving.value = true;
  saveError.value = "";
  try {
    if (props.note) {
      await update({ id: props.note.id, update: buildPayload() });
      router.push("/notes");
    } else {
      const created = await create(buildPayload());
      router.replace(`/notes/${created.id}`);
    }
  } catch (e: unknown) {
    saveError.value = e instanceof Error ? e.message : "Failed to save";
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!props.note) return;
  if (!confirm(`Delete "${props.note.title}"? This cannot be undone.`)) return;
  await del(props.note.id);
  router.push("/notes");
}
</script>

<style scoped>
@reference "@/assets/main.css";

.note-editor :deep(.ProseMirror) {
  @apply font-fell text-sm text-foreground outline-none min-h-96;
}
.note-editor :deep(.ProseMirror p) {
  @apply mb-3 leading-relaxed;
}
.note-editor :deep(.ProseMirror h1) {
  @apply font-cinzel text-2xl font-bold mb-3 mt-5 first:mt-0;
}
.note-editor :deep(.ProseMirror h2) {
  @apply font-cinzel text-xl font-bold mb-2 mt-4 first:mt-0;
}
.note-editor :deep(.ProseMirror h3) {
  @apply font-cinzel text-base font-bold mb-2 mt-3 first:mt-0;
}
.note-editor :deep(.ProseMirror ul) {
  @apply list-disc pl-5 mb-3 space-y-1;
}
.note-editor :deep(.ProseMirror ol) {
  @apply list-decimal pl-5 mb-3 space-y-1;
}
.note-editor :deep(.ProseMirror blockquote) {
  @apply border-l-2 border-primary/50 pl-4 italic text-muted-foreground my-3;
}
.note-editor :deep(.ProseMirror hr) {
  @apply border-t border-primary/30 my-4;
}
.note-editor :deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  @apply text-muted-foreground/50 italic pointer-events-none float-left h-0;
}
</style>
