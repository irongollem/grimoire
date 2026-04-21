<template>
  <PdfPreviewDialog
    :show="showPdfPreview"
    :blob-url="pdfBlobUrl"
    :title="title"
    @close="closePdfPreview"
    @save="savePdf"
  />
  <AssetInsertPanel
    :show="showAssetPanel"
    :editor="editor"
    @close="showAssetPanel = false"
  />

  <div class="flex flex-col gap-3">
    <!-- Metadata row -->
    <div class="flex flex-wrap gap-2 items-end">
      <label class="flex-1 min-w-64">
        <span class="sr-only">Document title</span>
        <input
          v-model="title"
          placeholder="Document title…"
          class="w-full bg-card border border-border rounded-md px-3 py-2 font-cinzel text-base font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </label>
      <label>
        <span class="sr-only">Document type</span>
        <select
          v-model="docType"
          class="bg-card border border-border rounded-md px-3 py-2 font-cinzel text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option v-for="t in DOC_TYPES" :key="t.value" :value="t.value">
            {{ t.label }}
          </option>
        </select>
      </label>
      <label class="flex items-center gap-2 cursor-pointer select-none">
        <input type="checkbox" v-model="isPublished" class="rounded" />
        <span
          class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
          >PUBLISHED</span
        >
      </label>
      <button
        type="button"
        :disabled="isSaving || !title.trim()"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
        @click="save"
      >
        <Save class="h-3.5 w-3.5" />
        {{ isSaving ? "Saving…" : props.doc ? "Save" : "Create" }}
      </button>
      <button
        v-if="props.doc"
        type="button"
        :disabled="isDeleting"
        class="inline-flex items-center gap-1.5 rounded-md border border-destructive/50 px-3 py-2 font-cinzel text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
        @click="destroy"
      >
        <Trash2 class="h-3.5 w-3.5" />
        {{ isDeleting ? "Deleting…" : "Delete" }}
      </button>
    </div>

    <!-- Tags row -->
    <TagInput v-model="tags" />

    <p v-if="saveError" class="text-destructive font-fell text-sm">
      {{ saveError }}
    </p>

    <!-- Editor / Preview split -->
    <!--
      Mobile: no min-height so the page scrolls naturally and both panes sit in
      the document flow. Desktop: fixed 620px pane height with internal scroll.
    -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:min-h-155">
      <!-- Editor pane -->
      <!--
        overflow-hidden only kicks in at lg: so the mobile layout doesn't clip the
        toolbar's horizontal scroll or trap the editor inside a nested scroller.
      -->
      <div
        class="flex flex-col rounded-lg border border-border bg-card lg:overflow-hidden"
      >
        <!--
          Toolbar — on mobile: single horizontally-scrollable row so all icon
          buttons stay reachable without wrapping into 3+ rows. Desktop: wrap.
        -->
        <div
          class="flex flex-nowrap items-center gap-0.5 p-1.5 border-b border-border bg-muted/30 shrink-0 overflow-x-auto scriptorium-toolbar lg:flex-wrap lg:overflow-visible"
        >
          <template v-if="editor">
            <!-- Inline -->
            <button
              type="button"
              title="Bold"
              :class="tbCls(editor.isActive('bold'))"
              @click="editor.chain().focus().toggleBold().run()"
            >
              <strong class="text-[11px] leading-none">B</strong>
            </button>
            <button
              type="button"
              title="Italic"
              :class="tbCls(editor.isActive('italic'))"
              @click="editor.chain().focus().toggleItalic().run()"
            >
              <em class="text-[11px] leading-none">I</em>
            </button>
            <button
              type="button"
              title="Strikethrough"
              :class="tbCls(editor.isActive('strike'))"
              @click="editor.chain().focus().toggleStrike().run()"
            >
              <Strikethrough class="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Inline code"
              :class="tbCls(editor.isActive('code'))"
              @click="editor.chain().focus().toggleCode().run()"
            >
              <Code class="h-3.5 w-3.5" />
            </button>

            <div class="w-px h-5 bg-border mx-0.5" />

            <!-- Headings -->
            <button
              type="button"
              title="Heading 1"
              :class="tbCls(editor.isActive('heading', { level: 1 }))"
              @click="editor.chain().focus().toggleHeading({ level: 1 }).run()"
            >
              <span class="text-[10px] font-cinzel font-bold leading-none"
                >H1</span
              >
            </button>
            <button
              type="button"
              title="Heading 2"
              :class="tbCls(editor.isActive('heading', { level: 2 }))"
              @click="editor.chain().focus().toggleHeading({ level: 2 }).run()"
            >
              <span class="text-[10px] font-cinzel font-bold leading-none"
                >H2</span
              >
            </button>
            <button
              type="button"
              title="Heading 3"
              :class="tbCls(editor.isActive('heading', { level: 3 }))"
              @click="editor.chain().focus().toggleHeading({ level: 3 }).run()"
            >
              <span class="text-[10px] font-cinzel font-bold leading-none"
                >H3</span
              >
            </button>

            <div class="w-px h-5 bg-border mx-0.5" />

            <!-- Blocks -->
            <button
              type="button"
              title="Bullet list"
              :class="tbCls(editor.isActive('bulletList'))"
              @click="editor.chain().focus().toggleBulletList().run()"
            >
              <List class="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Ordered list"
              :class="tbCls(editor.isActive('orderedList'))"
              @click="editor.chain().focus().toggleOrderedList().run()"
            >
              <ListOrdered class="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Blockquote / callout"
              :class="tbCls(editor.isActive('blockquote'))"
              @click="editor.chain().focus().toggleBlockquote().run()"
            >
              <Quote class="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Code block"
              :class="tbCls(editor.isActive('codeBlock'))"
              @click="editor.chain().focus().toggleCodeBlock().run()"
            >
              <SquareCode class="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Page Break (inserts new page)"
              :class="tbCls(false)"
              @click="editor.chain().focus().setHorizontalRule().run()"
            >
              <Minus class="h-3.5 w-3.5" />
            </button>

            <div class="w-px h-5 bg-border mx-0.5" />

            <!-- Insert Asset -->
            <button
              type="button"
              title="Insert asset as new page (NPC, Monster…)"
              :class="tbCls(false)"
              class="gap-1 px-2 font-cinzel text-[10px] font-semibold tracking-wider"
              @click="showAssetPanel = true"
            >
              <PackagePlus class="h-3.5 w-3.5" />
              Insert
            </button>

            <div class="w-px h-5 bg-border mx-0.5" />

            <!-- Image controls (shown when an image is selected) -->
            <template v-if="editor.isActive('image')">
              <span
                class="font-cinzel text-[9px] text-muted-foreground tracking-wider px-1 self-center"
                >IMG</span
              >
              <button
                v-for="size in IMAGE_SIZES"
                :key="size.w"
                type="button"
                :title="`${size.label} (${size.w}px)`"
                :class="
                  tbCls(editor.getAttributes('image').width === String(size.w))
                "
                @click="
                  editor
                    .chain()
                    .focus()
                    .updateAttributes('image', { width: String(size.w) })
                    .run()
                "
              >
                <span class="font-cinzel text-[9px] font-bold leading-none">{{
                  size.label
                }}</span>
              </button>
              <div class="w-px h-5 bg-border mx-0.5" />
              <button
                type="button"
                title="Float left"
                :class="
                  tbCls(editor.getAttributes('image').dataAlign === 'left')
                "
                @click="
                  editor
                    .chain()
                    .focus()
                    .updateAttributes('image', { dataAlign: 'left' })
                    .run()
                "
              >
                <AlignLeft class="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title="Center"
                :class="
                  tbCls(editor.getAttributes('image').dataAlign === 'center')
                "
                @click="
                  editor
                    .chain()
                    .focus()
                    .updateAttributes('image', { dataAlign: 'center' })
                    .run()
                "
              >
                <AlignCenter class="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title="Float right"
                :class="
                  tbCls(
                    editor.getAttributes('image').dataAlign === 'right' ||
                      !editor.getAttributes('image').dataAlign,
                  )
                "
                @click="
                  editor
                    .chain()
                    .focus()
                    .updateAttributes('image', { dataAlign: 'right' })
                    .run()
                "
              >
                <AlignRight class="h-3.5 w-3.5" />
              </button>
              <div class="w-px h-5 bg-border mx-0.5" />
            </template>

            <!-- History -->
            <button
              type="button"
              title="Undo"
              :class="tbCls(false)"
              :disabled="!editor.can().undo()"
              @click="editor.chain().focus().undo().run()"
            >
              <Undo2 class="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Redo"
              :class="tbCls(false)"
              :disabled="!editor.can().redo()"
              @click="editor.chain().focus().redo().run()"
            >
              <Redo2 class="h-3.5 w-3.5" />
            </button>

            <div class="w-px h-5 bg-border mx-0.5" />

            <!-- Layout -->
            <button
              type="button"
              title="Toggle two-column preview"
              :class="tbCls(isTwoColumn)"
              @click="isTwoColumn = !isTwoColumn"
            >
              <Columns2 class="h-3.5 w-3.5" />
            </button>

            <!-- Theme -->
            <div
              role="radiogroup"
              aria-label="Preview theme"
              class="ml-1 inline-flex rounded border border-border overflow-hidden shrink-0"
            >
              <button
                type="button"
                role="radio"
                :aria-checked="theme === 'onednd2024'"
                title="OneDnD 2024 theme"
                class="px-2 h-[26px] font-cinzel text-[9px] font-semibold tracking-wider uppercase transition-colors"
                :class="
                  theme === 'onednd2024'
                    ? 'bg-primary/20 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                "
                @click="theme = 'onednd2024'"
              >
                2024
              </button>
              <button
                type="button"
                role="radio"
                :aria-checked="theme === 'phb2014'"
                title="Classic PHB (2014) theme"
                class="px-2 h-[26px] font-cinzel text-[9px] font-semibold tracking-wider uppercase transition-colors border-l border-border"
                :class="
                  theme === 'phb2014'
                    ? 'bg-primary/20 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                "
                @click="theme = 'phb2014'"
              >
                Classic
              </button>
            </div>
          </template>
        </div>

        <!-- Tiptap content -->
        <!--
          Mobile: content grows with the document and the page scrolls — no
          nested scroll trap. Desktop: flex-1 + overflow-auto so the 620px pane
          owns its own scroll like before.
        -->
        <div class="p-4 lg:flex-1 lg:overflow-auto lg:min-h-0">
          <EditorContent :editor="editor" class="phb-editor h-full" />
        </div>

        <!-- Word count footer -->
        <div
          class="px-4 py-1.5 border-t border-border bg-muted/20 flex justify-end shrink-0"
        >
          <span class="font-fell text-[11px] text-muted-foreground italic"
            >{{ wordCount }} words</span
          >
        </div>
      </div>

      <!-- Preview pane -->
      <div
        class="flex flex-col rounded-lg border border-border lg:overflow-hidden"
      >
        <div
          class="flex items-center justify-between px-4 py-2 border-b border-border bg-card shrink-0"
        >
          <p
            class="font-cinzel text-xs font-semibold text-muted-foreground uppercase tracking-widest"
          >
            Preview — {{ themeLabel }}
          </p>
          <div class="flex items-center gap-2">
            <span
              class="px-1.5 py-0.5 rounded font-cinzel text-[10px] font-bold tracking-wider uppercase"
              :style="{
                backgroundColor: typeColor(docType) + '22',
                color: typeColor(docType),
              }"
            >
              {{ DOC_TYPE_LABELS[docType] }}
            </span>
            <button
              type="button"
              title="Export as PDF"
              :disabled="isGeneratingPdf"
              class="inline-flex items-center gap-1 px-2 py-1 rounded font-cinzel text-[10px] font-semibold border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors tracking-wider uppercase disabled:opacity-50 disabled:cursor-not-allowed"
              @click="exportPdf"
            >
              <Loader2 v-if="isGeneratingPdf" class="h-3 w-3 animate-spin" />
              <FileDown v-else class="h-3 w-3" />
              {{ isGeneratingPdf ? "Building…" : "PDF" }}
            </button>
          </div>
        </div>
        <div class="phb-bg lg:flex-1 lg:overflow-auto lg:min-h-0">
          <div
            v-for="(pageHtml, pageIndex) in pages"
            :key="pageIndex"
            class="phb-page"
            :class="themeClass"
          >
            <div v-if="pageIndex === 0" class="phb-title-bar">
              {{ title || "Untitled Document" }}
            </div>
            <div
              class="phb-body"
              :class="[themeClass, { 'phb-two-col': isTwoColumn }]"
              v-html="pageHtml"
            />
          </div>
          <p class="phb-hint">
            ── use the Page Break button (—) to start a new page ──
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useConfirm } from "@/composables/useConfirm";
const { confirm } = useConfirm();
import { ref, computed, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { useEditor, EditorContent } from "@tiptap/vue-3";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import {
  Save,
  Strikethrough,
  Code,
  SquareCode,
  List,
  ListOrdered,
  Quote,
  Minus,
  Undo2,
  Redo2,
  FileDown,
  Loader2,
  PackagePlus,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Trash2,
  Columns2,
} from "lucide-vue-next";
import {
  useCreateScriptoriumDocument,
  useUpdateScriptoriumDocument,
  useDeleteScriptoriumDocument,
} from "@/composables/useScriptorium";
import {
  removeRichTextImages,
  cleanupRemovedRichTextImages,
} from "@/composables/useImageUpload";
import { useScriptoriumPdf } from "@/composables/useScriptoriumPdf";
import type {
  ScriptoriumDocument,
  ScriptoriumDocType,
  ScriptoriumTheme,
} from "@/types/scriptorium.types";
import PdfPreviewDialog from "@/components/scriptorium/PdfPreviewDialog.vue";
import AssetInsertPanel from "@/components/scriptorium/AssetInsertPanel.vue";
import TagInput from "@/components/common/TagInput.vue";

const IMAGE_SIZES = [
  { label: "S", w: 120 },
  { label: "M", w: 200 },
  { label: "L", w: 280 },
  { label: "XL", w: 380 },
] as const;

const DOC_TYPES: { value: ScriptoriumDocType; label: string }[] = [
  { value: "custom", label: "Custom" },
  { value: "spell", label: "Spell" },
  { value: "monster", label: "Monster" },
  { value: "item", label: "Item" },
  { value: "class", label: "Class" },
  { value: "subclass", label: "Subclass" },
  { value: "race", label: "Species" },
  { value: "background", label: "Background" },
  { value: "adventure", label: "Adventure" },
  { value: "npc-sheet", label: "NPC Sheet" },
  { value: "location", label: "Location" },
];

const DOC_TYPE_LABELS: Record<ScriptoriumDocType, string> = {
  custom: "Custom",
  spell: "Spell",
  monster: "Monster",
  item: "Item",
  class: "Class",
  subclass: "Subclass",
  race: "Species",
  background: "Background",
  adventure: "Adventure",
  "npc-sheet": "NPC Sheet",
  location: "Location",
  quest: "Quest",
};

const DOC_TYPE_COLORS: Record<ScriptoriumDocType, string> = {
  custom: "#6b7280",
  spell: "#7c3aed",
  monster: "#dc2626",
  item: "#d97706",
  class: "#2563eb",
  subclass: "#0891b2",
  race: "#059669",
  background: "#9333ea",
  adventure: "#c2410c",
  "npc-sheet": "#0f766e",
  location: "#0369a1",
  quest: "#b45309",
};

function typeColor(t: ScriptoriumDocType) {
  return DOC_TYPE_COLORS[t] ?? "#6b7280";
}
function tbCls(active: boolean) {
  return [
    "p-1 rounded min-w-[26px] h-[26px] flex items-center justify-center transition-colors disabled:opacity-40",
    active
      ? "bg-primary/20 text-primary"
      : "text-muted-foreground hover:text-foreground hover:bg-muted",
  ].join(" ");
}

const props = defineProps<{ doc: ScriptoriumDocument | null }>();
const router = useRouter();

// Panels
const showAssetPanel = ref(false);

// Metadata
const title = ref(props.doc?.title ?? "");
const docType = ref<ScriptoriumDocType>(props.doc?.doc_type ?? "custom");
const isPublished = ref(props.doc?.is_published ?? false);
const isTwoColumn = ref(props.doc?.is_two_column ?? false);
const theme = ref<ScriptoriumTheme>(props.doc?.theme ?? "onednd2024");
const tags = ref<string[]>(props.doc?.tags ?? []);

const themeClass = computed(() =>
  theme.value === "phb2014" ? "theme-phb2014" : "theme-onednd2024",
);
const themeLabel = computed(() =>
  theme.value === "phb2014" ? "Classic PHB (2014)" : "OneDnD 2024",
);

// Editor
const previewHtml = ref("");
const wordCount = ref(0);

function updateDerived(html: string, text: string) {
  previewHtml.value = html;
  wordCount.value = text.trim() ? text.trim().split(/\s+/).length : 0;
}

const editor = useEditor({
  content: (() => {
    if (!props.doc?.content) return "";
    try {
      return JSON.parse(props.doc.content);
    } catch {
      return props.doc.content;
    }
  })(),
  extensions: [
    StarterKit,
    Placeholder.configure({ placeholder: "Begin your document here…" }),
    Image.extend({
      addAttributes() {
        return {
          ...this.parent?.(),
          // Explicit pixel width — html2canvas needs the attribute, not just CSS
          width: {
            default: "200",
            parseHTML: (el) => el.getAttribute("width") ?? "200",
            renderHTML: (attrs) => ({ width: attrs.width }),
          },
          // Alignment drives the inline style (float / centering)
          dataAlign: {
            default: "right",
            parseHTML: (el) => {
              const s = el.getAttribute("style") ?? "";
              if (s.includes("float:left")) return "left";
              if (s.includes("margin:8px auto")) return "center";
              return "right";
            },
            renderHTML: (attrs) => {
              const parts: string[] = [];
              if (attrs.dataAlign === "right")
                parts.push("float:right;margin:0 0 10px 14px");
              else if (attrs.dataAlign === "left")
                parts.push("float:left;margin:0 14px 10px 0");
              else if (attrs.dataAlign === "center")
                parts.push("display:block;margin:8px auto");
              if (attrs.width) parts.push(`width:${attrs.width}px`);
              return { style: parts.join(";") };
            },
          },
        };
      },
    }).configure({ inline: false, allowBase64: false }),
  ],
  onCreate({ editor }) {
    updateDerived(editor.getHTML(), editor.getText());
  },
  onUpdate({ editor }) {
    updateDerived(editor.getHTML(), editor.getText());
  },
});

// Save
const { mutateAsync: create } = useCreateScriptoriumDocument();
const { mutateAsync: update } = useUpdateScriptoriumDocument();
const { mutateAsync: deleteDoc } = useDeleteScriptoriumDocument();
const isSaving = ref(false);
const isDeleting = ref(false);
const saveError = ref("");

async function destroy() {
  if (!props.doc) return;
  if (!(await confirm(`Delete "${props.doc.title}"? This cannot be undone.`)))
    return;
  isDeleting.value = true;
  const oldContent = props.doc.content;
  try {
    await deleteDoc(props.doc.id);
    removeRichTextImages(oldContent);
    router.replace("/scriptorium");
  } catch (e: unknown) {
    saveError.value = e instanceof Error ? e.message : "Failed to delete";
    isDeleting.value = false;
  }
}

async function save() {
  if (!title.value.trim()) return;
  isSaving.value = true;
  saveError.value = "";
  try {
    const payload = {
      title: title.value.trim(),
      content: JSON.stringify(editor.value?.getJSON() ?? {}),
      doc_type: docType.value,
      tags: tags.value,
      is_published: isPublished.value,
      is_two_column: isTwoColumn.value,
      theme: theme.value,
      word_count: wordCount.value,
    };
    if (props.doc) {
      const oldContent = props.doc.content;
      await update({ id: props.doc.id, update: payload });
      cleanupRemovedRichTextImages(oldContent, payload.content);
    } else {
      const created = await create(payload);
      router.replace(`/scriptorium/${created.id}`);
    }
  } catch (e: unknown) {
    saveError.value = e instanceof Error ? e.message : "Failed to save";
  } finally {
    isSaving.value = false;
  }
}

// Split rendered HTML into pages at every <hr> (Page Break)
const pages = computed(() => {
  const html = previewHtml.value || "";
  const parts = html.split(/<hr\s*\/?\s*>/gi);
  while (parts.length > 1 && !parts[parts.length - 1].trim()) parts.pop();
  return parts.length ? parts : [""];
});

const {
  showPdfPreview,
  pdfBlobUrl,
  isGeneratingPdf,
  exportPdf,
  savePdf,
  closePdfPreview,
} = useScriptoriumPdf(pages, title, theme);

onUnmounted(() => editor.value?.destroy());
</script>

<style scoped>
@reference "@/assets/main.css";

/* Keep toolbar children at natural size in the nowrap scroll row on mobile */
.scriptorium-toolbar > * {
  flex-shrink: 0;
}

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
.phb-editor :deep(.ProseMirror h1) {
  @apply font-cinzel text-2xl font-bold mt-4 mb-2;
}
.phb-editor :deep(.ProseMirror h2) {
  @apply font-cinzel text-xl font-bold mt-3 mb-1.5;
}
.phb-editor :deep(.ProseMirror h3) {
  @apply font-cinzel text-base font-semibold mt-2 mb-1;
}
.phb-editor :deep(.ProseMirror ul),
.phb-editor :deep(.ProseMirror ol) {
  @apply pl-6 my-2;
}
.phb-editor :deep(.ProseMirror blockquote) {
  @apply border-l-4 border-primary pl-3 text-muted-foreground italic my-2;
}
.phb-editor :deep(.ProseMirror hr) {
  @apply border-border my-4;
}
.phb-editor :deep(.ProseMirror code) {
  @apply bg-muted px-1 rounded text-sm font-mono;
}
.phb-editor :deep(.ProseMirror pre) {
  @apply bg-muted p-3 rounded my-2 text-sm;
}
.phb-editor :deep(.ProseMirror img) {
  max-width: 380px;
  max-height: 480px;
  border-radius: 6px;
  object-fit: cover;
}

/* ── PHB Preview (themed output) ──────────────────────────────── */
/*
 * Palette + typography contract used by every .phb-* block below.
 * The two themes override this contract; every new scriptorium block
 * type added in future parity tickets MUST consume these vars rather
 * than hex literals so both themes stay in sync.
 *
 * Defaults = OneDnD 2024 (teal). Classic overrides are in
 * `.phb-body.theme-phb2014` below.
 *
 * TODO: swap the web-safe serif fallback for licensed Bookinsanity /
 * Mr Eaves faces once licensing is sorted.
 */
.phb-body.theme-onednd2024,
.phb-body.theme-phb2014,
.phb-page.theme-onednd2024,
.phb-page.theme-phb2014 {
  /* Typography */
  --sc-heading-font: "Cinzel", Georgia, serif;
  --sc-body-font: Georgia, "Times New Roman", serif;

  /* Palette */
  --sc-ink: #1a1a1a;
  --sc-accent: #1b3a4b;
  --sc-accent-contrast: #f9f6ef;
  --sc-page-bg: #f9f6ef;
  --sc-callout-bg: #e8f4f8;
  --sc-callout-border: var(--sc-accent);
  --sc-code-bg: #e4ddd0;
  --sc-col-rule: #c9b99a;

  /* Per-block treatments (themes override these to swap filled-bar H1
     for ruled H1 without rewriting every selector below) */
  --sc-h1-bg: var(--sc-accent);
  --sc-h1-color: var(--sc-accent-contrast);
  --sc-h1-border-b: none;
  --sc-h1-padding: 0.35rem 1rem;
  --sc-title-bar-bg: var(--sc-accent);
  --sc-title-bar-color: var(--sc-accent-contrast);
}

.phb-body.theme-phb2014,
.phb-page.theme-phb2014 {
  --sc-body-font: Georgia, "Palatino Linotype", "Book Antiqua", serif;
  --sc-accent: #58180d; /* deep red-brown, classic PHB ink */
  --sc-accent-contrast: #eeeadf;
  --sc-page-bg: #eeeadf;
  --sc-callout-bg: #e0e5c1; /* light olive/cream */

  /* Classic H1: no filled bar — red title on parchment with double rule below */
  --sc-h1-bg: transparent;
  --sc-h1-color: var(--sc-accent);
  --sc-h1-border-b: 3px double var(--sc-accent);
  --sc-h1-padding: 0.35rem 0 0.25rem;
}

/* Parchment-gray canvas between pages */
.phb-bg {
  background: #a09a90;
  padding: 1.5rem 1rem 3rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;
}

.phb-two-col {
  column-count: 2;
  column-gap: 1.5rem;
  column-rule: 1px solid var(--sc-col-rule);
}
.phb-two-col :deep(h1),
.phb-two-col :deep(h2) {
  column-span: all;
}

.phb-page {
  position: relative;
  width: 100%;
  max-width: 680px;
  min-height: 961px; /* 680px × (297/210) = A4 aspect ratio */
  background: url("/assets/scriptorium/page-background.webp") center / cover
    no-repeat;
  padding: 2.5rem 2.5rem 2rem;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.45);
  font-family: var(--sc-body-font);
  color: var(--sc-ink);
  line-height: 1.65;
  font-size: 0.9375rem;
  overflow: visible;
}

.phb-title-bar {
  font-family: var(--sc-heading-font);
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--sc-title-bar-color);
  background: var(--sc-title-bar-bg);
  padding: 0.6rem 2.5rem;
  margin: -2.5rem -2.5rem 1.75rem;
  letter-spacing: 0.04em;
  line-height: 1.25;
}

.phb-hint {
  font-family: "Cinzel", Georgia, serif;
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.4);
  text-align: center;
  letter-spacing: 0.06em;
  padding: 0.5rem 0;
}

.phb-body :deep(h1) {
  font-family: var(--sc-heading-font);
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--sc-h1-color);
  background: var(--sc-h1-bg);
  border-bottom: var(--sc-h1-border-b);
  padding: var(--sc-h1-padding);
  margin: 1.5rem -1rem 1rem;
  letter-spacing: 0.03em;
}
.phb-body :deep(h2) {
  font-family: var(--sc-heading-font);
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--sc-accent);
  border-bottom: 2px solid var(--sc-accent);
  padding-bottom: 0.2rem;
  margin: 1.25rem 0 0.6rem;
  letter-spacing: 0.02em;
}
.phb-body :deep(h3) {
  font-family: var(--sc-heading-font);
  font-size: 0.9375rem;
  font-weight: 600;
  font-style: italic;
  color: var(--sc-accent);
  margin: 1rem 0 0.35rem;
}
.phb-body :deep(p) {
  margin: 0 0 0.6rem;
}
.phb-body :deep(ul),
.phb-body :deep(ol) {
  padding-left: 1.25rem;
  margin: 0.375rem 0 0.6rem;
}
.phb-body :deep(li) {
  margin: 0.2rem 0;
}
.phb-body :deep(blockquote) {
  border-left: 4px solid var(--sc-callout-border);
  background: var(--sc-callout-bg);
  padding: 0.6rem 0.875rem;
  margin: 0.875rem 0;
  border-radius: 0 4px 4px 0;
  font-style: italic;
}
.phb-body :deep(blockquote p) {
  margin: 0;
}
.phb-body :deep(strong) {
  font-weight: 700;
}
.phb-body :deep(em) {
  font-style: italic;
}
/* <hr> = page break separator — hidden in preview, pages split on it */
.phb-body :deep(hr) {
  display: none;
}
.phb-body :deep(code) {
  background: var(--sc-code-bg);
  padding: 0.1em 0.35em;
  border-radius: 2px;
  font-family: "Courier New", monospace;
  font-size: 0.875em;
}
.phb-body :deep(pre) {
  background: var(--sc-accent);
  color: var(--sc-accent-contrast);
  padding: 0.875rem;
  border-radius: 4px;
  overflow-x: auto;
  margin: 0.875rem 0;
  font-size: 0.875em;
}
.phb-body :deep(pre code) {
  background: transparent;
  padding: 0;
  color: inherit;
}
</style>
