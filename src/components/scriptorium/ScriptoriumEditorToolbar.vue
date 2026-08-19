<template>
  <div
    class="flex flex-nowrap items-center gap-0.5 p-1.5 border-b border-border bg-muted/30 shrink-0 overflow-x-auto scriptorium-toolbar lg:flex-wrap lg:overflow-visible"
  >
    <template v-if="editor">
      <!-- Inline -->
      <AppButton
        variant="ghost"
        size="icon-xs"
        tooltip="Bold"
        :active="editor.isActive('bold')"
        @click="editor.chain().focus().toggleBold().run()"
      >
        <strong class="text-xs leading-none">B</strong>
      </AppButton>
      <AppButton
        variant="ghost"
        size="icon-xs"
        tooltip="Italic"
        :active="editor.isActive('italic')"
        @click="editor.chain().focus().toggleItalic().run()"
      >
        <em class="text-xs leading-none">I</em>
      </AppButton>
      <AppButton
        variant="ghost"
        size="icon-xs"
        tooltip="Strikethrough"
        :active="editor.isActive('strike')"
        :icon="IconStrikethrough"
        @click="editor.chain().focus().toggleStrike().run()"
      />
      <AppButton
        variant="ghost"
        size="icon-xs"
        tooltip="Inline code"
        :active="editor.isActive('code')"
        :icon="IconCodeInline"
        @click="editor.chain().focus().toggleCode().run()"
      />

      <div class="w-px h-5 bg-border mx-0.5" />

      <!-- Headings -->
      <AppButton
        variant="ghost"
        size="icon-xs"
        tooltip="Heading 1"
        :active="editor.isActive('heading', { level: 1 })"
        @click="editor.chain().focus().toggleHeading({ level: 1 }).run()"
      >
        <span class="text-2xs font-cinzel font-bold leading-none">H1</span>
      </AppButton>
      <AppButton
        variant="ghost"
        size="icon-xs"
        tooltip="Heading 2"
        :active="editor.isActive('heading', { level: 2 })"
        @click="editor.chain().focus().toggleHeading({ level: 2 }).run()"
      >
        <span class="text-2xs font-cinzel font-bold leading-none">H2</span>
      </AppButton>
      <AppButton
        variant="ghost"
        size="icon-xs"
        tooltip="Heading 3"
        :active="editor.isActive('heading', { level: 3 })"
        @click="editor.chain().focus().toggleHeading({ level: 3 }).run()"
      >
        <span class="text-2xs font-cinzel font-bold leading-none">H3</span>
      </AppButton>

      <div class="w-px h-5 bg-border mx-0.5" />

      <!-- Blocks -->
      <AppButton
        variant="ghost"
        size="icon-xs"
        tooltip="Bullet list"
        :active="editor.isActive('bulletList')"
        :icon="IconList"
        @click="editor.chain().focus().toggleBulletList().run()"
      />
      <AppButton
        variant="ghost"
        size="icon-xs"
        tooltip="Ordered list"
        :active="editor.isActive('orderedList')"
        :icon="IconListOrdered"
        @click="editor.chain().focus().toggleOrderedList().run()"
      />
      <AppButton
        variant="ghost"
        size="icon-xs"
        tooltip="Blockquote / callout"
        :active="editor.isActive('blockquote')"
        :icon="IconQuote"
        @click="editor.chain().focus().toggleBlockquote().run()"
      />
      <AppButton
        variant="ghost"
        size="icon-xs"
        tooltip="Inline block"
        :active="editor.isActive('codeBlock')"
        :icon="IconCodeBlock"
        @click="editor.chain().focus().toggleCodeBlock().run()"
      />
      <AppButton
        variant="ghost"
        size="icon-xs"
        tooltip="Wide Block (spans both columns)"
        :active="editor.isActive('wideBlock')"
        :icon="IconRect"
        @click="editor.chain().focus().toggleWideBlock().run()"
      />
      <AppButton
        variant="ghost"
        size="icon-xs"
        tooltip="Page Break (inserts new page)"
        :icon="IconMinus"
        @click="editor.chain().focus().setHorizontalRule().run()"
      />

      <div class="w-px h-5 bg-border mx-0.5" />

      <!-- Insert Asset -->
      <AppButton
        variant="ghost"
        size="xs"
        tooltip="Insert asset as new page (NPC, Monster…)"
        :icon="IconAddItem"
        label="Insert"
        @click="$emit('openAssetPanel')"
      />

      <!-- Insert Block picker -->
      <AppButton
        variant="ghost"
        size="xs"
        tooltip="Insert block…"
        :active="showBlockPicker"
        :icon="IconGridView"
        label="Block"
        @click="$emit('openBlockPicker')"
      />

      <div class="w-px h-5 bg-border mx-0.5" />

      <!-- Image controls (shown when an image is selected) -->
      <template v-if="editor.isActive('image')">
        <span class="text-label text-muted-foreground px-1 self-center">IMG</span>
        <AppButton
          v-for="size in IMAGE_SIZES"
          :key="size.w"
          variant="ghost"
          size="icon-xs"
          :tooltip="`${size.label} (${size.w}px)`"
          :active="editor.getAttributes('image').width === String(size.w)"
          @click="editor.chain().focus().updateAttributes('image', { width: String(size.w) }).run()"
        >
          <span class="font-cinzel text-2xs font-bold leading-none">{{ size.label }}</span>
        </AppButton>
        <div class="w-px h-5 bg-border mx-0.5" />
        <AppButton
          variant="ghost"
          size="icon-xs"
          tooltip="Float left"
          :active="editor.getAttributes('image').dataAlign === 'left'"
          :icon="IconAlignLeft"
          @click="editor.chain().focus().updateAttributes('image', { dataAlign: 'left', layoutMode: 'inline' }).run()"
        />
        <AppButton
          variant="ghost"
          size="icon-xs"
          tooltip="Center"
          :active="editor.getAttributes('image').dataAlign === 'center'"
          :icon="IconAlignCenter"
          @click="editor.chain().focus().updateAttributes('image', { dataAlign: 'center', layoutMode: 'inline' }).run()"
        />
        <AppButton
          variant="ghost"
          size="icon-xs"
          tooltip="Float right"
          :active="editor.getAttributes('image').dataAlign === 'right' || !editor.getAttributes('image').dataAlign"
          :icon="IconAlignRight"
          @click="editor.chain().focus().updateAttributes('image', { dataAlign: 'right', layoutMode: 'inline' }).run()"
        />
        <div class="w-px h-5 bg-border mx-0.5" />
        <!-- Layout mode controls -->
        <span class="text-label text-muted-foreground px-1 self-center">LAYOUT</span>
        <AppButton
          variant="ghost"
          size="icon-xs"
          tooltip="Wrap left — text flows around right edge"
          :active="editor.getAttributes('image').layoutMode === 'wrapLeft'"
          @click="editor.chain().focus().updateAttributes('image', { layoutMode: 'wrapLeft' }).run()"
        >
          <IconWrapText class="h-3.5 w-3.5 scale-x-[-1]" />
        </AppButton>
        <AppButton
          variant="ghost"
          size="icon-xs"
          tooltip="Wrap right — text flows around left edge"
          :active="editor.getAttributes('image').layoutMode === 'wrapRight'"
          :icon="IconWrapText"
          @click="editor.chain().focus().updateAttributes('image', { layoutMode: 'wrapRight' }).run()"
        />
        <AppButton
          variant="ghost"
          size="icon-xs"
          tooltip="Absolute position — pin image at exact page coordinates"
          :active="editor.getAttributes('image').layoutMode === 'absolute'"
          :icon="IconPin"
          @click="editor.chain().focus().updateAttributes('image', { layoutMode: 'absolute', posTop: '60', posLeft: '40', posRight: null, posBottom: null }).run()"
        />
        <!-- Bleed-into-gutter toggle (wrap modes only) -->
        <template
          v-if="editor.getAttributes('image').layoutMode === 'wrapLeft' || editor.getAttributes('image').layoutMode === 'wrapRight'"
        >
          <AppButton
            variant="ghost"
            size="icon-xs"
            tooltip="Bleed into column gutter"
            :active="editor.getAttributes('image').gutterBleed === true"
            @click="editor.chain().focus().updateAttributes('image', { gutterBleed: !editor.getAttributes('image').gutterBleed }).run()"
          >
            <span class="font-cinzel text-2xs font-bold leading-none">⇔</span>
          </AppButton>
        </template>
        <!-- Absolute position inputs (absolute mode only) -->
        <template v-if="editor.getAttributes('image').layoutMode === 'absolute'">
          <div class="w-px h-5 bg-border mx-0.5" />
          <label class="flex items-center gap-0.5">
            <span class="font-cinzel text-2xs text-muted-foreground">T</span>
            <AppInput
              v-model.lazy="posTopModel"
              type="number"
              min="0"
              max="1200"
              tone="card"
              size="xs"
              :block="false"
              placeholder="px"
              class="w-12 h-5.5 font-mono text-2xs"
            />
          </label>
          <label class="flex items-center gap-0.5">
            <span class="font-cinzel text-2xs text-muted-foreground">L</span>
            <AppInput
              v-model.lazy="posLeftModel"
              type="number"
              min="0"
              max="800"
              tone="card"
              size="xs"
              :block="false"
              placeholder="px"
              class="w-12 h-5.5 font-mono text-2xs"
            />
          </label>
          <label class="flex items-center gap-0.5">
            <span class="font-cinzel text-2xs text-muted-foreground">R</span>
            <AppInput
              v-model.lazy="posRightModel"
              type="number"
              min="0"
              max="800"
              tone="card"
              size="xs"
              :block="false"
              placeholder="px"
              class="w-12 h-5.5 font-mono text-2xs"
            />
          </label>
          <label class="flex items-center gap-0.5">
            <span class="font-cinzel text-2xs text-muted-foreground">B</span>
            <AppInput
              v-model.lazy="posBottomModel"
              type="number"
              min="0"
              max="1200"
              tone="card"
              size="xs"
              :block="false"
              placeholder="px"
              class="w-12 h-5.5 font-mono text-2xs"
            />
          </label>
        </template>
        <!-- Edit in Illuminator — only for asset-images bucket URLs -->
        <template v-if="selectedImageIsSupabase && hasDoc">
          <div class="w-px h-5 bg-border mx-0.5" />
          <AppButton
            variant="ghost"
            size="icon-xs"
            tooltip="Edit in Illuminator"
            :icon="IconExternalLink"
            @click="$emit('editInIlluminator')"
          />
        </template>
      </template>

      <!-- Cover page controls (shown when a cover page is selected) -->
      <template v-if="editor.isActive('coverPage')">
        <div class="w-px h-5 bg-border mx-0.5" />
        <span class="text-label text-muted-foreground px-1 self-center">COVER</span>
        <AppButton
          variant="ghost"
          size="xs"
          tooltip="Edit cover page text"
          :active="showCoverInspector"
          :icon="IconPencilLine"
          label="Edit"
          @click="$emit('openCoverInspector')"
        />
      </template>

      <!-- History -->
      <AppButton
        variant="ghost"
        size="icon-xs"
        tooltip="Undo"
        :disabled="!editor.can().undo()"
        :icon="IconUndo"
        @click="editor.chain().focus().undo().run()"
      />
      <AppButton
        variant="ghost"
        size="icon-xs"
        tooltip="Redo"
        :disabled="!editor.can().redo()"
        :icon="IconRedo"
        @click="editor.chain().focus().redo().run()"
      />

      <div class="w-px h-5 bg-border mx-0.5" />

      <!-- Layout -->
      <AppButton
        variant="ghost"
        size="icon-xs"
        tooltip="Toggle two-column preview"
        :active="isTwoColumn"
        :icon="IconColumns"
        @click="$emit('update:isTwoColumn', !isTwoColumn)"
      />

      <!-- Theme -->
      <div
        role="radiogroup"
        aria-label="Preview theme"
        class="ml-1 inline-flex rounded border border-border overflow-hidden shrink-0"
      >
        <AppButton
          role="radio"
          :aria-checked="theme === 'onednd2024'"
          tooltip="OneDnD 2024 theme"
          variant="ghost"
          fill="muted"
          size="toolbar"
          :active="theme === 'onednd2024'"
          class="uppercase"
          label="2024"
          @click="$emit('update:theme', 'onednd2024')"
        />
        <AppButton
          role="radio"
          :aria-checked="theme === 'phb2014'"
          tooltip="Classic PHB (2014) theme"
          variant="ghost"
          fill="muted"
          size="toolbar"
          :active="theme === 'phb2014'"
          class="uppercase border-l border-border"
          label="Classic"
          @click="$emit('update:theme', 'phb2014')"
        />
      </div>

      <div class="w-px h-5 bg-border mx-0.5" />

      <!-- Page size -->
      <div
        role="radiogroup"
        aria-label="Page size"
        class="ml-1 inline-flex rounded border border-border overflow-hidden shrink-0"
      >
        <AppButton
          v-for="(sz, idx) in (['A4', 'A5', 'Letter'] as const)"
          :key="sz"
          role="radio"
          :aria-checked="pageSize === sz"
          :tooltip="`Page size: ${sz}`"
          variant="ghost"
          fill="muted"
          size="toolbar"
          :active="pageSize === sz"
          :class="['uppercase', idx > 0 ? 'border-l border-border' : '']"
          :label="sz"
          @click="$emit('update:pageSize', sz)"
        />
      </div>

      <!-- Ink-friendly toggle -->
      <AppButton
        variant="ghost"
        size="xs"
        tooltip="Ink-friendly export (strips backgrounds & decorations)"
        :active="inkFriendly"
        :icon="IconPrint"
        @click="$emit('update:inkFriendly', !inkFriendly)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Editor } from "@tiptap/vue-3";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
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

const emit = defineEmits<{
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

/**
 * Bridges the tiptap image-attribute reads (imperative, but reactive — see
 * @tiptap/vue-3's Editor, whose `.state` getter reads a debounced Vue ref) to
 * an AppInput v-model. `.lazy` keeps the original commit-on-change behaviour:
 * a value written per keystroke would move the image while still typing.
 */
function imagePosModel(side: "posTop" | "posLeft" | "posRight" | "posBottom") {
  return computed<string>({
    get: () => editor?.getAttributes("image")[side] ?? "",
    set: (value) => emit("setImagePos", side, value),
  });
}

const posTopModel = imagePosModel("posTop");
const posLeftModel = imagePosModel("posLeft");
const posRightModel = imagePosModel("posRight");
const posBottomModel = imagePosModel("posBottom");
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
