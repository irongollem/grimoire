<template>
  <div class="flex h-full min-h-0 flex-col bg-background">
    <!-- Compact phone header — back, title, doc type + where it lives. Mirrors
         QuestPhoneTopBar's shape (copied, not re-derived: see goBack below). -->
    <header
      class="sticky top-0 z-10 flex min-h-13 items-center gap-2 border-b border-border bg-card px-2 py-2"
    >
      <AppButton
        variant="ghost"
        size="icon-sm"
        shape="pill"
        :class="ICON_TOUCH_TARGET"
        :icon="IconChevronLeft"
        icon-size="lg"
        aria-label="Back to Scriptorium"
        @click="goBack"
      />
      <div class="min-w-0 flex-1">
        <p class="truncate font-cinzel text-body font-bold leading-tight text-foreground">
          {{ doc.title }}
        </p>
        <p class="truncate font-fell text-caption text-muted-foreground">
          {{ docTypeLabel }} · {{ scopeLabel }}
        </p>
      </div>
      <slot name="actions" />
    </header>

    <!-- The book, as one flowing column — sc-theme + the theme class give it
         the same palette/typography as the desktop galley; ScriptoriumReader's
         own scoped styles below undo everything that assumes a physical page. -->
    <div ref="scrollRef" class="sc-theme min-h-0 flex-1 overflow-y-auto px-4 py-4" :class="themeClass">
      <!-- A contents list earns its place only with somewhere to jump to: a
           one-heading handout (a wanted poster, a letter) reads better without. -->
      <div v-if="tocEntries.length > 1" class="mb-4 rounded-lg border border-border bg-card p-3">
        <p class="sc-toc-heading">Contents</p>
        <ul class="reader-toc flex flex-col">
          <li v-for="entry in tocEntries" :key="entry.blockId">
            <AppButton
              variant="menu"
              size="md"
              block
              :class="TOC_LEVEL_CLASS[entry.level]"
              @click="scrollToHeading(entry.blockId)"
            >
              <span class="min-w-0 flex-1 truncate">{{ entry.text }}</span>
            </AppButton>
          </li>
        </ul>
      </div>

      <ScriptoriumDocumentView :document="doc" layout="reader" :audience="audience" />
    </div>
  </div>
</template>

<script setup lang="ts">
/*
 * Scriptorium on a phone is a reader (#915 story 7) — an e-book column, not
 * the desktop galley shrunk down. Wraps ScriptoriumDocumentView (the same
 * read-only renderer the quest-runner handout uses) rather than building a
 * second one; every phone-only adjustment (cover-as-card, full-width images,
 * scrollable tables, hiding the pagination furniture) lives in this
 * component's own scoped styles below, never in the shared theme CSS.
 */
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import AppButton from "@/components/common/AppButton.vue";
import { ICON_TOUCH_TARGET } from "@/components/common/appButtonVariants";
import { IconChevronLeft } from "@/lib/icons";
import ScriptoriumDocumentView from "@/components/scriptorium/ScriptoriumDocumentView.vue";
import { collectReaderToc, type ReaderTocEntry } from "./reader/readerToc";
import { documentScopeOf } from "@/lib/scriptorium/documentScope";
import { DOC_TYPES } from "@/lib/scriptorium/editorConstants";
import { useCampaignStore } from "@/stores/campaign";
import { useAllDmCampaigns } from "@/composables/campaign/useCampaigns";
import { revealInScrollParent } from "@/lib/motion";
import type { ScriptoriumDocument } from "@/types/scriptorium.types";

// Renamed from the prop's own name to avoid shadowing the global `document`.
const {
  document: doc,
  audience = "dm",
  backTo = "/scriptorium",
} = defineProps<{
  document: ScriptoriumDocument;
  /** Passed through to the renderer; "player" shows only what the handout
   *  itself reveals of each embedded entity (#970). */
  audience?: "dm" | "player";
  /** Where Back goes when there is no history to return to. */
  backTo?: string;
}>();

const router = useRouter();

function goBack() {
  // Same "back if there's history, else the list" rule as the NPC sheet and
  // QuestPhoneTopBar — copied, not re-derived.
  if (window.history.length > 1) router.back();
  else void router.push(backTo);
}

const themeClass = computed(() => (doc.theme === "phb2014" ? "theme-phb2014" : "theme-onednd2024"));
// The doc type is the DM's own filing ("Custom", "Adventure Module"); to a
// player the document is simply something the DM handed them.
const docTypeLabel = computed(() => (audience === "player" ? "Handout" : DOC_TYPES[doc.doc_type].label));

const { activeCampaignId, activeCampaign } = storeToRefs(useCampaignStore());
const { data: allDmCampaigns } = useAllDmCampaigns();

const scopeLabel = computed(() => {
  const scope = documentScopeOf(doc, activeCampaignId.value);
  if (scope === "general") return "General";
  if (scope === "campaign") return activeCampaign.value?.name ?? "This campaign";
  return allDmCampaigns.value?.find((c) => c.id === doc.campaign_id)?.name ?? "Other campaign";
});

// Reading-text roles, largest first: the label roles are 10-12px chrome type
// and put a chapter's sections below its subsections in size.
const TOC_LEVEL_CLASS: Record<number, string> = {
  1: "text-body font-semibold",
  2: "pl-4 text-body",
  3: "pl-7 text-caption italic",
};

const scrollRef = ref<HTMLElement | null>(null);

// Populated from the live rendered DOM, not the stored JSON — see
// reader/readerToc.ts for why that's the correct source here. A "not read
// yet" document renders no headings at all (ScriptoriumDocumentView shows
// its own EmptyState instead), so this naturally stays empty for that case
// with no separate error handling needed.
const tocEntries = ref<ReaderTocEntry[]>([]);
function refreshToc() {
  const root = scrollRef.value;
  if (!root) return;
  // An entry whose target is gone from the DOM (an embed a player may not see
  // renders nothing, and one still resolving has no heading yet) must not be
  // offered: tapping it would scroll nowhere.
  tocEntries.value = collectReaderToc(root).filter(
    (entry) => root.querySelector(`[data-block-id="${entry.blockId}"]`) !== null,
  );
}

// ScriptoriumDocumentView's Tiptap editor renders its first content — and
// BlockId assigns any missing heading id via a transaction it dispatches
// from its own onCreate — asynchronously, after this component has already
// mounted. Nothing is exposed to await that from outside, so this watches
// the DOM directly rather than guessing a timeout.
let tocObserver: MutationObserver | null = null;
onMounted(() => {
  refreshToc();
  if (scrollRef.value) {
    tocObserver = new MutationObserver(refreshToc);
    tocObserver.observe(scrollRef.value, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-block-id"],
    });
  }
});
onUnmounted(() => tocObserver?.disconnect());

function scrollToHeading(blockId: string) {
  const el = scrollRef.value?.querySelector<HTMLElement>(`[data-block-id="${blockId}"]`);
  if (el) revealInScrollParent(el);
}
</script>

<style scoped>
/*
 * Reader-only overrides on top of the shared sc-theme content (theme-base.css
 * + theme-<name>.css). Those files stay untouched on purpose — another #915
 * story is editing them concurrently — so every phone-reading adjustment
 * lives here instead, reached through :deep() rather than a global class.
 */

/* The contents list is app chrome inside the book's .sc-theme scroll area, so
   the book's own list rules (bullets, hanging indent, item margins; theme-base
   .css) reached it and put a bullet beside every entry. */
.reader-toc {
  list-style: none;
  padding: 0;
  margin: 0;
}
.reader-toc li {
  margin: 0;
}

/* A paginated book turns these into real page/column breaks; a flowing
   reader has no pages to turn. A page break becomes a quiet section rule
   (still marks a real seam in the author's intent); a column break is
   genuinely nothing here, same as it already renders in a single-column
   galley. */
:deep(.sc-page-break) {
  height: 1px;
  margin: 1.5rem 0;
  background: linear-gradient(
    to right,
    transparent,
    color-mix(in srgb, var(--sc-accent) 35%, transparent),
    transparent
  );
}
:deep(.sc-column-break) {
  display: none;
}

/* Wide blocks span both columns of a two-column layout the reader never has
   — left alone `column-span: all` is already inert, this just trims the
   theme's block spacing back to ordinary prose rhythm. */
:deep(.sc-wide) {
  margin: 0.75rem 0;
}

/* The empty TOC placeholder never fills in outside the paginated book — only
   injectPagedToc, run against the printed pages, can number it (see
   pagedToc.ts). The reader's own tappable list above stands in for it. */
:deep(.sc-toc-placeholder) {
  display: none;
}

/* Cover pages are laid out for a full physical page: their children are
   `position: absolute` against a height only the print stylesheet sets (see
   pagedPreviewCss.ts) — with no page there's no height, so left alone the
   node would render as a case of overflow:hidden 0px. Here it's a compact
   hero/closing card instead. `!important` matches the technique the galley
   itself already uses for this exact node (scriptorium-editor.css), because
   the cover's own children are positioned via inline styles no ordinary rule
   can outrank. */
:deep(div[data-type="coverPage"]) {
  height: 18rem !important;
  border-radius: 0.75rem;
  margin: 0 0 1.25rem;
}
/* The cover's own title/subtitle/part-number sizes (coverPage.ts's
   FRONT_TITLE_STYLE etc.) are inline styles sized for a full physical page —
   up to 4.5rem — and clip hard against a card this short. Every variant's
   text shrinks uniformly rather than tuning each one's own inline padding,
   which isn't reachable without fragile exact-string style selectors. */
:deep(div[data-type="coverPage"] h1) {
  font-size: 1.375rem !important;
  line-height: 1.2 !important;
}
:deep(div[data-type="coverPage"] p) {
  font-size: 0.8rem !important;
}
/* A back cover is mostly text (a heading, three blurbs, a tagline), laid out
   against a full page: an art strip over the top third and the text pinned
   below it. Squeezed into the 18rem card it was cut off, and as the last thing
   in the document it left the end of the book unreachable. On a phone it
   flows instead: the strip becomes a band, the text follows it at its own
   height. */
:deep(div[data-type="coverPage"][data-variant="back"]) {
  height: auto !important;
}
:deep(div[data-type="coverPage"][data-variant="back"] > div) {
  position: static !important;
}
:deep(div[data-type="coverPage"][data-variant="back"] > div:first-child) {
  height: 8rem !important;
}
:deep(div[data-type="coverPage"][data-variant="back"] > div:last-child) {
  padding: 1rem !important;
}

/* The same goes for the padding round a cover's text (INSIDE_TEXT_STYLE etc.,
   up to 3rem): on a card this short it lifted the inside cover's two-line
   title up into the art above it. */
:deep(div[data-type="coverPage"] div:has(> h1)) {
  padding: 0.75rem 1rem 1rem !important;
}

/* A monster entry lays itself out for a two-column page: a wide stat block
   flows its own two internal columns, a column-size entry puts the block and
   its art side by side, and a wide entry floats its art beside the lore. At
   phone width each of those halves is a few words wide, and the ability table
   stacked "STR" one letter per line. Everything stacks here, overriding
   theme-base.css's more specific selectors. */
:deep(.sc-statblock--wide) {
  column-count: 1 !important;
}
:deep(.sc-statblock-entry-body) {
  grid-template-columns: 1fr !important;
}
:deep(.sc-statblock-entry--wide .sc-statblock-entry-aside:not(:has(.sc-entity-art))) {
  column-count: 1 !important;
}
:deep(.sc-statblock-entry--wide .sc-statblock-entry-aside .sc-entity-art) {
  float: none !important;
  max-width: 100% !important;
  margin: 0 auto 0.75rem !important;
}

/* Images: the editor's wrap/absolute layouts float or pin art against a wide
   page measure, which only crowds a single narrow column. Every image
   becomes a full-width block capped to a share of the viewport instead.
   `!important` because width/float/position are inline styles from
   ScriptoriumImage's own renderHTML. `[data-layout-mode]` is set only by
   that node — never by the cover's hand-built <img> tags in coverPage.ts —
   so the cover art above is untouched. */
:deep(img[data-layout-mode]) {
  float: none !important;
  position: static !important;
  width: 100% !important;
  height: auto !important;
  max-height: 60vh;
  object-fit: contain;
  margin: 1rem 0 !important;
}
:deep(.sc-img-wrap) {
  float: none !important;
  position: static !important;
  width: 100% !important;
  margin: 0 !important;
}
/* The theme caps a wrap image's wrapper at 50% of the (two-column-sized) page
   measure (.sc-theme .sc-img-wrap--wrapLeft/-wrapRight, theme-base.css) —
   needed there, wrong here where the wrapper IS the column. Unlike the
   properties above, max-width is never set inline (scriptoriumImage.ts only
   puts top/left/right/bottom/width inline, and only in the "absolute" layout
   mode), so this is a pure CSS-vs-CSS fight a more specific selector settles
   outright — three classes (.sc-theme + the base + the modifier) beats the
   theme rule's two, no !important needed now that the theme's own image
   rules have settled (#915 story 6 round 2). */
:deep(.sc-theme .sc-img-wrap.sc-img-wrap--wrapLeft),
:deep(.sc-theme .sc-img-wrap.sc-img-wrap--wrapRight) {
  max-width: 100%;
}

/* Tables scroll inside their own frame, never the page. @tiptap/extension-
   table already wraps every <table> in a `.tableWrapper` div, so no extra
   markup is needed to give it one. The theme's own `table { width: 100% }`
   is right for a page that never overflows sideways; here it would force a
   wide table's columns to cram into the screen instead of actually
   overflowing into the wrapper's scrollbar, so a narrow table still fills
   the column (min-width) while a wide one is free to grow past it (width). */
:deep(.tableWrapper) {
  overflow-x: auto;
  margin: 0.75rem 0;
}
/* No !important needed (#915 story 6 round 2): the theme's own rule is
   `.sc-theme table` (one class, one type — theme-base.css), and this
   selector is already more specific (the scope root plus two classes and a
   type) without reaching for it. */
:deep(.tableWrapper table) {
  width: auto;
  min-width: 100%;
}
/* The theme's base cell padding (0.6rem 1rem) is sized for a full page; the
   book's two-column flow tightens it, and a phone column is narrower still. */
:deep(.tableWrapper td),
:deep(.tableWrapper th) {
  padding: 0.35rem 0.5rem;
}
</style>
