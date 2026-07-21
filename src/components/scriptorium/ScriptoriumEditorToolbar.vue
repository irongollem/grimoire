<template>
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
        <strong class="text-xs leading-none">B</strong>
      </button>
      <button
        type="button"
        title="Italic"
        :class="tbCls(editor.isActive('italic'))"
        @click="editor.chain().focus().toggleItalic().run()"
      >
        <em class="text-xs leading-none">I</em>
      </button>
      <button
        type="button"
        title="Strikethrough"
        :class="tbCls(editor.isActive('strike'))"
        @click="editor.chain().focus().toggleStrike().run()"
      >
        <IconStrikethrough class="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        title="Inline code"
        :class="tbCls(editor.isActive('code'))"
        @click="editor.chain().focus().toggleCode().run()"
      >
        <IconCodeInline class="h-3.5 w-3.5" />
      </button>

      <div class="w-px h-5 bg-border mx-0.5" />

      <!-- Headings -->
      <button
        type="button"
        title="Heading 1"
        :class="tbCls(editor.isActive('heading', { level: 1 }))"
        @click="editor.chain().focus().toggleHeading({ level: 1 }).run()"
      >
        <span class="text-2xs font-cinzel font-bold leading-none">H1</span>
      </button>
      <button
        type="button"
        title="Heading 2"
        :class="tbCls(editor.isActive('heading', { level: 2 }))"
        @click="editor.chain().focus().toggleHeading({ level: 2 }).run()"
      >
        <span class="text-2xs font-cinzel font-bold leading-none">H2</span>
      </button>
      <button
        type="button"
        title="Heading 3"
        :class="tbCls(editor.isActive('heading', { level: 3 }))"
        @click="editor.chain().focus().toggleHeading({ level: 3 }).run()"
      >
        <span class="text-2xs font-cinzel font-bold leading-none">H3</span>
      </button>

      <div class="w-px h-5 bg-border mx-0.5" />

      <!-- Blocks -->
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
        title="Blockquote / callout"
        :class="tbCls(editor.isActive('blockquote'))"
        @click="editor.chain().focus().toggleBlockquote().run()"
      >
        <IconQuote class="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        title="Inline block"
        :class="tbCls(editor.isActive('codeBlock'))"
        @click="editor.chain().focus().toggleCodeBlock().run()"
      >
        <IconCodeBlock class="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        title="Wide Block (spans both columns)"
        :class="tbCls(editor.isActive('wideBlock'))"
        @click="editor.chain().focus().toggleWideBlock().run()"
      >
        <IconRect class="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        title="Page Break (inserts new page)"
        :class="tbCls(false)"
        @click="editor.chain().focus().setHorizontalRule().run()"
      >
        <IconMinus class="h-3.5 w-3.5" />
      </button>

      <div class="w-px h-5 bg-border mx-0.5" />

      <!-- Insert Asset -->
      <button
        type="button"
        title="Insert asset as new page (NPC, Monster…)"
        :class="tbCls(false)"
        class="gap-1 px-2 text-label font-semibold"
        @click="$emit('openAssetPanel')"
      >
        <IconAddItem class="h-3.5 w-3.5" />
        Insert
      </button>

      <!-- Insert Block picker -->
      <button
        type="button"
        title="Insert block…"
        :class="tbCls(showBlockPicker)"
        class="gap-1 px-2 text-label font-semibold"
        @click="$emit('openBlockPicker')"
      >
        <IconGridView class="h-3.5 w-3.5" />
        Block
      </button>

      <div class="w-px h-5 bg-border mx-0.5" />

      <!-- Image controls (shown when an image is selected) -->
      <template v-if="editor.isActive('image')">
        <span class="text-label text-muted-foreground px-1 self-center">IMG</span>
        <button
          v-for="size in IMAGE_SIZES"
          :key="size.w"
          type="button"
          :title="`${size.label} (${size.w}px)`"
          :class="tbCls(editor.getAttributes('image').width === String(size.w))"
          @click="editor.chain().focus().updateAttributes('image', { width: String(size.w) }).run()"
        >
          <span class="font-cinzel text-2xs font-bold leading-none">{{ size.label }}</span>
        </button>
        <div class="w-px h-5 bg-border mx-0.5" />
        <button
          type="button"
          title="Float left"
          :class="tbCls(editor.getAttributes('image').dataAlign === 'left')"
          @click="editor.chain().focus().updateAttributes('image', { dataAlign: 'left', layoutMode: 'inline' }).run()"
        >
          <IconAlignLeft class="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Center"
          :class="tbCls(editor.getAttributes('image').dataAlign === 'center')"
          @click="editor.chain().focus().updateAttributes('image', { dataAlign: 'center', layoutMode: 'inline' }).run()"
        >
          <IconAlignCenter class="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Float right"
          :class="tbCls(editor.getAttributes('image').dataAlign === 'right' || !editor.getAttributes('image').dataAlign)"
          @click="editor.chain().focus().updateAttributes('image', { dataAlign: 'right', layoutMode: 'inline' }).run()"
        >
          <IconAlignRight class="h-3.5 w-3.5" />
        </button>
        <div class="w-px h-5 bg-border mx-0.5" />
        <!-- Layout mode controls -->
        <span class="text-label text-muted-foreground px-1 self-center">LAYOUT</span>
        <button
          type="button"
          title="Wrap left — text flows around right edge"
          :class="tbCls(editor.getAttributes('image').layoutMode === 'wrapLeft')"
          @click="editor.chain().focus().updateAttributes('image', { layoutMode: 'wrapLeft' }).run()"
        >
          <IconWrapText class="h-3.5 w-3.5 scale-x-[-1]" />
        </button>
        <button
          type="button"
          title="Wrap right — text flows around left edge"
          :class="tbCls(editor.getAttributes('image').layoutMode === 'wrapRight')"
          @click="editor.chain().focus().updateAttributes('image', { layoutMode: 'wrapRight' }).run()"
        >
          <IconWrapText class="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Absolute position — pin image at exact page coordinates"
          :class="tbCls(editor.getAttributes('image').layoutMode === 'absolute')"
          @click="editor.chain().focus().updateAttributes('image', { layoutMode: 'absolute', posTop: '60', posLeft: '40', posRight: null, posBottom: null }).run()"
        >
          <IconPin class="h-3.5 w-3.5" />
        </button>
        <!-- Bleed-into-gutter toggle (wrap modes only) -->
        <template
          v-if="editor.getAttributes('image').layoutMode === 'wrapLeft' || editor.getAttributes('image').layoutMode === 'wrapRight'"
        >
          <button
            type="button"
            title="Bleed into column gutter"
            :class="tbCls(editor.getAttributes('image').gutterBleed === true)"
            @click="editor.chain().focus().updateAttributes('image', { gutterBleed: !editor.getAttributes('image').gutterBleed }).run()"
          >
            <span class="font-cinzel text-2xs font-bold leading-none">⇔</span>
          </button>
        </template>
        <!-- Absolute position inputs (absolute mode only) -->
        <template v-if="editor.getAttributes('image').layoutMode === 'absolute'">
          <div class="w-px h-5 bg-border mx-0.5" />
          <label class="flex items-center gap-0.5">
            <span class="font-cinzel text-2xs text-muted-foreground">T</span>
            <input
              type="number"
              :value="editor.getAttributes('image').posTop ?? ''"
              min="0"
              max="1200"
              class="w-12 h-5.5 rounded border border-border bg-card px-1 font-mono text-2xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="px"
              @change="$emit('setImagePos', 'posTop', ($event.target as HTMLInputElement).value)"
            />
          </label>
          <label class="flex items-center gap-0.5">
            <span class="font-cinzel text-2xs text-muted-foreground">L</span>
            <input
              type="number"
              :value="editor.getAttributes('image').posLeft ?? ''"
              min="0"
              max="800"
              class="w-12 h-5.5 rounded border border-border bg-card px-1 font-mono text-2xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="px"
              @change="$emit('setImagePos', 'posLeft', ($event.target as HTMLInputElement).value)"
            />
          </label>
          <label class="flex items-center gap-0.5">
            <span class="font-cinzel text-2xs text-muted-foreground">R</span>
            <input
              type="number"
              :value="editor.getAttributes('image').posRight ?? ''"
              min="0"
              max="800"
              class="w-12 h-5.5 rounded border border-border bg-card px-1 font-mono text-2xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="px"
              @change="$emit('setImagePos', 'posRight', ($event.target as HTMLInputElement).value)"
            />
          </label>
          <label class="flex items-center gap-0.5">
            <span class="font-cinzel text-2xs text-muted-foreground">B</span>
            <input
              type="number"
              :value="editor.getAttributes('image').posBottom ?? ''"
              min="0"
              max="1200"
              class="w-12 h-5.5 rounded border border-border bg-card px-1 font-mono text-2xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="px"
              @change="$emit('setImagePos', 'posBottom', ($event.target as HTMLInputElement).value)"
            />
          </label>
        </template>
        <!-- Edit in Illuminator — only for asset-images bucket URLs -->
        <template v-if="selectedImageIsSupabase && hasDoc">
          <div class="w-px h-5 bg-border mx-0.5" />
          <button
            type="button"
            title="Edit in Illuminator"
            :class="tbCls(false)"
            @click="$emit('editInIlluminator')"
          >
            <IconExternalLink class="h-3.5 w-3.5" />
          </button>
        </template>
      </template>

      <!-- Cover page controls (shown when a cover page is selected) -->
      <template v-if="editor.isActive('coverPage')">
        <div class="w-px h-5 bg-border mx-0.5" />
        <span class="text-label text-muted-foreground px-1 self-center">COVER</span>
        <button
          type="button"
          title="Edit cover page text"
          :class="tbCls(showCoverInspector)"
          class="gap-1 px-2 text-label font-semibold"
          @click="$emit('openCoverInspector')"
        >
          <IconPencilLine class="h-3.5 w-3.5" />
          Edit
        </button>
      </template>

      <!-- History -->
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

      <!-- Layout -->
      <button
        type="button"
        title="Toggle two-column preview"
        :class="tbCls(isTwoColumn)"
        @click="$emit('update:isTwoColumn', !isTwoColumn)"
      >
        <IconColumns class="h-3.5 w-3.5" />
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
          class="px-2 h-6.5 text-eyebrow font-semibold transition-colors"
          :class="theme === 'onednd2024' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'"
          @click="$emit('update:theme', 'onednd2024')"
        >
          2024
        </button>
        <button
          type="button"
          role="radio"
          :aria-checked="theme === 'phb2014'"
          title="Classic PHB (2014) theme"
          class="px-2 h-6.5 text-eyebrow font-semibold transition-colors border-l border-border"
          :class="theme === 'phb2014' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'"
          @click="$emit('update:theme', 'phb2014')"
        >
          Classic
        </button>
      </div>

      <div class="w-px h-5 bg-border mx-0.5" />

      <!-- Page size -->
      <div
        role="radiogroup"
        aria-label="Page size"
        class="ml-1 inline-flex rounded border border-border overflow-hidden shrink-0"
      >
        <button
          v-for="(sz, idx) in (['A4', 'A5', 'Letter'] as const)"
          :key="sz"
          type="button"
          role="radio"
          :aria-checked="pageSize === sz"
          :title="`Page size: ${sz}`"
          class="px-2 h-6.5 text-eyebrow font-semibold transition-colors"
          :class="[
            idx > 0 ? 'border-l border-border' : '',
            pageSize === sz ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted',
          ]"
          @click="$emit('update:pageSize', sz)"
        >
          {{ sz }}
        </button>
      </div>

      <!-- Ink-friendly toggle -->
      <button
        type="button"
        title="Ink-friendly export (strips backgrounds & decorations)"
        :class="tbCls(inkFriendly)"
        class="gap-1 px-2 text-label font-semibold"
        @click="$emit('update:inkFriendly', !inkFriendly)"
      >
        <IconPrint class="h-3.5 w-3.5" />
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { Editor } from "@tiptap/vue-3";
import {
  IMAGE_SIZES,
} from "@/lib/scriptorium/editorConstants";
import {
  IconAddItem,
  IconAlignCenter,
  IconAlignLeft,
  IconAlignRight,
  IconCodeBlock,
  IconCodeInline,
  IconColumns,
  IconExternalLink,
  IconGridView,
  IconList,
  IconListOrdered,
  IconMinus,
  IconPencilLine,
  IconPin,
  IconPrint,
  IconQuote,
  IconRect,
  IconRedo,
  IconStrikethrough,
  IconUndo,
  IconWrapText,
} from "@/lib/icons";
import type { ScriptoriumTheme, ScriptoriumPageSize } from "@/types/scriptorium.types";

const {
  editor,
  isTwoColumn,
  theme,
  pageSize,
  inkFriendly,
  showBlockPicker = false,
  showCoverInspector = false,
  selectedImageIsSupabase = false,
  hasDoc = false,
} = defineProps<{
  editor: Editor | undefined;
  isTwoColumn: boolean;
  theme: ScriptoriumTheme;
  pageSize: ScriptoriumPageSize;
  inkFriendly: boolean;
  showBlockPicker?: boolean;
  showCoverInspector?: boolean;
  selectedImageIsSupabase?: boolean;
  hasDoc?: boolean;
}>();

defineEmits<{
  "update:isTwoColumn": [value: boolean];
  "update:theme": [value: ScriptoriumTheme];
  "update:pageSize": [value: ScriptoriumPageSize];
  "update:inkFriendly": [value: boolean];
  openAssetPanel: [];
  openBlockPicker: [];
  openCoverInspector: [];
  editInIlluminator: [];
  setImagePos: [side: "posTop" | "posLeft" | "posRight" | "posBottom", value: string];
}>();

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
.scriptorium-toolbar > * {
  flex-shrink: 0;
}

input:not([type="checkbox"]):not([type="radio"]) {
  background-color: var(--card);
  color: var(--foreground);
}
</style>
