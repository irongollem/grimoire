<template>
  <div
    class="flex flex-nowrap items-center gap-0.5 p-1.5 border-b border-border bg-muted/30 shrink-0 overflow-x-auto scriptorium-toolbar lg:flex-wrap lg:overflow-visible"
    data-testid="editor-toolbar"
  >
    <template v-if="editor">
      <!-- Writing -->
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

      <MenuPopover label="Heading level" data-testid="heading-menu">
        <template #trigger="{ toggle, open }">
          <AppButton
            variant="ghost"
            size="xs"
            tooltip="Heading level"
            aria-haspopup="menu"
            :aria-expanded="open"
            :active="headingLevel !== null"
            data-testid="heading-trigger"
            @click="toggle"
          >
            <span>{{ headingLevel === null ? "Heading" : `Heading ${headingLevel}` }}</span>
            <IconChevronDown class="size-3" />
          </AppButton>
        </template>
        <template #default="{ close }">
          <AppButton
            v-for="option in HEADING_OPTIONS"
            :key="option.label"
            variant="menu"
            size="md"
            block
            role="menuitemradio"
            :aria-checked="headingLevel === option.level"
            :active="headingLevel === option.level"
            :label="option.label"
            @click="setHeading(option.level, close)"
          />
        </template>
      </MenuPopover>

      <AppButton
        variant="ghost"
        size="xs"
        tooltip="Bullet list"
        :active="editor.isActive('bulletList')"
        :icon="IconList"
        label="List"
        @click="editor.chain().focus().toggleBulletList().run()"
      />

      <div class="w-px h-5 bg-border mx-0.5" />

      <!-- The book's own tools: the blocks a book is written in, one click each -->
      <AppButton
        variant="ghost"
        size="xs"
        tooltip="Boxed text to read aloud to the table. Shortcut: Mod-Alt-D"
        :active="editor.isActive('descriptiveBlock')"
        label="Read-aloud"
        @click="editor.chain().focus().toggleDescriptiveBlock().run()"
      />
      <AppButton
        variant="ghost"
        size="xs"
        tooltip="A boxed aside for rules and tips. Shortcut: Mod-Alt-N"
        :active="editor.isActive('noteBlock')"
        label="Sidebar"
        @click="editor.chain().focus().toggleNoteBlock().run()"
      />
      <AppButton variant="ghost" size="xs" tooltip="A stat block to fill in" label="Stat block" @click="place('Monster Stat Block')" />
      <AppButton
        variant="ghost"
        size="xs"
        tooltip="A table"
        :active="editor.isActive('table')"
        label="Table"
        @click="place('Table')"
      />
      <AppButton
        variant="ghost"
        size="xs"
        tooltip="A large first letter on this paragraph"
        :active="editor.isActive('paragraph', { dropCap: true })"
        label="Drop cap"
        @click="editor.chain().focus().toggleDropCap().run()"
      />
      <AppButton
        variant="ghost"
        size="xs"
        tooltip="Across both columns"
        :active="editor.isActive('wideBlock')"
        label="Wide"
        @click="editor.chain().focus().toggleWideBlock().run()"
      />

      <div class="w-px h-5 bg-border mx-0.5" />

      <AppButton
        variant="ghost"
        size="xs"
        tooltip="Open the book kit: monsters, NPCs, places, spells, items, quests and art"
        :icon="IconAdd"
        label="From the campaign"
        data-testid="from-campaign"
        @click="askForCampaignSearch"
      />

      <MenuPopover label="More formatting" data-testid="more-menu">
        <template #trigger="{ toggle, open }">
          <AppButton
            variant="ghost"
            size="xs"
            tooltip="More formatting"
            aria-haspopup="menu"
            :aria-expanded="open"
            data-testid="more-trigger"
            @click="toggle"
          >
            <span>More</span>
            <IconChevronDown class="size-3" />
          </AppButton>
        </template>
        <template #default="{ close }">
          <AppButton
            v-for="item in moreItems"
            :key="item.label"
            variant="menu"
            size="md"
            block
            :active="item.active"
            :label="item.label"
            @click="item.run(); close(true)"
          />
        </template>
      </MenuPopover>

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

      <div class="w-px h-5 bg-border mx-0.5" />

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
/**
 * The writing toolbar (#1176 frame 13): the few things a writer reaches for
 * constantly, then the book's own tools, then the campaign. Everything else the
 * old toolbar had lives in "More", the book kit and the "/" menu (frame 16).
 */
import { computed } from "vue";
import type { Editor } from "@tiptap/vue-3";
import AppButton from "@/components/common/controls/AppButton.vue";
import MenuPopover from "@/components/common/overlays/MenuPopover.vue";
import { IconAdd, IconChevronDown, IconList, IconPencilLine, IconRedo, IconUndo } from "@/lib/icons";
import { placeKitItem } from "@/scriptorium/lib/kit/placeKitItem";
import { isTwoColumnPage } from "@/scriptorium/lib/kit/twoColumn";
import { useScriptoriumUiStore } from "@/scriptorium/stores/ui";

// The kit is in the left rail, which the toolbar does not own: it asks through the store, as Focus does.
const { askForCampaignSearch } = useScriptoriumUiStore();

const { editor } = defineProps<{ editor: Editor | undefined }>();

defineEmits<{
  /** Asks the panel beside the page to show the cover's settings. */
  showCover: [];
}>();

type HeadingLevel = 1 | 2 | 3;
const HEADING_OPTIONS: { label: string; level: HeadingLevel | null }[] = [
  { label: "Paragraph", level: null },
  { label: "Heading 1", level: 1 },
  { label: "Heading 2", level: 2 },
  { label: "Heading 3", level: 3 },
];

/** The heading level at the caret, re-read on every render the editor causes. */
const headingLevel = computed<HeadingLevel | null>(() => {
  if (!editor) return null;
  for (const level of [1, 2, 3] as const) {
    if (editor.isActive("heading", { level })) return level;
  }
  return null;
});

function setHeading(level: HeadingLevel | null, close: (refocus: boolean) => void) {
  if (!editor) return;
  const chain = editor.chain().focus();
  if (level === null) chain.setParagraph().run();
  else chain.setHeading({ level }).run();
  close(false);
}

function place(label: string) {
  if (!editor) return;
  placeKitItem(editor, { kind: "block", label }, { isTwoColumn: isTwoColumnPage(editor) });
}

const moreItems = computed(() => {
  const ed = editor;
  if (!ed) return [];
  return [
    { label: "Strikethrough", active: ed.isActive("strike"), run: () => ed.chain().focus().toggleStrike().run() },
    { label: "Inline code", active: ed.isActive("code"), run: () => ed.chain().focus().toggleCode().run() },
    { label: "Numbered list", active: ed.isActive("orderedList"), run: () => ed.chain().focus().toggleOrderedList().run() },
    { label: "Callout", active: ed.isActive("blockquote"), run: () => ed.chain().focus().toggleBlockquote().run() },
    { label: "Code block", active: ed.isActive("codeBlock"), run: () => ed.chain().focus().toggleCodeBlock().run() },
    { label: "Page break", active: false, run: () => ed.chain().focus().insertPageBreak().run() },
  ];
});
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
