<script setup lang="ts">
/**
 * /w/<slug>: the cover of a released book (#1085), the first thing a visitor sees. Anyone may open it; it reads the
 * `open-book` Edge Function anonymously and holds no account, campaign or session state.
 */
import { computed, onBeforeUnmount, ref, watchEffect } from "vue";
import { useRoute } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import BannerLoader from "@/components/brand/BannerLoader.vue";
import BrandLogo from "@/components/brand/BrandLogo.vue";
import BookClosed from "@/components/openBook/reader/BookClosed.vue";
import BookCover, { type CoverTab } from "@/components/openBook/reader/BookCover.vue";
import BookSlip from "@/components/openBook/reader/BookSlip.vue";
import "@/components/openBook/reader/book.css";
import { usePublicOpenBook } from "@/composables/openBook/usePublicOpenBook";
import { IconList, IconSearch } from "@/lib/icons";
import { MARKETING_URL } from "@/lib/marketing";
import { pluralize } from "@/lib/openBook/articleData";
import { buildBookModel } from "@/lib/openBook/bookModel";
import { readRibbons, keepKnown } from "@/lib/openBook/ribbons";
import { chapterOpener, sectionLocation, sectionsOf } from "@/lib/openBook/sections";

const route = useRoute();
const slug = computed(() => {
  const raw = route.params.slug;
  return Array.isArray(raw) ? (raw[0] ?? "") : raw;
});
const query = usePublicOpenBook(slug);

const found = computed(() => (query.data.value?.status === "found" ? query.data.value.book : null));
const model = computed(() => (found.value ? buildBookModel(found.value.snapshot) : null));
const sections = computed(() => (model.value ? sectionsOf(model.value) : []));

const tabs = computed<CoverTab[]>(() => {
  const m = model.value;
  if (!m) return [];
  return m.chapters.flatMap((chapter) => {
    const opener = chapterOpener(sections.value, chapter.chapter);
    return opener ? [{ id: chapter.chapter, label: chapter.tab, to: sectionLocation(slug.value, opener) }] : [];
  });
});

const ribbons = computed(() => keepKnown(readRibbons(slug.value), new Set(sections.value.map((s) => s.key))));
const ribbonLinks = computed(() =>
  ribbons.value.flatMap((r) => {
    const s = sections.value.find((x) => x.key === r.key);
    return s ? [{ key: `${r.key}:${r.unit}`, title: r.title, to: sectionLocation(slug.value, s, r.unit > 0 ? { s: String(r.unit) } : undefined) }] : [];
  }),
);

const address = computed(() => `${typeof location === "undefined" ? "" : location.host}/w/${slug.value}`);
const stats = computed(() => found.value?.release.stats ?? null);
const pages = computed(() => model.value?.entries.length ?? 0);
const releaseLabel = computed(() => {
  const release = found.value?.release;
  if (!release) return "";
  const when = new Date(release.created_at);
  const date = Number.isNaN(when.getTime()) ? "" : ` · ${when.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}`;
  return `Release ${release.number}${date}`;
});

const slipOpen = ref(false);

const previousTitle = typeof document === "undefined" ? "" : document.title;
watchEffect(() => {
  if (typeof document === "undefined") return;
  if (found.value) document.title = found.value.snapshot.book.title;
  else if (query.data.value?.status === "not_found") document.title = "This book is closed";
});
onBeforeUnmount(() => {
  if (typeof document !== "undefined") document.title = previousTitle;
});
</script>

<template>
  <div class="ob-root">
    <div v-if="query.isPending.value" class="ob-quiet" role="status">
      <BannerLoader class="h-12" />
    </div>
    <BookClosed v-else-if="!found || !model" kind="closed" />

    <template v-else>
      <header class="ob-deskbar">
        <span class="ob-colophon">{{ address }}</span>
        <div class="ob-deskbar-group">
          <AppButton variant="outline" size="sm" :icon="IconSearch" label="Search the book" @click="slipOpen = true" />
          <AppButton
            variant="outline"
            size="sm"
            :icon="IconList"
            label="Index"
            :to="{ name: 'open-book-index', params: { slug } }"
          />
        </div>
      </header>

      <main class="ob-cover-scene">
        <div class="ob-cover-side">
          <span class="ob-cover-eyebrow">A world kept in Dungeon Grimoire</span>
          <blockquote v-if="found.snapshot.book.subtitle">{{ found.snapshot.book.subtitle }}</blockquote>
          <div v-if="stats" class="ob-cover-stats">
            <span v-if="stats.places"><b>{{ stats.places }}</b> {{ pluralize(stats.places, "place") }}</span>
            <span v-if="stats.folk"><b>{{ stats.folk }}</b> {{ pluralize(stats.folk, "person", "people") }}</span>
            <span><b>{{ pages }}</b> {{ pluralize(pages, "page") }}</span>
          </div>
        </div>

        <BookCover :book="found.snapshot.book" :tabs="tabs" :ribbon-count="ribbons.length" />

        <div class="ob-cover-act">
          <AppButton variant="primary" size="lg" :to="{ name: 'open-book-contents', params: { slug } }" label="Open the book" />
          <p class="ob-cover-hint">Or pull a tab on the edge to open straight at a chapter.</p>
          <div v-if="ribbonLinks.length > 0" class="ob-cover-ribbons">
            <span v-for="r in ribbonLinks" :key="r.key">
              Your ribbon: <RouterLink :to="r.to">{{ r.title }}</RouterLink>
            </span>
          </div>
        </div>
      </main>

      <footer class="ob-footbar">
        <a class="ob-colophon" :href="MARKETING_URL" target="_blank" rel="noopener noreferrer">
          <BrandLogo class="h-6 w-auto" />
          <span>Made with Dungeon Grimoire</span>
        </a>
        <span class="ob-colophon">{{ releaseLabel }}</span>
      </footer>

      <BookSlip
        :open="slipOpen"
        :model="model"
        :sections="sections"
        :slug="slug"
        :ribbons="ribbons"
        :with-contents="false"
        @close="slipOpen = false"
      />
    </template>
  </div>
</template>
