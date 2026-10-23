<template>
  <nav aria-label="Chapters" class="flex flex-col gap-0.5 md:border-r md:border-border md:pr-4">
    <AppButton
      v-for="item in items"
      :key="item.value ?? 'all'"
      variant="menu"
      size="sm"
      block
      :active="model === item.value"
      :aria-current="model === item.value ? 'true' : undefined"
      @click="model = item.value"
    >
      <span class="flex w-full items-center justify-between gap-2">
        <span class="truncate">{{ item.label }}</span>
        <span class="shrink-0 text-caption font-normal text-muted-foreground">{{ item.count }}</span>
      </span>
    </AppButton>
    <p class="mt-4 px-3 text-caption text-muted-foreground">
      The first number is what is in the book, the second all entries in the chapter.
    </p>
  </nav>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { allChaptersCount, type ChapterCount } from "@/lib/openBook/pickerRows";
import type { OpenBookChapter } from "@/types/openBook.types";

const CHAPTER_LABELS: Record<OpenBookChapter, string> = {
  atlas: "The Atlas",
  folk: "Folk",
  factions: "Factions",
  pantheon: "Pantheon",
  lore: "Lore",
  chronicle: "Chronicle",
};

const model = defineModel<OpenBookChapter | null>({ required: true });
const { counts, enabled } = defineProps<{
  counts: Record<OpenBookChapter, ChapterCount>;
  /** The chapters the book carries; the others read "off" instead of a count. */
  enabled: readonly OpenBookChapter[];
}>();

const items = computed(() => {
  const all = allChaptersCount(counts);
  return [
    { value: null, label: "All chapters", count: `${all.inBook} in · ${all.total}` },
    ...(Object.keys(CHAPTER_LABELS) as OpenBookChapter[]).map((chapter) => ({
      value: chapter,
      label: CHAPTER_LABELS[chapter],
      count: enabled.includes(chapter) ? `${counts[chapter].inBook} · ${counts[chapter].total}` : "off",
    })),
  ];
});
</script>
