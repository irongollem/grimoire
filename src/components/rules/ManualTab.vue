<template>
  <div class="flex h-full min-h-0">
    <!-- Sidebar -->
    <div class="w-64 shrink-0 flex flex-col gap-1 overflow-y-auto px-4 pt-4 pb-4 md:px-6 md:pt-6">
      <div class="relative mb-1">
        <IconSearch class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          v-model="search"
          type="text"
          placeholder="IconSearch manual…"
          class="w-full bg-card border border-border rounded-md pl-8 pr-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <template v-if="search.trim()">
        <button
          v-for="page in searchResults"
          :key="page.id"
          class="text-left px-2.5 py-1.5 rounded-md font-fell text-sm transition-colors"
          :class="selectedId === page.id ? 'bg-primary/10 text-primary font-semibold' : 'text-foreground hover:bg-muted/60'"
          @click="selectPage(page.id)"
        >{{ page.title }}</button>
        <p v-if="!searchResults.length" class="font-fell text-xs text-muted-foreground italic px-1">No matches.</p>
      </template>

      <template v-else>
        <div v-for="section in manualSections" :key="section.id" class="mb-1">
          <p class="px-2.5 py-1 font-cinzel text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
            {{ section.title }}
          </p>
          <button
            v-for="page in section.pages"
            :key="page.id"
            class="w-full text-left px-2.5 py-1.5 rounded-md font-fell text-sm transition-colors"
            :class="selectedId === page.id ? 'bg-primary/10 text-primary font-semibold' : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'"
            @click="selectPage(page.id)"
          >{{ page.title }}</button>
        </div>
      </template>
    </div>

    <!-- Content -->
    <div ref="contentEl" class="flex-1 overflow-y-auto px-4 pt-4 pb-4 md:px-6 md:pt-6">
      <!-- Page content -->
      <div v-if="selectedPage" class="max-w-3xl space-y-4">
        <div>
          <p class="font-cinzel text-[10px] font-bold tracking-widest text-muted-foreground uppercase mb-1">
            {{ selectedSection?.title }}
          </p>
          <h2 class="font-cinzel text-xl font-bold text-foreground">{{ selectedPage.title }}</h2>
          <p v-if="selectedPage.summary" class="font-fell text-sm text-muted-foreground italic mt-1">
            {{ selectedPage.summary }}
          </p>
        </div>
        <div
          class="manual-content font-fell text-sm text-foreground leading-relaxed"
          v-html="selectedPage.html"
        />
      </div>

      <!-- Welcome CTA — shown when no pages are loaded -->
      <div v-else class="flex items-center justify-center h-full">
        <div class="max-w-sm text-center space-y-4 px-4">
          <IconBookMarked class="h-10 w-10 text-primary/60 mx-auto" />
          <div>
            <h3 class="font-cinzel text-base font-bold text-foreground">New to Grimoire?</h3>
            <p class="font-fell text-sm text-muted-foreground mt-1">
              The DM Manual walks you through every feature — from setting up your first campaign to running live combat.
            </p>
          </div>
          <button
            v-if="introPageId"
            class="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground font-cinzel text-xs font-semibold tracking-wide hover:bg-primary/90 transition-colors"
            @click="selectPage(introPageId)"
          >
            <IconPopulate class="h-3.5 w-3.5" />
            Start with the Introduction
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconBookMarked, IconPopulate, IconSearch } from '@/lib/icons';
import { manualSections } from "@/lib/manualLoader";

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

watch(selectedId, () => {
  contentEl.value?.scrollTo({ top: 0 });
});

const search = ref("");

const searchResults = computed(() => {
  const q = search.value.trim().toLowerCase();
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
</script>

<style scoped>
@reference "@/assets/main.css";

.manual-content :deep(h2) {
  @apply font-cinzel text-base font-bold text-foreground mt-6 mb-2 first:mt-0 pb-1;
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
.manual-content :deep(table) {
  @apply w-full border-collapse my-3 text-sm;
}
.manual-content :deep(th),
.manual-content :deep(td) {
  @apply border border-border px-3 py-1.5 text-left align-top;
}
.manual-content :deep(th) {
  @apply font-cinzel text-xs font-semibold tracking-wider bg-muted/50 text-foreground;
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
.manual-content :deep(blockquote) {
  @apply border-l-2 border-primary/50 pl-4 italic text-muted-foreground my-3;
}
</style>
