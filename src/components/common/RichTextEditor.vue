<template>
  <div
    class="rich-editor relative flex flex-col rounded-lg border border-border bg-card overflow-clip"
    :style="{ minHeight: minHeight ?? '180px' }"
  >
    <div
      :class="[
        'flex flex-wrap items-center gap-0.5 p-1.5 border-b border-border bg-card shrink-0 z-20 rte-toolbar',
        stickyToolbar !== false && 'sticky top-11 md:top-0',
      ]"
    >
      <template v-if="editor">
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
          title="Underline"
          :class="tbCls(editor.isActive('underline'))"
          @click="editor.chain().focus().toggleUnderline().run()"
        >
          <IconUnderline class="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Highlight"
          :class="tbCls(editor.isActive('highlight'))"
          @click="editor.chain().focus().toggleHighlight().run()"
        >
          <IconHighlight class="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Link"
          :class="tbCls(editor.isActive('link'))"
          @click="toggleLink"
        >
          <IconLink class="h-3.5 w-3.5" />
        </button>
        <div class="w-px h-5 bg-border mx-0.5" />
        <button
          type="button"
          title="Align left"
          :class="tbCls(editor.isActive({ textAlign: 'left' }))"
          @click="editor.chain().focus().setTextAlign('left').run()"
        >
          <IconAlignLeft class="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Align center"
          :class="tbCls(editor.isActive({ textAlign: 'center' }))"
          @click="editor.chain().focus().setTextAlign('center').run()"
        >
          <IconAlignCenter class="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Align right"
          :class="tbCls(editor.isActive({ textAlign: 'right' }))"
          @click="editor.chain().focus().setTextAlign('right').run()"
        >
          <IconAlignRight class="h-3.5 w-3.5" />
        </button>
        <div class="w-px h-5 bg-border mx-0.5" />
        <button
          type="button"
          title="Heading 1"
          :class="tbCls(editor.isActive('heading', { level: 1 }))"
          @click="editor.chain().focus().toggleHeading({ level: 1 }).run()"
        >
          <span class="text-[10px] font-cinzel font-bold leading-none">H1</span>
        </button>
        <button
          type="button"
          title="Heading 2"
          :class="tbCls(editor.isActive('heading', { level: 2 }))"
          @click="editor.chain().focus().toggleHeading({ level: 2 }).run()"
        >
          <span class="text-[10px] font-cinzel font-bold leading-none">H2</span>
        </button>
        <button
          type="button"
          title="Heading 3"
          :class="tbCls(editor.isActive('heading', { level: 3 }))"
          @click="editor.chain().focus().toggleHeading({ level: 3 }).run()"
        >
          <span class="text-[10px] font-cinzel font-bold leading-none">H3</span>
        </button>
        <div class="w-px h-5 bg-border mx-0.5" />
        <button
          type="button"
          title="Bullet list"
          :class="tbCls(editor.isActive('bulletList'))"
          @click="editor.chain().focus().toggleBulletList().run()"
        >
          <IconList class="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Ordered list"
          :class="tbCls(editor.isActive('orderedList'))"
          @click="editor.chain().focus().toggleOrderedList().run()"
        >
          <IconListOrdered class="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Blockquote"
          :class="tbCls(editor.isActive('blockquote'))"
          @click="editor.chain().focus().toggleBlockquote().run()"
        >
          <IconQuote class="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Task list"
          :class="tbCls(editor.isActive('taskList'))"
          @click="editor.chain().focus().toggleTaskList().run()"
        >
          <IconListTodo class="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Horizontal rule"
          :class="tbCls(false)"
          @click="editor.chain().focus().setHorizontalRule().run()"
        >
          <IconMinus class="h-3.5 w-3.5" />
        </button>
        <div class="w-px h-5 bg-border mx-0.5" />
        <!-- Table controls -->
        <button
          type="button"
          title="Insert table"
          :class="tbCls(editor.isActive('table'))"
          @click="
            editor
              .chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          "
        >
          <IconTable class="h-3.5 w-3.5" />
        </button>
        <template v-if="editor.isActive('table')">
          <button
            type="button"
            title="Add column after"
            :class="tbCls(false)"
            @click="editor.chain().focus().addColumnAfter().run()"
          >
            <IconInsertColumn class="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Add row after"
            :class="tbCls(false)"
            @click="editor.chain().focus().addRowAfter().run()"
          >
            <IconInsertRow class="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="Delete column"
            :class="tbCls(false)"
            @click="editor.chain().focus().deleteColumn().run()"
          >
            <span
              class="text-[9px] font-cinzel font-bold leading-none text-destructive"
              >−C</span
            >
          </button>
          <button
            type="button"
            title="Delete row"
            :class="tbCls(false)"
            @click="editor.chain().focus().deleteRow().run()"
          >
            <span
              class="text-[9px] font-cinzel font-bold leading-none text-destructive"
              >−R</span
            >
          </button>
          <button
            type="button"
            title="Delete table"
            :class="tbCls(false)"
            @click="editor.chain().focus().deleteTable().run()"
          >
            <IconDelete class="h-3.5 w-3.5 text-destructive" />
          </button>
        </template>
        <button
          v-if="allowUpload"
          type="button"
          title="Upload image"
          :class="tbCls(false)"
          :disabled="uploadingImage"
          @click="insertImage"
        >
          <IconImage
            class="h-3.5 w-3.5"
            :class="uploadingImage ? 'animate-pulse' : ''"
          />
        </button>
        <!-- Image size presets — only shown when an image node is selected -->
        <template v-if="editor.isActive('image')">
          <div class="w-px h-5 bg-border mx-0.5" />
          <button
            v-for="preset in IMG_SIZE_PRESETS"
            :key="preset.value"
            type="button"
            :title="`Image width: ${preset.label}`"
            :class="tbCls(editor.getAttributes('image').width === preset.value)"
            @click="editor.chain().focus().updateAttributes('image', { width: preset.value }).run()"
          >
            <span class="text-[9px] font-cinzel font-bold leading-none">{{ preset.label }}</span>
          </button>
        </template>
        <div class="w-px h-5 bg-border mx-0.5" />
        <button
          type="button"
          title="Undo"
          :class="tbCls(false)"
          :disabled="!editor.can().undo()"
          @click="editor.chain().focus().undo().run()"
        >
          <IconUndo class="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Redo"
          :class="tbCls(false)"
          :disabled="!editor.can().redo()"
          @click="editor.chain().focus().redo().run()"
        >
          <IconRedo class="h-3.5 w-3.5" />
        </button>
        <div class="w-px h-5 bg-border mx-0.5" />
        <button
          type="button"
          title="Wrap selection in two columns (click again to remove)"
          :class="tbCls(editor.isActive('columns'))"
          @click="editor.chain().focus().toggleColumns().run()"
        >
          <IconColumns class="h-3.5 w-3.5" />
        </button>
        <!-- Calendar event ref — only when allowCalendarEvents is enabled -->
        <template v-if="allowCalendarEvents">
          <div class="w-px h-5 bg-border mx-0.5" />
          <button
            type="button"
            title="Insert calendar event reference"
            :class="tbCls(false)"
            @click="emit('insert-calendar-event')"
          >
            <IconCalendarDays class="h-3.5 w-3.5" />
          </button>
        </template>
      </template>
      <slot name="toolbar-end" />
    </div>

    <!-- Content area -->
    <div class="p-3 lg:flex-1 lg:overflow-auto lg:min-h-0 cursor-text" @click="onContentAreaClick">
      <EditorContent
        :editor="editor"
        :class="['rte-content h-full', twoColumn ? 'rte-two-col' : '']"
      />
    </div>

    <!-- Hidden file input for image upload -->
    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      class="hidden"
      @change="onFileSelected"
    />

    <!-- AI Enhance bubble menu — appears on text selection when a text provider is configured -->
    <BubbleMenu
      v-if="editor && showEnhanceButton"
      :editor="editor"
      :tippy-options="{ duration: 100 }"
    >
      <div class="flex items-center rounded-md border border-border bg-card shadow-lg overflow-hidden">
        <button
          type="button"
          :disabled="isEnhancing"
          class="flex items-center gap-1.5 px-2.5 py-1.5 font-cinzel text-[11px] font-semibold tracking-wide text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
          @click="onEnhance"
        >
          <IconLoadingAlt v-if="isEnhancing" class="h-3 w-3 animate-spin" />
          <IconWand v-else class="h-3 w-3" />
          Enhance
        </button>
      </div>
    </BubbleMenu>

    <!-- Inline error feedback for enhancement failures -->
    <Transition name="enhance-error">
      <div
        v-if="enhanceError"
        class="absolute bottom-2 left-2 right-2 z-30 rounded-md bg-destructive/90 px-3 py-2 font-fell text-xs text-white shadow-lg"
      >
        {{ enhanceError }}
      </div>
    </Transition>

    <!-- Entity mention suggestion popup -->
    <Teleport to="body">
      <div
        v-if="suggestionState.active && suggestionState.items.length"
        class="entity-suggestion-popup"
        :style="{ top: `${suggestionState.position.top}px`, left: `${suggestionState.position.left}px` }"
      >
        <button
          v-for="(item, idx) in suggestionState.items"
          :key="item.id"
          type="button"
          class="entity-suggestion-item"
          :class="[
            `entity-suggestion-item--${item.entityType}`,
            idx === suggestionState.selectedIndex ? 'entity-suggestion-item--active' : '',
          ]"
          @mouseenter="suggestionState.selectedIndex = idx"
          @click="selectSuggestionItem(idx)"
        >
          <span class="entity-suggestion-badge" :class="`entity-suggestion-badge--${item.entityType}`">
            {{ ENTITY_TYPE_LABELS[item.entityType] }}
          </span>
          {{ item.label }}
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onUnmounted } from "vue";
import { getCurrentUser } from "@/lib/supabase";
import { toWebP } from "@/lib/mediaConvert";
import { uploadToBucket } from "@/lib/storage";
import { useEditor, EditorContent } from "@tiptap/vue-3";
import { BubbleMenu } from "@tiptap/vue-3/menus";
import { Node } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";

import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import Image from "@tiptap/extension-image";
import Highlight from "@tiptap/extension-highlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Typography from "@tiptap/extension-typography";

// Extend Image to persist a width attribute as an inline style.
// Stored as a CSS value string, e.g. "25%", "50%", "75%", "100%".
const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        renderHTML(attrs) {
          return attrs.width ? { style: `width: ${attrs.width}; height: auto;` } : {};
        },
        parseHTML(el) {
          return (el as HTMLImageElement).style.width || null;
        },
      },
    };
  },
});
import { parseMarkdown, looksLikeMarkdown, sanitizePasteText } from "@/lib/markdownToTiptap";
import { useTextEnhancement } from "@/ai/useTextEnhancement";
import { IconAlignCenter, IconAlignLeft, IconAlignRight, IconCalendarDays, IconColumns, IconDelete, IconHighlight, IconImage, IconInsertColumn, IconInsertRow, IconLink, IconList, IconListOrdered, IconListTodo, IconLoadingAlt, IconMinus, IconQuote, IconRedo, IconTable, IconUnderline, IconUndo, IconWand } from '@/lib/icons';
import TextAlign from "@tiptap/extension-text-align";
import { Columns } from "@/lib/tiptap/Columns";
import { CalendarEventRef } from "@/lib/tiptap/CalendarEventRef";
import type { CalendarEventRefAttrs } from "@/lib/tiptap/CalendarEventRef";
import { createEntityMentionExtension } from "@/lib/tiptap/EntityMention";
import type { EntityMentionItem, EntityMentionAttrs, EntityType } from "@/lib/tiptap/EntityMention";
import { IllustrationSuggestion } from "@/lib/tiptap/IllustrationSuggestion";

const CustomDocument = Node.create({
  name: "doc",
  topNode: true,
  content: "block+",
  addAttributes() {
    return { twoColumn: { default: false } };
  },
});

const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  player: "PC",
  npc: "NPC",
  monster: "MON",
  location: "LOC",
  party: "PARTY",
};

const {
  modelValue,
  placeholder,
  allowCalendarEvents,
  entityMentionItems,
  stickyToolbar,
  aiContext,
} = defineProps<{
  modelValue: string | null;
  placeholder?: string;
  minHeight?: string;
  allowUpload?: boolean;
  allowCalendarEvents?: boolean;
  entityMentionItems?: EntityMentionItem[];
  stickyToolbar?: boolean;
  aiContext?: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  "insert-calendar-event": [];
  "illustration-click": [prompt: string];
}>();

// ── Entity mention suggestion state ──────────────────────────────────────────

interface SuggestionState {
  active: boolean;
  items: EntityMentionItem[];
  selectedIndex: number;
  position: { top: number; left: number };
  command: ((item: EntityMentionItem) => void) | null;
}

const suggestionState = reactive<SuggestionState>({
  active: false,
  items: [],
  selectedIndex: 0,
  position: { top: 0, left: 0 },
  command: null,
});

function selectSuggestionItem(index: number) {
  const item = suggestionState.items[index];
  if (item && suggestionState.command) {
    suggestionState.command(item);
    suggestionState.active = false;
  }
}

const entityMentionExtension = createEntityMentionExtension({
  items: ({ query }) =>
    (entityMentionItems ?? [])
      .filter((i) => i.label.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 8),

  render: () => ({
    onStart(p) {
      suggestionState.active = true;
      suggestionState.items = p.items as EntityMentionItem[];
      suggestionState.selectedIndex = 0;
      const rect = p.clientRect?.();
      if (rect) {
        suggestionState.position = {
          top: rect.bottom + window.scrollY + 4,
          left: rect.left + window.scrollX,
        };
      }
      suggestionState.command = (item: EntityMentionItem) => p.command(item);
    },
    onUpdate(p) {
      suggestionState.items = p.items as EntityMentionItem[];
      suggestionState.selectedIndex = 0;
      const rect = p.clientRect?.();
      if (rect) {
        suggestionState.position = {
          top: rect.bottom + window.scrollY + 4,
          left: rect.left + window.scrollX,
        };
      }
      suggestionState.command = (item: EntityMentionItem) => p.command(item);
    },
    onExit() {
      suggestionState.active = false;
      suggestionState.items = [];
      suggestionState.command = null;
    },
    onKeyDown({ event }) {
      if (!suggestionState.active || !suggestionState.items.length) return false;
      if (event.key === "ArrowDown") {
        suggestionState.selectedIndex =
          (suggestionState.selectedIndex + 1) % suggestionState.items.length;
        return true;
      }
      if (event.key === "ArrowUp") {
        suggestionState.selectedIndex =
          (suggestionState.selectedIndex - 1 + suggestionState.items.length) %
          suggestionState.items.length;
        return true;
      }
      if (event.key === "Enter") {
        selectSuggestionItem(suggestionState.selectedIndex);
        return true;
      }
      if (event.key === "Escape") {
        suggestionState.active = false;
        return true;
      }
      return false;
    },
  }),

  command: ({ editor, range, props: item }) => {
    const mentionAttrs: EntityMentionAttrs = {
      id: (item as EntityMentionItem).id,
      entityType: (item as EntityMentionItem).entityType,
      label: (item as EntityMentionItem).label,
    };
    editor.chain().focus().deleteRange(range).insertEntityMention(mentionAttrs).run();
  },
});

/** Recursively remove link marks from Tiptap JSON (from DnDBeyond-pasted content). */
function stripLinkMarks(node: unknown): unknown {
  if (!node || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map(stripLinkMarks);
  const obj = node as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (key === "marks" && Array.isArray(val)) {
      result[key] = (val as Array<{ type: string }>).filter(
        (m) => m.type !== "link",
      );
    } else {
      result[key] = stripLinkMarks(val);
    }
  }
  return result;
}

function parseContent(value: string | null): object | string | undefined {
  if (!value) return undefined;
  try {
    return stripLinkMarks(JSON.parse(value)) as object;
  } catch {
    // Legacy plain text — Tiptap will wrap in a paragraph
    return value;
  }
}

const editor = useEditor({
  content: parseContent(modelValue),
  extensions: [
    StarterKit.configure({
      document: false,
      link: { openOnClick: false, HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" } },
    }),
    CustomDocument,
    Placeholder.configure({
      placeholder: placeholder ?? "Write something…",
    }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    ResizableImage,
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Columns,
    Highlight,
    TaskList,
    TaskItem.configure({ nested: true }),
    Typography,
    ...(allowCalendarEvents ? [CalendarEventRef] : []),
    entityMentionExtension,
    IllustrationSuggestion.configure({
      onPromptClick: (prompt) => emit("illustration-click", prompt),
    }),
  ],
  editorProps: {
    handlePaste(view, event) {
      const raw = event.clipboardData?.getData("text/plain") ?? "";
      const text = sanitizePasteText(raw);
      if (!looksLikeMarkdown(text)) return false;
      event.preventDefault();
      try {
        const content = parseMarkdown(text);
        view.dispatch(
          view.state.tr.replaceSelectionWith(
            view.state.schema.nodeFromJSON({ type: "doc", content }),
            false,
          ),
        );
      } catch {
        // Markdown parse or schema error — fall back to plain text insert
        view.dispatch(
          view.state.tr.insertText(text),
        );
      }
      return true;
    },
    transformPastedHTML(html) {
      // Strip <a> tags and font-family styles from pasted HTML
      const div = document.createElement("div");
      div.innerHTML = html;
      // Remove links but keep content
      div.querySelectorAll("a").forEach((a) => a.replaceWith(...a.childNodes));
      // Strip font-family from all style attributes
      div.querySelectorAll("[style]").forEach((el) => {
        const style = el.getAttribute("style") ?? "";
        // Remove font-family and plain font properties
        const cleaned = style
          .split(";")
          .filter((prop) => {
            const key = prop.split(":")[0]?.trim().toLowerCase();
            return key && !key.match(/^font(-family)?$/);
          })
          .join(";")
          .trim();
        if (cleaned) {
          el.setAttribute("style", cleaned);
        } else {
          el.removeAttribute("style");
        }
      });
      return div.innerHTML;
    },
  },
  onTransaction({ editor: e }) {
    twoColumn.value = e.state.doc.attrs.twoColumn ?? false;
  },
  onUpdate({ editor: e }) {
    // Use the editor instance from the callback, not the `editor` ref: during
    // editor construction onUpdate can fire before useEditor() has assigned the
    // ref, leaving editor.value null. The old `?? {}` fallback then emitted "{}",
    // which silently overwrote real notes with an empty object on load.
    emit("update:modelValue", JSON.stringify(e.getJSON()));
  },
});

onUnmounted(() => editor.value?.destroy());

defineExpose({
  insertCalendarEventRef(attrs: CalendarEventRefAttrs): void {
    editor.value?.commands.insertCalendarEventRef(attrs);
  },
  insertEntityMention(attrs: EntityMentionAttrs): void {
    editor.value?.commands.insertEntityMention(attrs);
  },
  insertImageAtCursor(src: string): void {
    editor.value?.chain().focus().setImage({ src }).run();
  },
  insertMarkdownContent(md: string): void {
    const nodes = parseMarkdown(md);
    const pos = editor.value?.state.selection.to ?? editor.value?.state.doc.content.size ?? 0;
    editor.value
      ?.chain()
      .focus()
      .insertContentAt(pos, nodes, { parseOptions: { preserveWhitespace: false } })
      .run();
  },
  insertChronicleContent(md: string): void {
    const content: object[] = [];
    let last = 0;
    for (const m of md.matchAll(/^\[\[scene:\s*(.+?)\]\]\s*$/gm)) {
      const textBefore = md.slice(last, m.index!);
      if (textBefore.trim()) content.push(...parseMarkdown(textBefore));
      content.push({ type: "illustrationSuggestion", attrs: { prompt: m[1].trim() } });
      last = m.index! + m[0].length;
    }
    const textAfter = md.slice(last);
    if (textAfter.trim()) content.push(...parseMarkdown(textAfter));
    if (!content.length) return;
    const pos = editor.value?.state.selection.to ?? editor.value?.state.doc.content.size ?? 0;
    editor.value
      ?.chain()
      .focus()
      .insertContentAt(pos, content, { parseOptions: { preserveWhitespace: false } })
      .run();
  },
});

const IMG_SIZE_PRESETS = [
  { label: "¼", value: "25%" },
  { label: "½", value: "50%" },
  { label: "¾", value: "75%" },
  { label: "Full", value: "100%" },
] as const;

// twoColumn: legacy doc-level attribute kept for rendering existing saved content.
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
    const webpFile = await toWebP(file);
    const ext = webpFile.type === "image/jpeg" ? "jpeg" : "webp";
    const url = await uploadToBucket({
      bucket: "assetImages",
      blob: webpFile,
      path: `${user!.id}/rte-${Date.now()}.${ext}`,
      contentType: webpFile.type,
    });
    if (!url) throw new Error("upload failed");
    editor.value.chain().focus().setImage({ src: url }).run();
  } catch {
  } finally {
    uploadingImage.value = false;
  }
}

function toggleLink() {
  if (!editor.value) return;
  if (editor.value.isActive("link")) {
    editor.value.chain().focus().unsetLink().run();
  } else {
    const url = window.prompt("Enter URL");
    if (url) editor.value.chain().focus().setLink({ href: url }).run();
  }
}

function onContentAreaClick(e: MouseEvent) {
  if (!editor.value) return;
  if (editor.value.view.dom.contains(e.target as unknown as globalThis.Node)) return;
  // Only jump to end when clicking BELOW the editor content, not to the sides.
  const pmRect = editor.value.view.dom.getBoundingClientRect();
  if (e.clientY > pmRect.bottom) {
    editor.value.commands.focus("end");
  } else {
    editor.value.commands.focus();
  }
}

// ── AI text enhancement ───────────────────────────────────────────────────────

const { isEnhancing, hasTextProvider, enhance } = useTextEnhancement();
const enhanceError = ref<string | null>(null);

const showEnhanceButton = computed(() => {
  if (!aiContext) return false;
  return hasTextProvider();
});

async function onEnhance() {
  if (!editor.value || isEnhancing.value) return;
  const { from, to } = editor.value.state.selection;
  if (from === to) return;

  const selectedText = editor.value.state.doc.textBetween(from, to, " ");
  if (!selectedText.trim()) return;

  enhanceError.value = null;
  try {
    const markdown = await enhance(selectedText, aiContext ?? "general note");
    const nodes = parseMarkdown(markdown);
    editor.value
      .chain()
      .focus()
      .deleteRange({ from, to })
      .insertContentAt(from, nodes, { parseOptions: { preserveWhitespace: false } })
      .run();
  } catch (e) {
    enhanceError.value = e instanceof Error ? e.message : "Enhancement failed";
    setTimeout(() => { enhanceError.value = null; }, 4000);
  }
}

function tbCls(active: boolean) {
  return [
    "p-1 rounded min-w-6.5 h-6.5 flex items-center justify-center transition-colors disabled:opacity-40",
    active
      ? "bg-primary/20 text-primary"
      : "text-muted-foreground hover:text-foreground hover:bg-muted",
  ].join(" ");
}
</script>

<style scoped>
@reference "@/assets/main.css";

/* Keep toolbar children at natural size in the nowrap scroll row on mobile */
.rte-toolbar > * {
  flex-shrink: 0;
}

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
  column-rule: 1px solid theme(colors.border);
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

/* Visible selection highlight (important on dark backgrounds & over images) */
.rte-content :deep(.ProseMirror) ::selection {
  background: theme(colors.primary / 30%);
}

/* Make image selection visible within a text range selection */
.rte-content :deep(.ProseMirror img) {
  outline: 2px solid transparent;
  outline-offset: 2px;
  transition: outline-color 0.1s;
}
.rte-content :deep(.ProseMirror img.ProseMirror-selectednode) {
  outline-color: theme(colors.primary);
}

/* Underline */
.rte-content :deep(.ProseMirror u) {
  @apply underline;
}

/* Highlight */
.rte-content :deep(.ProseMirror mark) {
  @apply bg-yellow-400/25 text-foreground rounded-sm px-0.5;
}

/* Link */
.rte-content :deep(.ProseMirror a) {
  @apply text-primary underline cursor-pointer;
}
.rte-content :deep(.ProseMirror a:hover) {
  @apply opacity-80;
}

/* Task list */
.rte-content :deep(.ProseMirror ul[data-type="taskList"]) {
  @apply list-none pl-1 mb-3 space-y-1;
}
.rte-content :deep(.ProseMirror li[data-type="taskItem"]) {
  @apply flex items-start gap-2;
}
.rte-content :deep(.ProseMirror li[data-type="taskItem"] > label) {
  @apply flex items-center pt-0.5 shrink-0;
}
.rte-content :deep(.ProseMirror li[data-type="taskItem"] > label > input[type="checkbox"]) {
  @apply w-3.5 h-3.5 accent-primary cursor-pointer;
}
.rte-content :deep(.ProseMirror li[data-type="taskItem"][data-checked="true"] > div) {
  @apply line-through text-muted-foreground;
}

/* Per-segment two-column block */
.rte-content :deep(.ProseMirror [data-type="columns"]) {
  column-count: 2;
  column-gap: 1.75rem;
  column-rule: 1px solid theme(colors.border);
  @apply my-3;
}

/* ── Entity mention suggestion popup ────────────────────────────────────── */
.entity-suggestion-popup {
  position: absolute;
  z-index: 9999;
  min-width: 180px;
  max-width: 280px;
  background: theme(colors.card);
  border: 1px solid theme(colors.border);
  border-radius: 0.5rem;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.entity-suggestion-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.75rem;
  font-family: var(--font-fell, serif);
  font-size: 0.8rem;
  color: theme(colors.foreground);
  text-align: left;
  width: 100%;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background-color 0.1s;
}
.entity-suggestion-item:hover,
.entity-suggestion-item--active {
  background: theme(colors.muted);
}

.entity-suggestion-badge {
  font-family: var(--font-cinzel, serif);
  font-size: 0.55rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  padding: 0.1rem 0.35rem;
  border-radius: 9999px;
  border: 1px solid;
  white-space: nowrap;
  flex-shrink: 0;
}
.entity-suggestion-badge--player {
  color: theme(colors.blue-400);
  border-color: theme(colors.blue-400 / 40%);
  background: theme(colors.blue-400 / 10%);
}
.entity-suggestion-badge--npc {
  color: theme(colors.violet-400);
  border-color: theme(colors.violet-400 / 40%);
  background: theme(colors.violet-400 / 10%);
}
/* ── Enhance error toast transition ─────────────────────────────────────── */
.enhance-error-enter-active { transition: all 0.15s ease-out; }
.enhance-error-leave-active { transition: all 0.15s ease-in; }
.enhance-error-enter-from,
.enhance-error-leave-to    { opacity: 0; transform: translateY(4px); }

.entity-suggestion-badge--monster {
  color: theme(colors.rose-400);
  border-color: theme(colors.rose-400 / 40%);
  background: theme(colors.rose-400 / 10%);
}
</style>
