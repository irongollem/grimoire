import { computed, ref, watch, type ComputedRef, type Ref } from "vue";
import { useRoute, useRouter, type RouteLocationRaw } from "vue-router";
import { useBelow } from "@/composables/useBreakpoint";
import { buildBookModel } from "@/lib/openBook/bookModel";
import {
  clampUnit,
  folioStarts,
  formatUnit,
  parseUnit,
  unitCount,
  unitOfPage,
  type ReadingMode,
} from "@/lib/openBook/pagination";
import { isMarked, keepKnown, readRibbons, toggleRibbon, writeRibbons, type Ribbon } from "@/lib/openBook/ribbons";
import {
  CONTENTS_KEY,
  estimateSectionPages,
  resolveSection,
  sectionLocation,
  sectionsOf,
  type BookSection,
} from "@/lib/openBook/sections";
import type { PageTarget } from "@/components/openBook/reader/readerContext";
import type { PublicOpenBook } from "@/types/openBook.types";

const SECTION_STRIDE = 10_000;

function param(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

/**
 * The state of someone reading a released book (#1085): which section the route names, which turn of it they are
 * on, how long each section really is (measured as the pages are laid out, estimated until then), where the folios
 * fall, and where the next and previous turns go. The route is the source of truth, so the browser's Back button is
 * the book's "previous page" and every spread has an address.
 */
export function useBookReader(book: Ref<PublicOpenBook>) {
  const route = useRoute();
  const router = useRouter();
  const isNarrow = useBelow("md");
  const mode = computed<ReadingMode>(() => (isNarrow.value ? "single" : "spread"));

  const slug = computed(() => param(route.params.slug));
  const model = computed(() => buildBookModel(book.value.snapshot));
  const sections = computed(() => sectionsOf(model.value));
  const estimates = computed(() => estimateSectionPages(model.value, sections.value));

  const section = computed<BookSection | null>(() =>
    resolveSection(sections.value, route.name, { chapter: param(route.params.chapter), entryId: param(route.params.entryId) }),
  );
  const sectionIndex = computed(() => sections.value.findIndex((s) => s.key === section.value?.key));

  // How many pages each section really took at the current page size. Cleared when the size changes.
  const measured = ref<Record<string, number>>({});
  const layout = ref("");
  function reportPages(key: string, count: number, nextLayout: string) {
    if (nextLayout !== layout.value) {
      layout.value = nextLayout;
      measured.value = {};
    }
    if (measured.value[key] !== count) measured.value = { ...measured.value, [key]: count };
  }
  const isMeasured = (key: string) => measured.value[key] !== undefined;
  const pagesOf = (key: string) => measured.value[key] ?? estimates.value.get(key) ?? 1;
  function unitsOf(key: string): number {
    if (key === CONTENTS_KEY) return mode.value === "single" ? 2 : 1;
    return unitCount(pagesOf(key), mode.value);
  }

  // Folios continue across the book. Sections nobody has opened yet are estimated, so a folio ahead of the reader
  // can shift by a page or two once that section is laid out; the pages the reader is on are always exact.
  const starts = computed(() => {
    const list = folioStarts(sections.value.map((s) => pagesOf(s.key)));
    return new Map(sections.value.map((s, i) => [s.key, list[i] ?? 1]));
  });
  const folioStartOf = (key: string) => starts.value.get(key) ?? 1;

  const requested = computed(() => parseUnit(route.query.s));
  const unit = computed(() => {
    const current = section.value;
    if (!current) return 0;
    // Until the article is laid out its length is a guess, and a guess must not rewrite a deep link.
    if (!isMeasured(current.key) && current.key !== CONTENTS_KEY && Number.isFinite(requested.value)) return requested.value;
    return clampUnit(requested.value, unitsOf(current.key));
  });
  const target = computed<PageTarget | null>(() =>
    section.value ? { key: section.value.key, unit: unit.value, order: sectionIndex.value * SECTION_STRIDE + Math.min(unit.value, SECTION_STRIDE - 1) } : null,
  );

  function locationAt(key: string, at: number): RouteLocationRaw | null {
    const s = sections.value.find((x) => x.key === key);
    if (!s) return null;
    const q = formatUnit(at);
    return sectionLocation(slug.value, s, q ? { s: q } : undefined);
  }

  const nextLocation = computed<RouteLocationRaw | null>(() => {
    const current = section.value;
    if (!current) return null;
    if (unit.value + 1 < unitsOf(current.key)) return locationAt(current.key, unit.value + 1);
    const next = sections.value[sectionIndex.value + 1];
    return next ? locationAt(next.key, 0) : null;
  });
  const prevLocation = computed<RouteLocationRaw | null>(() => {
    const current = section.value;
    if (!current) return null;
    if (unit.value > 0) return locationAt(current.key, unit.value - 1);
    const prev = sections.value[sectionIndex.value - 1];
    if (!prev) return null;
    return locationAt(prev.key, prev.key === CONTENTS_KEY ? unitsOf(CONTENTS_KEY) - 1 : Number.POSITIVE_INFINITY);
  });

  // True from the moment the target changes until the turn has finished drawing.
  const turning = ref(false);
  watch(
    () => target.value && `${target.value.key}:${target.value.unit}`,
    () => {
      turning.value = true;
    },
  );
  const settled = () => {
    turning.value = false;
  };

  /** A flow just told us how long its article is; if the address asked for a turn past the end, pull it back. */
  const instant = ref(false);
  watch(
    () => [section.value?.key, requested.value, measured.value, turning.value] as const,
    () => {
      const current = section.value;
      if (!current || turning.value || !isMeasured(current.key)) return;
      const clamped = clampUnit(requested.value, unitsOf(current.key));
      if (clamped === requested.value) return;
      instant.value = true;
      const q = formatUnit(clamped);
      void router
        .replace({ query: { ...route.query, s: q } })
        .finally(() => {
          instant.value = false;
        });
    },
    { flush: "post" },
  );

  function revealPage(key: string, page: number) {
    if (key !== section.value?.key) return;
    const at = unitOfPage(page, mode.value);
    if (at === unit.value) return;
    const loc = locationAt(key, at);
    if (loc) void router.push(loc);
  }

  function turnNext() {
    if (nextLocation.value) void router.push(nextLocation.value);
  }
  function turnPrev() {
    if (prevLocation.value) void router.push(prevLocation.value);
  }

  // Ribbons: the visitor's own, in this browser, per book.
  const stored = ref<Ribbon[]>(readRibbons(slug.value));
  watch(slug, (next) => {
    stored.value = readRibbons(next);
  });
  const ribbons: ComputedRef<Ribbon[]> = computed(() => keepKnown(stored.value, new Set(sections.value.map((s) => s.key))));
  const marked = computed(() => (section.value ? isMarked(ribbons.value, section.value.key, unit.value) : false));
  function toggleMark() {
    const current = section.value;
    if (!current) return;
    stored.value = toggleRibbon(ribbons.value, { key: current.key, unit: unit.value, title: current.title });
    writeRibbons(slug.value, stored.value);
  }

  return {
    mode,
    model,
    slug,
    sections,
    section,
    sectionIndex,
    unit,
    target,
    instant,
    turning,
    settled,
    pagesOf,
    isMeasured,
    unitsOf,
    folioStartOf,
    reportPages,
    revealPage,
    nextLocation,
    prevLocation,
    turnNext,
    turnPrev,
    ribbons,
    marked,
    toggleMark,
  };
}
