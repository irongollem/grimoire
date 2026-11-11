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

      <!-- Cover page controls (shown when a cover page is selected) -->
      <template v-if="editor.isActive('coverPage')">
        <div class="w-px h-5 bg-border mx-0.5" />
        <AppButton
          variant="ghost"
          size="xs"
          tooltip="Show the cover's settings in the panel"
          :icon="IconPencilLine"
          label="Cover"
          @click="$emit('showCover')"
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
  IconAddItem,
  IconCodeBlock,
  IconCodeInline,
  IconGridView,
  IconList,
  IconListOrdered,
  IconMinus,
  IconPencilLine,
  IconQuote,
  IconRect,
  IconRedo,
  IconStrikethrough,
  IconUndo,
} from "@/lib/icons";

const { editor, showBlockPicker = false } = defineProps<{
  editor: Editor | undefined;
  showBlockPicker?: boolean;
}>();

defineEmits<{
  openAssetPanel: [];
  openBlockPicker: [];
  /** Asks the panel beside the page to show the cover's settings. */
  showCover: [];
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
