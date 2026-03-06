<template>
  <div class="flex flex-col gap-3">
    <!-- Metadata row -->
    <div class="flex flex-wrap gap-2 items-end">
      <input
        v-model="title"
        placeholder="Document title…"
        class="flex-1 min-w-64 bg-card border border-border rounded-md px-3 py-2 font-cinzel text-base font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <select
        v-model="docType"
        class="bg-card border border-border rounded-md px-3 py-2 font-cinzel text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option v-for="t in DOC_TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
      </select>
      <label class="flex items-center gap-2 cursor-pointer select-none">
        <input type="checkbox" v-model="isPublished" class="rounded" />
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">PUBLISHED</span>
      </label>
      <button
        type="button"
        :disabled="isSaving || !title.trim()"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
        @click="save"
      >
        <Save class="h-3.5 w-3.5" />
        {{ isSaving ? 'Saving…' : (props.doc ? 'Save' : 'Create') }}
      </button>
    </div>

    <!-- Tags row -->
    <div class="flex items-center gap-1.5 flex-wrap min-h-7">
      <span
        v-for="tag in tags"
        :key="tag"
        class="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-muted font-cinzel text-[11px] text-muted-foreground tracking-wider"
      >
        {{ tag }}
        <button type="button" class="hover:text-destructive transition-colors leading-none text-sm" @click="removeTag(tag)">×</button>
      </span>
      <input
        v-model="tagInput"
        placeholder="Add tag…"
        class="bg-transparent border-none outline-none font-fell text-xs text-muted-foreground placeholder:text-muted-foreground/60 min-w-20"
        @keydown.enter.prevent="addTag"
        @keydown="onTagKeydown"
      />
    </div>

    <p v-if="saveError" class="text-destructive font-fell text-sm">{{ saveError }}</p>

    <!-- Editor / Preview split -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3" style="min-height: 620px">

      <!-- Editor pane -->
      <div class="flex flex-col rounded-lg border border-border bg-card overflow-hidden">
        <!-- Toolbar -->
        <div class="flex flex-wrap items-center gap-0.5 p-1.5 border-b border-border bg-muted/30 shrink-0">
          <template v-if="editor">
            <!-- Inline -->
            <button type="button" title="Bold" :class="tbCls(editor.isActive('bold'))" @click="editor.chain().focus().toggleBold().run()">
              <strong class="text-[11px] leading-none">B</strong>
            </button>
            <button type="button" title="Italic" :class="tbCls(editor.isActive('italic'))" @click="editor.chain().focus().toggleItalic().run()">
              <em class="text-[11px] leading-none">I</em>
            </button>
            <button type="button" title="Strikethrough" :class="tbCls(editor.isActive('strike'))" @click="editor.chain().focus().toggleStrike().run()">
              <Strikethrough class="h-3.5 w-3.5" />
            </button>
            <button type="button" title="Inline code" :class="tbCls(editor.isActive('code'))" @click="editor.chain().focus().toggleCode().run()">
              <Code class="h-3.5 w-3.5" />
            </button>

            <div class="w-px h-5 bg-border mx-0.5" />

            <!-- Headings -->
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

            <!-- Blocks -->
            <button type="button" title="Bullet list" :class="tbCls(editor.isActive('bulletList'))" @click="editor.chain().focus().toggleBulletList().run()">
              <List class="h-3.5 w-3.5" />
            </button>
            <button type="button" title="Ordered list" :class="tbCls(editor.isActive('orderedList'))" @click="editor.chain().focus().toggleOrderedList().run()">
              <ListOrdered class="h-3.5 w-3.5" />
            </button>
            <button type="button" title="Blockquote / callout" :class="tbCls(editor.isActive('blockquote'))" @click="editor.chain().focus().toggleBlockquote().run()">
              <Quote class="h-3.5 w-3.5" />
            </button>
            <button type="button" title="Code block" :class="tbCls(editor.isActive('codeBlock'))" @click="editor.chain().focus().toggleCodeBlock().run()">
              <SquareCode class="h-3.5 w-3.5" />
            </button>
            <button type="button" title="Divider" :class="tbCls(false)" @click="editor.chain().focus().setHorizontalRule().run()">
              <Minus class="h-3.5 w-3.5" />
            </button>

            <div class="w-px h-5 bg-border mx-0.5" />

            <!-- History -->
            <button type="button" title="Undo" :class="tbCls(false)" :disabled="!editor.can().undo()" @click="editor.chain().focus().undo().run()">
              <Undo2 class="h-3.5 w-3.5" />
            </button>
            <button type="button" title="Redo" :class="tbCls(false)" :disabled="!editor.can().redo()" @click="editor.chain().focus().redo().run()">
              <Redo2 class="h-3.5 w-3.5" />
            </button>
          </template>
        </div>

        <!-- Tiptap content -->
        <div class="flex-1 overflow-auto p-4">
          <EditorContent :editor="editor" class="phb-editor h-full" />
        </div>

        <!-- Word count footer -->
        <div class="px-4 py-1.5 border-t border-border bg-muted/20 flex justify-end shrink-0">
          <span class="font-fell text-[11px] text-muted-foreground italic">{{ wordCount }} words</span>
        </div>
      </div>

      <!-- Preview pane -->
      <div class="flex flex-col rounded-lg border border-border overflow-hidden">
        <div class="flex items-center justify-between px-4 py-2 border-b border-border bg-card shrink-0">
          <p class="font-cinzel text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            Preview — OneDnD 2024
          </p>
          <span
            class="px-1.5 py-0.5 rounded font-cinzel text-[10px] font-bold tracking-wider uppercase"
            :style="{ backgroundColor: typeColor(docType) + '22', color: typeColor(docType) }"
          >
            {{ DOC_TYPE_LABELS[docType] }}
          </span>
        </div>
        <div class="flex-1 overflow-auto phb-bg">
          <div class="phb-preview">
            <div class="phb-title-bar">{{ title || 'Untitled Document' }}</div>
            <div class="phb-body" v-html="previewHtml" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import {
  Save, Strikethrough, Code, SquareCode, List, ListOrdered,
  Quote, Minus, Undo2, Redo2,
} from 'lucide-vue-next'
import { useCreateScriptoriumDocument, useUpdateScriptoriumDocument } from '@/composables/useScriptorium'
import type { ScriptoriumDocument, ScriptoriumDocType } from '@/types/scriptorium.types'

const DOC_TYPES: { value: ScriptoriumDocType; label: string }[] = [
  { value: 'custom', label: 'Custom' },
  { value: 'spell', label: 'Spell' },
  { value: 'monster', label: 'Monster' },
  { value: 'item', label: 'Item' },
  { value: 'class', label: 'Class' },
  { value: 'subclass', label: 'Subclass' },
  { value: 'race', label: 'Race/Species' },
  { value: 'background', label: 'Background' },
  { value: 'adventure', label: 'Adventure' },
  { value: 'npc-sheet', label: 'NPC Sheet' },
]

const DOC_TYPE_LABELS: Record<ScriptoriumDocType, string> = {
  custom: 'Custom', spell: 'Spell', monster: 'Monster', item: 'Item',
  class: 'Class', subclass: 'Subclass', race: 'Race', background: 'Background',
  adventure: 'Adventure', 'npc-sheet': 'NPC Sheet',
}

const DOC_TYPE_COLORS: Record<ScriptoriumDocType, string> = {
  custom: '#6b7280', spell: '#7c3aed', monster: '#dc2626', item: '#d97706',
  class: '#2563eb', subclass: '#0891b2', race: '#059669', background: '#9333ea',
  adventure: '#c2410c', 'npc-sheet': '#0f766e',
}

function typeColor(t: ScriptoriumDocType) { return DOC_TYPE_COLORS[t] ?? '#6b7280' }
function tbCls(active: boolean) {
  return [
    'p-1 rounded min-w-[26px] h-[26px] flex items-center justify-center transition-colors disabled:opacity-40',
    active
      ? 'bg-primary/20 text-primary'
      : 'text-muted-foreground hover:text-foreground hover:bg-muted',
  ].join(' ')
}

const props = defineProps<{ doc: ScriptoriumDocument | null }>()
const router = useRouter()

// Metadata
const title = ref(props.doc?.title ?? '')
const docType = ref<ScriptoriumDocType>(props.doc?.doc_type ?? 'custom')
const isPublished = ref(props.doc?.is_published ?? false)
const tags = ref<string[]>(props.doc?.tags ?? [])
const tagInput = ref('')

function addTag() {
  const val = tagInput.value.replace(/,\s*$/, '').trim()
  if (val && !tags.value.includes(val)) tags.value.push(val)
  tagInput.value = ''
}
function onTagKeydown(e: KeyboardEvent) {
  if (e.key === ',') { e.preventDefault(); addTag() }
}
function removeTag(tag: string) {
  tags.value = tags.value.filter(t => t !== tag)
}

// Editor
const previewHtml = ref('')
const wordCount = ref(0)

function updateDerived(html: string, text: string) {
  previewHtml.value = html
  wordCount.value = text.trim() ? text.trim().split(/\s+/).length : 0
}

const editor = useEditor({
  content: (() => {
    if (!props.doc?.content) return ''
    try { return JSON.parse(props.doc.content) } catch { return props.doc.content }
  })(),
  extensions: [
    StarterKit,
    Placeholder.configure({ placeholder: 'Begin your document here…' }),
  ],
  onCreate({ editor }) {
    updateDerived(editor.getHTML(), editor.getText())
  },
  onUpdate({ editor }) {
    updateDerived(editor.getHTML(), editor.getText())
  },
})

// Save
const { mutateAsync: create } = useCreateScriptoriumDocument()
const { mutateAsync: update } = useUpdateScriptoriumDocument()
const isSaving = ref(false)
const saveError = ref('')

async function save() {
  if (!title.value.trim()) return
  isSaving.value = true
  saveError.value = ''
  try {
    const payload = {
      title: title.value.trim(),
      content: JSON.stringify(editor.value?.getJSON() ?? {}),
      doc_type: docType.value,
      tags: tags.value,
      is_published: isPublished.value,
      word_count: wordCount.value,
    }
    if (props.doc) {
      await update({ id: props.doc.id, update: payload })
    } else {
      const created = await create(payload)
      router.replace(`/scriptorium/${created.id}`)
    }
  } catch (e: unknown) {
    saveError.value = e instanceof Error ? e.message : 'Failed to save'
  } finally {
    isSaving.value = false
  }
}

onUnmounted(() => editor.value?.destroy())
</script>

<style scoped>
@reference "@/assets/main.css";

/* ── Editor (dark app theme) ──────────────────────────────────── */
.phb-editor :deep(.ProseMirror) {
  @apply font-fell text-foreground outline-none;
  min-height: 100%;
  line-height: 1.75;
  font-size: 0.9375rem;
}
.phb-editor :deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  @apply text-muted-foreground;
  float: left;
  pointer-events: none;
  height: 0;
}
.phb-editor :deep(.ProseMirror h1) { @apply font-cinzel text-2xl font-bold mt-4 mb-2; }
.phb-editor :deep(.ProseMirror h2) { @apply font-cinzel text-xl font-bold mt-3 mb-1.5; }
.phb-editor :deep(.ProseMirror h3) { @apply font-cinzel text-base font-semibold mt-2 mb-1; }
.phb-editor :deep(.ProseMirror ul),
.phb-editor :deep(.ProseMirror ol) { @apply pl-6 my-2; }
.phb-editor :deep(.ProseMirror blockquote) { @apply border-l-4 border-primary pl-3 text-muted-foreground italic my-2; }
.phb-editor :deep(.ProseMirror hr)  { @apply border-border my-4; }
.phb-editor :deep(.ProseMirror code) { @apply bg-muted px-1 rounded text-sm font-mono; }
.phb-editor :deep(.ProseMirror pre) { @apply bg-muted p-3 rounded my-2 text-sm; }

/* ── PHB Preview (OneDnD 2024 output style) ───────────────────── */
.phb-bg { background: #F9F6EF; }

.phb-preview {
  max-width: 680px;
  margin: 0 auto;
  padding: 0 2rem 2rem;
  font-family: Georgia, 'Times New Roman', serif;
  color: #1a1a1a;
  line-height: 1.65;
  font-size: 0.9375rem;
}

.phb-title-bar {
  font-family: 'Cinzel', Georgia, serif;
  font-size: 1.6rem;
  font-weight: 700;
  color: #F9F6EF;
  background: #1B3A4B;
  padding: 0.6rem 2rem;
  margin: 0 -2rem 1.75rem;
  letter-spacing: 0.04em;
  line-height: 1.25;
}

.phb-body :deep(h1) {
  font-family: 'Cinzel', Georgia, serif;
  font-size: 1.25rem;
  font-weight: 700;
  color: #F9F6EF;
  background: #1B3A4B;
  padding: 0.35rem 1rem;
  margin: 1.5rem -1rem 1rem;
  letter-spacing: 0.03em;
}
.phb-body :deep(h2) {
  font-family: 'Cinzel', Georgia, serif;
  font-size: 1.05rem;
  font-weight: 700;
  color: #1B3A4B;
  border-bottom: 2px solid #1B3A4B;
  padding-bottom: 0.2rem;
  margin: 1.25rem 0 0.6rem;
  letter-spacing: 0.02em;
}
.phb-body :deep(h3) {
  font-family: 'Cinzel', Georgia, serif;
  font-size: 0.9375rem;
  font-weight: 600;
  font-style: italic;
  color: #1B3A4B;
  margin: 1rem 0 0.35rem;
}
.phb-body :deep(p)  { margin: 0 0 0.6rem; }
.phb-body :deep(ul),
.phb-body :deep(ol) { padding-left: 1.25rem; margin: 0.375rem 0 0.6rem; }
.phb-body :deep(li) { margin: 0.2rem 0; }
.phb-body :deep(blockquote) {
  border-left: 4px solid #1B3A4B;
  background: #E8F4F8;
  padding: 0.6rem 0.875rem;
  margin: 0.875rem 0;
  border-radius: 0 4px 4px 0;
  font-style: italic;
}
.phb-body :deep(blockquote p) { margin: 0; }
.phb-body :deep(strong) { font-weight: 700; }
.phb-body :deep(em) { font-style: italic; }
.phb-body :deep(hr) {
  border: none;
  border-top: 2px solid #1B3A4B;
  margin: 1.25rem 0;
}
.phb-body :deep(code) {
  background: #e4ddd0;
  padding: 0.1em 0.35em;
  border-radius: 2px;
  font-family: 'Courier New', monospace;
  font-size: 0.875em;
}
.phb-body :deep(pre) {
  background: #1B3A4B;
  color: #E8F4F8;
  padding: 0.875rem;
  border-radius: 4px;
  overflow-x: auto;
  margin: 0.875rem 0;
  font-size: 0.875em;
}
.phb-body :deep(pre code) { background: transparent; padding: 0; color: inherit; }
</style>
