<script setup lang="ts">
/**
 * The public reader's shell (#1085): the desk, the leather binding, the open spread and everything that turns it.
 * The route names a section and a turn of it (`?s=`); this component draws that spread, listens for the ways a
 * visitor turns (corner, buttons, arrow keys, swipe) and pushes the next address. Pagination, folios and ribbons
 * live in `useBookReader`; the animation lives in `BookTurn`.
 */
import { computed, onBeforeUnmount, onMounted, provide, ref, watchEffect } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import BrandLogo from "@/components/brand/BrandLogo.vue";
import { useBookReader } from "@/composables/openBook/useBookReader";
import { IconChevronLeft, IconChevronRight, IconList, IconSearch } from "@/lib/icons";
import { MARKETING_URL } from "@/lib/marketing";
import { crumbsOf, sectionLocation, tabOf } from "@/lib/openBook/sections";
import type { PublicOpenBook } from "@/types/openBook.types";
import BookClosed from "./BookClosed.vue";
import BookDeskBar from "./BookDeskBar.vue";
import BookSlip from "./BookSlip.vue";
import BookThumbs from "./BookThumbs.vue";
import BookTurn from "./BookTurn.vue";
import ReaderPage from "./ReaderPage.vue";
import { leatherGrain, leatherStyle } from "@/lib/openBook/leather";
import { READER_KEY, type PageTarget } from "./readerContext";
import "./book.css";

const { book } = defineProps<{ book: PublicOpenBook }>();

const bookRef = computed(() => book);
const reader = useBookReader(bookRef);
const { mode, model, slug, sections, section, target, ribbons } = reader;

const bookInfo = computed(() => model.value.snapshot.book);
const releaseLabel = computed(() => {
  const when = new Date(book.release.created_at);
  const date = Number.isNaN(when.getTime()) ? "" : ` · ${when.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}`;
  return `Release ${book.release.number}${date}`;
});

provide(READER_KEY, {
  model,
  slug,
  sections,
  mode,
  ribbons,
  releaseLabel,
  pagesOf: reader.pagesOf,
  isMeasured: reader.isMeasured,
  hasFront: reader.hasFront,
  folioStartOf: reader.folioStartOf,
  reportPages: reader.reportPages,
  revealPage: reader.revealPage,
});

// The pages a drag of either corner would reach, so the curl can show them while the hand is still on the paper.
const nextTarget = computed<PageTarget | null>(() => {
  const t = target.value;
  const s = section.value;
  if (!t || !s || !reader.nextLocation.value) return null;
  if (reader.unit.value + 1 < reader.unitsOf(s.key)) return { key: t.key, unit: t.unit + 1, order: t.order + 1 };
  const following = sections.value[reader.sectionIndex.value + 1];
  return following ? { key: following.key, unit: 0, order: t.order + 1 } : null;
});
const prevTarget = computed<PageTarget | null>(() => {
  const t = target.value;
  if (!t || !reader.prevLocation.value) return null;
  if (t.unit > 0) return { key: t.key, unit: t.unit - 1, order: t.order - 1 };
  const before = sections.value[reader.sectionIndex.value - 1];
  return before ? { key: before.key, unit: reader.unitsOf(before.key) - 1, order: t.order - 1 } : null;
});

const crumbs = computed(() => (section.value ? crumbsOf(model.value, sections.value, slug.value, section.value) : []));
const currentTab = computed(() => (section.value ? tabOf(section.value) : null));
const style = computed(() => leatherStyle(bookInfo.value.leather));
const grain = computed(() => leatherGrain(bookInfo.value.leather));

// The tab and the page title say where you are.
const previousTitle = typeof document === "undefined" ? "" : document.title;
watchEffect(() => {
  if (typeof document === "undefined") return;
  const name = section.value ? section.value.title : "This page is not in the book";
  document.title = `${name} · ${bookInfo.value.title}`;
});
onBeforeUnmount(() => {
  if (typeof document !== "undefined") document.title = previousTitle;
});

const announce = computed(() => {
  const s = section.value;
  if (!s) return "";
  const units = reader.unitsOf(s.key);
  return `${s.title}, ${mode.value === "single" ? "page" : "spread"} ${reader.unit.value + 1} of ${units}`;
});

// Ribbons hang from the headband, each a different length so they can be told apart.
const ribbonHangs = computed(() =>
  ribbons.value.flatMap((r, i) => {
    const s = sections.value.find((x) => x.key === r.key);
    return s
      ? [
          {
            id: `${r.key}:${r.unit}`,
            title: r.title,
            hue: i % 3,
            height: `${10.5 - i * 1.75}rem`,
            here: r.key === section.value?.key && r.unit === reader.unit.value,
            to: sectionLocation(slug.value, s, r.unit > 0 ? { s: String(r.unit) } : undefined),
          },
        ]
      : [];
  }),
);

// Search and (on a phone) contents, as a torn slip.
const slipOpen = ref(false);
const slipReturn = ref<HTMLElement | null>(null);
function openSlip() {
  slipReturn.value = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  slipOpen.value = true;
}
function closeSlip() {
  slipOpen.value = false;
  slipReturn.value?.focus();
}

// Arrow keys turn the page. Scoped to the reader's lifetime, and ignored while the visitor is typing or a slip is up.
function isTyping(el: EventTarget | null): boolean {
  return el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
}
function onKey(event: KeyboardEvent) {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (slipOpen.value || isTyping(event.target)) return;
  if (event.key === "ArrowRight") {
    event.preventDefault();
    reader.turnNext();
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    reader.turnPrev();
  }
}
onMounted(() => document.addEventListener("keydown", onKey));
onBeforeUnmount(() => document.removeEventListener("keydown", onKey));

// Swipe: a mostly-horizontal drag of a finger turns the page.
let swipe: { x: number; y: number } | null = null;
function onPointerDown(event: PointerEvent) {
  swipe = event.pointerType === "touch" ? { x: event.clientX, y: event.clientY } : null;
}
function onPointerUp(event: PointerEvent) {
  const start = swipe;
  swipe = null;
  if (!start) return;
  const dx = event.clientX - start.x;
  const dy = event.clientY - start.y;
  if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
  if (dx < 0) reader.turnNext();
  else reader.turnPrev();
}

const pdfUrl = computed(() => (book.allow_pdf ? book.release.pdf_url : null));
</script>

<template>
  <div class="ob-root" :data-mode="mode">
    <BookDeskBar
      v-if="mode === 'spread'"
      :slug="slug"
      :book-title="bookInfo.title"
      :crumbs="crumbs"
      :marked="reader.marked.value"
      :pdf-url="pdfUrl"
      @search="openSlip"
      @mark="reader.toggleMark"
    />
    <div v-else class="ob-phonebar">
      <AppButton variant="ghost" size="sm" :icon="IconList" label="Contents" @click="openSlip" />
      <span class="ob-where">{{ section?.title }}</span>
      <span class="ob-deskbar-group">
        <AppButton variant="ghost" size="sm" :icon="IconSearch" aria-label="Search the book" @click="openSlip" />
        <AppButton
          variant="ghost"
          size="sm"
          :icon="IconChevronLeft"
          aria-label="Previous page"
          :disabled="!reader.prevLocation.value"
          @click="reader.turnPrev"
        />
        <AppButton
          variant="ghost"
          size="sm"
          :icon="IconChevronRight"
          aria-label="Next page"
          :disabled="!reader.nextLocation.value"
          @click="reader.turnNext"
        />
      </span>
    </div>

    <main class="ob-stage" @pointerdown="onPointerDown" @pointerup="onPointerUp" @pointercancel="swipe = null">
      <div v-if="target" class="ob-book">
        <div v-if="mode === 'spread'" class="ob-binding ob-leather" :data-grain="grain" :style="style" aria-hidden="true" />
        <BookTurn :target="target" :mode="mode" :instant="reader.instant.value" :next="nextTarget" :prev="prevTarget" @done="reader.settled">
          <template #page="{ target: t, side, live }">
            <ReaderPage :section-key="t.key" :unit="t.unit" :side="side" :release="book.release" :live="live" />
          </template>

          <div v-if="mode === 'spread' && ribbonHangs.length > 0" class="ob-ribbons">
            <RouterLink
              v-for="r in ribbonHangs"
              :key="r.id"
              :to="r.to"
              class="ob-ribbon"
              :data-hue="r.hue"
              :data-here="r.here ? '' : undefined"
              :style="{ height: r.height }"
              :aria-label="`Ribbon: ${r.title}`"
            />
          </div>
          <BookThumbs
            v-if="mode === 'spread'"
            :model="model"
            :sections="sections"
            :slug="slug"
            :current="currentTab"
            variant="edge"
          />
          <button
            v-if="reader.prevLocation.value && mode === 'spread'"
            type="button"
            class="ob-lift"
            data-dir="prev"
            aria-label="Turn back to the previous page"
            @click="reader.turnPrev"
          />
          <button
            v-if="reader.nextLocation.value"
            type="button"
            class="ob-lift"
            data-dir="next"
            aria-label="Turn to the next page"
            @click="reader.turnNext"
          />
        </BookTurn>
      </div>
      <BookClosed v-else kind="page" :slug="slug" />
    </main>

    <footer v-if="mode === 'spread'" class="ob-footbar">
      <a class="ob-colophon" :href="MARKETING_URL" target="_blank" rel="noopener noreferrer">
        <BrandLogo class="h-6 w-auto" />
        <span>Made with Dungeon Grimoire</span>
      </a>
      <span class="ob-deskbar-group">
        <AppButton
          variant="outline"
          size="sm"
          :icon="IconChevronLeft"
          label="Previous"
          :disabled="!reader.prevLocation.value"
          @click="reader.turnPrev"
        />
        <AppButton
          variant="outline"
          size="sm"
          :icon-right="IconChevronRight"
          label="Next"
          :disabled="!reader.nextLocation.value"
          @click="reader.turnNext"
        />
      </span>
      <span class="ob-colophon">{{ releaseLabel }}</span>
    </footer>
    <BookThumbs
      v-else
      :model="model"
      :sections="sections"
      :slug="slug"
      :current="currentTab"
      variant="bottom"
    />

    <BookSlip
      :open="slipOpen"
      :model="model"
      :sections="sections"
      :slug="slug"
      :ribbons="ribbons"
      :with-contents="mode === 'single'"
      @close="closeSlip"
    />
    <p class="ob-sr" aria-live="polite">{{ announce }}</p>
  </div>
</template>
