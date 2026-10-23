<script setup lang="ts">
/**
 * Chapter tabs (#1085): thumb-index tabs along the recto's fore-edge on a wide screen, leather tabs along the bottom
 * on a phone. The tab for the chapter you are in is pulled out. A tab opens its chapter at its first page.
 */
import { computed } from "vue";
import { RouterLink, type RouteLocationRaw } from "vue-router";
import type { OpenBookChapter } from "@/types/openBook.types";
import type { BookModel } from "@/lib/openBook/bookModel";
import { INDEX_KEY, chapterOpener, sectionLocation, type BookSection } from "@/lib/openBook/sections";

const { model, sections, slug, current, variant } = defineProps<{
  model: BookModel;
  sections: BookSection[];
  slug: string;
  current: OpenBookChapter | "index" | null;
  variant: "edge" | "bottom";
}>();

/** Six tabs share a phone's width; the long names are shortened there. */
const SHORT: Record<OpenBookChapter, string> = {
  atlas: "Atlas",
  folk: "Folk",
  factions: "Houses",
  pantheon: "Gods",
  lore: "Lore",
  chronicle: "Chron.",
};

interface Tab {
  id: OpenBookChapter | "index";
  label: string;
  full: string;
  to: RouteLocationRaw;
}

const tabs = computed(() => {
  const list: Tab[] = model.chapters.flatMap((chapter) => {
    const opener = chapterOpener(sections, chapter.chapter);
    return opener
      ? [{ id: chapter.chapter, label: variant === "bottom" ? SHORT[chapter.chapter] : chapter.tab, full: chapter.title, to: sectionLocation(slug, opener) }]
      : [];
  });
  const index = sections.find((s) => s.key === INDEX_KEY);
  if (index && variant === "edge") list.push({ id: "index", label: "Index", full: "Index of names", to: sectionLocation(slug, index) });
  return list;
});
</script>

<template>
  <nav :class="variant === 'edge' ? 'ob-thumbs' : 'ob-tabbar'" aria-label="Chapters">
    <RouterLink
      v-for="tab in tabs"
      :key="tab.id"
      :to="tab.to"
      :class="[variant === 'edge' ? 'ob-thumb' : 'ob-ptab', `ob-tab-${tab.id}`]"
      :aria-current="current === tab.id ? 'true' : undefined"
      :aria-label="`Open ${tab.full}`"
    >
      {{ tab.label }}
    </RouterLink>
  </nav>
</template>
