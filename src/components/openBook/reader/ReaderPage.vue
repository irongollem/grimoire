<script setup lang="ts">
/**
 * One page of the book, whichever turn it is drawn for (#1085): given a section, a unit and a side, work out which
 * page that is (frontispiece, a page of the flowed article, a blank, the foreword or the contents) and draw it
 * with its running head and folio. The reader provides everything it needs through `ReaderContext`.
 */
import { computed } from "vue";
import { CHAPTER_META } from "@/lib/openBook/bookModel";
import { toRoman, unitSlots, type PageSlot } from "@/lib/openBook/pagination";
import { CONTENTS_KEY } from "@/lib/openBook/sections";
import type { PublicOpenBook } from "@/types/openBook.types";
import BookContentsPage from "./BookContentsPage.vue";
import BookPage from "./BookPage.vue";
import PageFlow from "./PageFlow.vue";
import { useReaderContext } from "./readerContext";

const { sectionKey, unit, side, release, live } = defineProps<{
  sectionKey: string;
  unit: number;
  side: "verso" | "recto";
  release: PublicOpenBook["release"];
  /** False for the faces of a leaf in flight: they are never the copy a screen reader or Tab should use. */
  live: boolean;
}>();

const ctx = useReaderContext();

const section = computed(() => ctx.sections.value.find((s) => s.key === sectionKey) ?? null);
const isContents = computed(() => sectionKey === CONTENTS_KEY);
const chapterMeta = computed(() => (section.value?.chapter ? CHAPTER_META[section.value.chapter] : null));

// An article not yet laid out has only an estimated length. Draw pages up to the unit asked for anyway: the flow
// has to be on screen to be measured, and the reader corrects the unit once it knows.
const slots = computed(() => {
  const known = ctx.pagesOf(sectionKey);
  const wanted = ctx.mode.value === "single" ? unit + 1 : unit * 2 + 1;
  return unitSlots(unit, ctx.isMeasured(sectionKey) ? known : Math.max(known, wanted), ctx.mode.value);
});
const slot = computed<PageSlot>(() => (side === "verso" ? (slots.value.verso ?? { kind: "blank" }) : slots.value.recto));
/** The recto copy of a spread carries the text for assistive technology; a lone verso must do it itself. */
const assistive = computed(() => live && (side === "recto" || slots.value.recto.kind !== "page"));

/** The contents spread: foreword then contents; on a phone they are two single pages. */
const contentsPart = computed<"foreword" | "contents">(() => {
  if (ctx.mode.value === "single") return unit === 0 ? "foreword" : "contents";
  return side === "verso" ? "foreword" : "contents";
});

const folio = computed(() => {
  const start = ctx.folioStartOf(sectionKey);
  if (isContents.value) {
    // Front matter takes roman numerals, numbered from the pages before the first chapter.
    const index = ctx.mode.value === "single" ? unit : side === "verso" ? 0 : 1;
    return toRoman(index + 1 + 1);
  }
  return slot.value.kind === "page" ? String(start + slot.value.k) : null;
});

const runLeft = computed(() => {
  if (isContents.value) return side === "verso" ? ctx.model.value.snapshot.book.title : "Contents";
  if (side === "verso") return chapterMeta.value ? `${chapterMeta.value.numeral} · ${chapterMeta.value.title}` : (section.value?.title ?? "");
  return section.value?.entry?.subtitle ?? "";
});
const runRight = computed(() => {
  if (isContents.value) return side === "verso" ? "Foreword" : `Release ${release.number}`;
  if (side === "verso") return "";
  return section.value?.title ?? "";
});

const label = computed(() => {
  if (isContents.value) return contentsPart.value === "foreword" ? "Foreword" : "Contents";
  if (slot.value.kind === "page" && folio.value) return `Page ${folio.value}, ${section.value?.title ?? ""}`;
  if (slot.value.kind === "front") return `${chapterMeta.value?.title ?? section.value?.title ?? "Chapter"} opens`;
  return "Blank page";
});

function onMeasured(count: number, layout: string) {
  ctx.reportPages(sectionKey, count, layout);
}
function onReveal(page: number) {
  ctx.revealPage(sectionKey, page);
}
</script>

<template>
  <BookPage :side="side" :run-left="runLeft" :run-right="runRight" :folio="folio" :label="label">
    <template v-if="isContents">
      <BookContentsPage
        :part="contentsPart"
        :model="ctx.model.value"
        :sections="ctx.sections.value"
        :slug="ctx.slug.value"
        :release="release"
        :ribbons="ctx.ribbons.value"
      />
    </template>
    <PageFlow
      v-else-if="section && slot.kind === 'page'"
      :model="ctx.model.value"
      :section="section"
      :k="slot.k"
      :assistive="assistive"
      @measured="onMeasured"
      @reveal="onReveal"
    />
    <div v-else-if="slot.kind === 'front'" class="ob-front">
      <span v-if="chapterMeta" class="ob-front-numeral">{{ chapterMeta.numeral }}</span>
      <h2 class="ob-front-title">{{ chapterMeta?.title ?? section?.title }}</h2>
      <span class="ob-front-rule" aria-hidden="true" />
      <p v-if="section?.kind === 'entry'" class="ob-front-note">{{ section.title }} begins on the facing page.</p>
    </div>
    <div v-else class="ob-front ob-end" aria-hidden="true">
      <span class="ob-front-rule" />
    </div>
  </BookPage>
</template>
