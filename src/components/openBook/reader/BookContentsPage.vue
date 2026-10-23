<script setup lang="ts">
/**
 * The two pages that open the book (#1085): the foreword on the verso and the contents on the recto, with the
 * visitor's own ribbons listed under the chapters. Nothing here is the DM's prose; the foreword says what a
 * released book is and shows what this release holds.
 */
import { computed } from "vue";
import { RouterLink } from "vue-router";
import type { Ribbon } from "@/lib/openBook/ribbons";
import { INDEX_KEY, chapterOpener, sectionLocation, type BookSection } from "@/lib/openBook/sections";
import type { BookModel } from "@/lib/openBook/bookModel";
import type { PublicOpenBook } from "@/types/openBook.types";

const { part, model, sections, slug, release, ribbons } = defineProps<{
  part: "foreword" | "contents";
  model: BookModel;
  sections: BookSection[];
  slug: string;
  release: PublicOpenBook["release"];
  ribbons: Ribbon[];
}>();

const book = computed(() => model.snapshot.book);
const stats = computed(() => release.stats);

const rows = computed(() =>
  model.chapters.map((chapter) => {
    const opener = chapterOpener(sections, chapter.chapter);
    return {
      key: chapter.chapter,
      numeral: chapter.numeral,
      title: chapter.title,
      count: chapter.entries.length,
      to: opener ? sectionLocation(slug, opener) : { name: "open-book", params: { slug } },
    };
  }),
);

const indexSection = computed(() => sections.find((s) => s.key === INDEX_KEY) ?? null);

const ribbonLinks = computed(() =>
  ribbons.flatMap((r) => {
    const section = sections.find((s) => s.key === r.key);
    return section ? [{ ...r, to: sectionLocation(slug, section, r.unit > 0 ? { s: String(r.unit) } : undefined) }] : [];
  }),
);
</script>

<template>
  <div v-if="part === 'foreword'" class="ob-foreword">
    <span class="ob-eyebrow">Foreword</span>
    <h2>{{ book.title }}</h2>
    <p v-if="book.subtitle" class="ob-lede">{{ book.subtitle }}</p>
    <p>
      This book holds what our table has found so far. It grows as they do: a new release comes after most sessions,
      and the parts still secret are simply not printed yet. If you play with us, nothing here will spoil what is
      still ahead.
    </p>
    <div class="ob-stats">
      <span v-if="stats.places"><b>{{ stats.places }}</b>places</span>
      <span v-if="stats.folk"><b>{{ stats.folk }}</b>people</span>
      <span v-if="stats.factions"><b>{{ stats.factions }}</b>factions</span>
      <span v-if="stats.lore"><b>{{ stats.lore }}</b>tales</span>
      <span v-if="stats.sessions"><b>{{ stats.sessions }}</b>sessions</span>
    </div>
  </div>

  <div v-else class="ob-contents">
    <h1>Contents</h1>
    <nav aria-label="Chapters">
      <RouterLink v-for="row in rows" :key="row.key" :to="row.to" class="ob-toc">
        <span class="ob-toc-num">{{ row.numeral }}</span>
        <span class="ob-toc-line">
          <span class="ob-toc-name">{{ row.title }}</span>
          <span class="ob-toc-leader" aria-hidden="true" />
        </span>
        <span class="ob-toc-count">{{ row.count }}</span>
      </RouterLink>
      <RouterLink v-if="indexSection" :to="sectionLocation(slug, indexSection)" class="ob-toc">
        <span class="ob-toc-num" />
        <span class="ob-toc-line">
          <span class="ob-toc-name" data-italic>Index of names</span>
          <span class="ob-toc-leader" aria-hidden="true" />
        </span>
        <span class="ob-toc-count" />
      </RouterLink>
    </nav>
    <div v-if="ribbonLinks.length > 0" class="ob-ribbon-list">
      <span class="ob-eyebrow">Your ribbons</span>
      <span class="ob-ribbon-links">
        <RouterLink v-for="r in ribbonLinks" :key="`${r.key}:${r.unit}`" :to="r.to" class="ob-xref">{{ r.title }}</RouterLink>
      </span>
    </div>
  </div>
</template>
