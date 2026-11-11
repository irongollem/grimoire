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
        <span class=" text-label font-bold leading-none">H1</span>
      </AppButton>
      <AppButton
        variant="ghost"
        size="icon-xs"
        tooltip="Heading 2"
        :active="editor.isActive('heading', { level: 2 })"
        @click="editor.chain().focus().toggleHeading({ level: 2 }).run()"
      >
        <span class=" text-label font-bold leading-none">H2</span>
      </AppButton>
      <AppButton
        variant="ghost"
        size="icon-xs"
        tooltip="Heading 3"
        :active="editor.isActive('heading', { level: 3 })"
        @click="editor.chain().focus().toggleHeading({ level: 3 }).run()"
      >
        <span class=" text-label font-bold leading-none">H3</span>
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
        @click="editor.chain().focus().insertPageBreak().run()"
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
          <span class="text-label font-bold leading-none">{{ size.label }}</span>
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
          tooltip="Wrap left: text flows around right edge"
          :active="editor.getAttributes('image').layoutMode === 'wrapLeft'"
          @click="editor.chain().focus().updateAttributes('image', { layoutMode: 'wrapLeft' }).run()"
        >
          <IconWrapText class="h-3.5 w-3.5 scale-x-[-1]" />
        </AppButton>
        <AppButton
          variant="ghost"
          size="icon-xs"
          tooltip="Wrap right: text flows around left edge"
          :active="editor.getAttributes('image').layoutMode === 'wrapRight'"
          :icon="IconWrapText"
          @click="editor.chain().focus().updateAttributes('image', { layoutMode: 'wrapRight' }).run()"
        />
        <AppButton
          variant="ghost"
          size="icon-xs"
          :tooltip="
            canPlaceOnPage
              ? 'Place on the page: drag it anywhere, in front of or behind the text'
              : 'Switch to Split to place it on its page'
          "
          :icon="IconPin"
          :disabled="!canPlaceOnPage"
          @click="emit('placeOnPage')"
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
            <span class="text-label font-bold leading-none">⇔</span>
          </AppButton>
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

    </template>
  </div>
</template>

<script setup lang="ts">
import type { Editor } from "@tiptap/vue-3";
import AppButton from "@/components/common/controls/AppButton.vue";
import {
  IMAGE_SIZES,
} from "@/scriptorium/lib/editorConstants";
import {
  IconAddItem,
  IconAlignCenter,
  IconAlignLeft,
  IconAlignRight,
  IconCodeBlock,
  IconCodeInline,
  IconExternalLink,
  IconGridView,
  IconList,
  IconListOrdered,
  IconMinus,
  IconPencilLine,
  IconPin,
  IconQuote,
  IconRect,
  IconRedo,
  IconStrikethrough,
  IconUndo,
  IconWrapText,
} from "@/lib/icons";

const {
  editor,
  showBlockPicker = false,
  showCoverInspector = false,
  selectedImageIsSupabase = false,
  hasDoc = false,
  canPlaceOnPage = false,
} = defineProps<{
  editor: Editor | undefined;
  showBlockPicker?: boolean;
  showCoverInspector?: boolean;
  selectedImageIsSupabase?: boolean;
  hasDoc?: boolean;
  /** The editor shows the laid-out pages (Split), so a picture can be placed where it lands. */
  canPlaceOnPage?: boolean;
}>();

const emit = defineEmits<{
  openAssetPanel: [];
  openBlockPicker: [];
  openCoverInspector: [];
  editInIlluminator: [];
  placeOnPage: [];
}>();
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
