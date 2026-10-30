<template>
  <header
    class="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-card px-4 py-2.5 sm:px-6"
  >
    <AppButton variant="outline" size="sm" label="Close" @click="emit('close')" />
    <h2 class="min-w-0 truncate text-heading-sm font-bold text-foreground">{{ title }}</h2>
    <span class="flex-1" />
    <label class="flex items-center gap-2 text-caption text-muted-foreground">
      Chapter
      <AppSelect
        :model-value="currentChapterId"
        aria-label="Jump to chapter"
        tone="card"
        size="sm"
        :block="false"
        @update:model-value="jumpToChapter"
      >
        <option v-for="c in jumpable" :key="c.id" :value="c.id">{{ chapterName(c) }}</option>
      </AppSelect>
    </label>
    <span class="text-body tabular-nums text-foreground" data-testid="inspect-pages">{{ pagesText }}</span>
    <div class="flex gap-1">
      <AppButton
        variant="outline"
        size="icon-sm"
        :icon="IconChevronLeft"
        aria-label="Previous spread"
        :disabled="spread <= 0"
        @click="emit('update:spread', spread - 1)"
      />
      <AppButton
        variant="outline"
        size="icon-sm"
        :icon="IconChevronRight"
        aria-label="Next spread"
        :disabled="spread >= lastSpread"
        @click="emit('update:spread', spread + 1)"
      />
    </div>
    <AppButton
      variant="outline"
      size="sm"
      :active="notesOpen"
      :label="openNotes > 0 ? `Notes · ${openNotes}` : 'Notes'"
      :aria-pressed="notesOpen"
      @click="emit('update:notesOpen', !notesOpen)"
    />
  </header>
</template>

<script setup lang="ts">
/**
 * The Inspect header (#1115 frame 04): Close, the chapter jump, "Pages 192 and
 * 193 of 542", the spread arrows and the Notes toggle. A spread is two facing
 * pages; page 1, a recto, stands alone on the right, so spread 0 is one page.
 */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import { IconChevronLeft, IconChevronRight } from "@/lib/icons";
import { useBookNotes } from "@/composables/scriptorium/useScriptoriumNotes";
import { spreadCount, spreadOfPage, spreadPages } from "@/lib/scriptorium/spreads";
import type { BookLayoutResult } from "@/lib/scriptorium/bookLayout/types";
import type { ScriptoriumChapterSummary } from "@/types/scriptorium.types";

const { documentId, title, chapters, result, spread, notesOpen } = defineProps<{
  documentId: string;
  title: string;
  chapters: ScriptoriumChapterSummary[];
  result: BookLayoutResult | null;
  spread: number;
  notesOpen: boolean;
}>();

const emit = defineEmits<{
  close: [];
  "update:spread": [value: number];
  "update:notesOpen": [value: boolean];
}>();

const { data: notes } = useBookNotes(() => documentId);
const openNotes = computed(() => (notes.value ?? []).filter((n) => !n.done).length);

const total = computed(() => result?.pageCount ?? 0);
const lastSpread = computed(() => Math.max(0, spreadCount(total.value) - 1));

const shown = computed(() => spreadPages(spread, total.value));
const pagesText = computed(() => {
  const labels = shown.value.flatMap((index) => {
    if (index === null || !result) return [];
    return [result.pages[index]?.label ?? String(index + 1)];
  });
  if (labels.length === 0) return `No pages yet`;
  const head = labels.length === 2 ? `Pages ${labels[0]} and ${labels[1]}` : `Page ${labels[0]}`;
  return `${head} of ${total.value}`;
});

/** Chapters that have pages, since a jump to an empty one has nowhere to go. */
const jumpable = computed(() =>
  chapters.filter((c) => result?.chapters.find((span) => span.id === c.id)?.firstIndex != null),
);
function chapterName(chapter: ScriptoriumChapterSummary): string {
  return chapter.title.trim() || "Untitled chapter";
}

const currentChapterId = computed(() => {
  const index = shown.value.find((i): i is number => i !== null);
  return index === undefined ? "" : (result?.pages[index]?.chapterId ?? "");
});

function jumpToChapter(chapterId: string) {
  const first = result?.chapters.find((span) => span.id === chapterId)?.firstIndex;
  if (first != null) emit("update:spread", spreadOfPage(first));
}
</script>
