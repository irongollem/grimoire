<template>
  <li
    ref="rowRef"
    :data-chapter-row="chapter.id"
    :class="
      cn(
        'group relative flex items-stretch',
        dragging && 'opacity-50',
        dropBefore && 'before:absolute before:inset-x-3 before:top-0 before:h-0.5 before:rounded-full before:bg-primary',
        dropAfter && 'after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary',
      )
    "
  >
    <span
      v-if="canReorder"
      role="presentation"
      aria-hidden="true"
      data-chapter-grip
      class="flex w-5 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 active:cursor-grabbing max-md:opacity-100"
      @pointerdown="emit('gripDown', $event)"
    >
      <IconDrag class="h-4 w-4" />
    </span>
    <AppButton
      variant="menu"
      block
      :aria-current="current ? 'page' : undefined"
      :class="
        cn(
          'h-auto min-w-0 flex-1 flex-col items-start gap-px rounded-none px-3 py-2 max-md:min-h-11',
          !canReorder && 'pl-4.5',
          current && 'bg-primary-fill/15 shadow-[inset_0.1875rem_0_0_var(--primary-fill)]',
        )
      "
      @click="emit('select')"
    >
      <span :class="cn('text-body leading-tight', current && 'font-bold', !hasTitle && 'italic text-muted-foreground')">{{
        hasTitle ? chapter.title : "Untitled chapter"
      }}</span>
      <span v-if="pages" class="text-caption text-muted-foreground">{{ pages }}</span>
    </AppButton>
    <div class="flex shrink-0 items-center pr-2 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100">
      <ChapterRowMenu
        :title="hasTitle ? chapter.title : 'Untitled chapter'"
        :first="first"
        :last="last"
        :can-delete="canDelete"
        @move-up="emit('moveUp')"
        @move-down="emit('moveDown')"
        @delete="emit('delete')"
      />
    </div>
  </li>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconDrag } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { ScriptoriumChapterSummary } from "@/types/scriptorium.types";
import ChapterRowMenu from "./ChapterRowMenu.vue";

const { chapter, pages, current, first, last, canDelete, canReorder, dragging, dropBefore, dropAfter } = defineProps<{
  chapter: ScriptoriumChapterSummary;
  pages: string | null;
  current: boolean;
  first: boolean;
  last: boolean;
  canDelete: boolean;
  canReorder: boolean;
  dragging: boolean;
  dropBefore: boolean;
  dropAfter: boolean;
}>();

const emit = defineEmits<{
  select: [];
  moveUp: [];
  moveDown: [];
  delete: [];
  gripDown: [event: PointerEvent];
}>();

const rowRef = ref<HTMLElement | null>(null);
const hasTitle = computed(() => chapter.title.trim() !== "");

defineExpose({ rowRef });
</script>
