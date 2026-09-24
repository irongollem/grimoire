<template>
  <div class="flex h-full min-h-0">
    <!-- Sidebar — on a phone it is the whole screen until a page is opened -->
    <div
      v-show="!isMobile || !hasPageParam"
      class="w-full md:w-64 shrink-0 flex flex-col gap-1 overflow-y-auto px-4 pt-4 pb-4 md:px-6 md:pt-6"
    >
      <ListFilterBar
        class="mb-1"
        :has-active-filters="ui.manualHasActiveFilters"
        @clear="ui.resetManualFilters()"
      >
        <template #above>
          <ListSearchInput v-model="ui.manualSearch" :inline="false" placeholder="Search manual…" />
        </template>
      </ListFilterBar>

      <template v-if="ui.manualSearch.trim()">
        <AppButton
          v-for="page in searchResults"
          :key="page.id"
          variant="menu"
          size="body"
          block
          :active="selectedId === page.id"
          :class="selectedId === page.id ? 'font-semibold' : ''"
          :label="page.title"
          @click="selectPage(page.id)"
        />
        <p v-if="!searchResults.length" class="text-caption text-muted-foreground italic px-1">No matches.</p>
      </template>

      <template v-else>
        <div v-for="section in manualSections" :key="section.id" class="mb-1">
          <p class="px-2.5 py-1 font-cinzel text-2xs font-bold tracking-widest text-muted-foreground uppercase">
            {{ section.title }}
          </p>
          <AppButton
            v-for="page in section.pages"
            :key="page.id"
            variant="menu"
            size="body"
            block
            :active="selectedId === page.id"
            :class="selectedId === page.id ? 'font-semibold' : ''"
            :label="page.title"
            @click="selectPage(page.id)"
          />
        </div>
      </template>
    </div>

    <!-- Content -->
    <div
      v-show="!isMobile || hasPageParam"
      ref="contentEl"
      class="flex-1 min-w-0 overflow-y-auto px-4 pt-4 pb-4 md:px-6 md:pt-6"
    >
      <!-- Page content -->
      <div v-if="selectedPage" class="max-w-3xl space-y-4">
        <AppButton
          v-if="isMobile"
          variant="ghost"
          size="sm"
          :icon="IconChevronLeft"
          label="All pages"
          @click="showContents"
        />
        <div>
          <p class="font-cinzel text-2xs font-bold tracking-widest text-muted-foreground uppercase mb-1">
            {{ selectedSection?.title }}
          </p>
          <h2 class="text-heading-lg font-bold text-foreground">{{ selectedPage.title }}</h2>
          <p v-if="selectedPage.summary" class="text-body text-muted-foreground italic mt-1">
            {{ selectedPage.summary }}
          </p>
        </div>
        <div
          class="manual-content text-body text-foreground leading-relaxed"
          @click="onContentClick"
          v-html="selectedPage.html"
        />
      </div>

      <!-- Welcome CTA — shown when no pages are loaded -->
      <div v-else class="flex items-center justify-center h-full">
        <div class="max-w-sm text-center space-y-4 px-4">
          <IconBookMarked class="h-10 w-10 text-primary/60 mx-auto" />
          <div>
            <h3 class="text-heading-sm font-bold text-foreground">New to Grimoire?</h3>
            <p class="text-body text-muted-foreground mt-1">
              The DM Manual walks you through every feature — from setting up your first campaign to running live combat.
            </p>
          </div>
          <AppButton
            v-if="introPageId"
            variant="primary"
            size="md"
            :icon="IconPopulate"
            label="Start with the Introduction"
            @click="selectPage(introPageId)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconBookMarked, IconChevronLeft, IconPopulate } from '@/lib/icons';
import { manualSections } from "@/lib/manualLoader";
import { useUiStore } from "@/stores/ui";
import { useIsMobile } from "@/composables/useBreakpoint";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
import AppButton from "@/components/common/AppButton.vue";

const route = useRoute();
const router = useRouter();

const allPages = computed(() => manualSections.flatMap((s) => s.pages));

// The first page (Welcome to Grimoire / Getting Started) serves as the intro.
const introPageId = computed(() => allPages.value[0]?.id ?? "");

// selectedId is driven by the ?page= query param; falls back to the first page.
const selectedId = computed(() => {
  const q = route.query.page as string | undefined;
  return q && allPages.value.some((p) => p.id === q) ? q : (allPages.value[0]?.id ?? "");
});

const contentEl = ref<HTMLElement | null>(null);

// A 16rem page list beside the page leaves a phone a sliver to read in, so
// below md it is one or the other: the list until a page is opened, then the
// page with a way back. Desktop keeps both and opens the first page by default.
const isMobile = useIsMobile();
const hasPageParam = computed(() => typeof route.query.page === "string");

function showContents() {
  const query = { ...route.query };
  delete query.page;
  router.replace({ query });
}

watch(selectedId, () => {
  contentEl.value?.scrollTo({ top: 0 });
});

// Filter State Pattern — the manual query survives navigating away and back.
const ui = useUiStore();

const searchResults = computed(() => {
  const q = ui.manualSearch.trim().toLowerCase();
  if (!q) return allPages.value;
  return allPages.value.filter(
    (p) =>
      p.title.toLowerCase().includes(q) ||
      p.summary?.toLowerCase().includes(q) ||
      p.keywords.some((k) => k.includes(q)) ||
      p.html.toLowerCase().includes(q),
  );
});

const selectedPage = computed(() => allPages.value.find((p) => p.id === selectedId.value));
const selectedSection = computed(() =>
  manualSections.find((s) => s.pages.some((p) => p.id === selectedId.value)),
);

function selectPage(id: string) {
  router.replace({ query: { ...route.query, page: id } });
}

// Pages cross-reference each other as `[Quest Log](#quest-log)`: the fragment
// is a page id, so a click opens that page rather than scrolling to an anchor.
// manualLoader.test.ts holds every such fragment to a real page.
function onContentClick(event: MouseEvent) {
  if (!(event.target instanceof Element)) return;
  const href = event.target.closest("a")?.getAttribute("href");
  if (!href?.startsWith("#")) return;
  event.preventDefault();
  selectPage(href.slice(1));
}
</script>

<style scoped>
@reference "@/assets/main.css";

.manual-content :deep(h2) {
  @apply text-heading-sm font-bold text-foreground mt-6 mb-2 first:mt-0 pb-1;
  border-bottom: 1px solid rgba(201, 146, 10, 0.25);
}
.manual-content :deep(h3) {
  @apply font-cinzel text-sm font-bold text-foreground mt-5 mb-2 first:mt-0;
}
.manual-content :deep(p) {
  @apply mb-3 last:mb-0 leading-relaxed;
}
.manual-content :deep(ul),
.manual-content :deep(ol) {
  @apply pl-5 mb-3 space-y-1;
}
.manual-content :deep(ul) { list-style-type: disc; }
.manual-content :deep(ol) { list-style-type: decimal; }
.manual-content :deep(li) { @apply leading-relaxed; }
/* manualLoader wraps each table so a wide one scrolls inside itself on a
   phone instead of pushing the page sideways. */
.manual-content :deep(.manual-table) {
  @apply overflow-x-auto my-3;
}
.manual-content :deep(table) {
  @apply w-full border-collapse text-sm;
}
.manual-content :deep(th),
.manual-content :deep(td) {
  @apply border border-border px-3 py-1.5 text-left align-top;
}
.manual-content :deep(th) {
  @apply text-label-lg font-semibold bg-muted/50 text-foreground;
}
.manual-content :deep(code) {
  @apply font-mono text-xs bg-muted px-1.5 py-0.5 rounded text-primary;
}
.manual-content :deep(strong) {
  @apply font-semibold text-foreground;
}
.manual-content :deep(em) {
  @apply italic text-muted-foreground;
}
.manual-content :deep(a) {
  @apply text-primary underline underline-offset-2 hover:text-primary/80;
}
.manual-content :deep(blockquote) {
  @apply border-l-2 border-primary/50 pl-4 italic text-muted-foreground my-3;
}
</style>
