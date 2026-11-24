<template>
  <div class="flex flex-col gap-5" data-testid="canon-search-results" role="region" :aria-label="`Results for ${query.trim()}`">
    <EmptyState v-if="groups.length === 0" class="border border-dashed border-border bg-card" title="Nothing found" :description="`No title or body in the canon has “${query.trim()}” in it.`" />
    <section v-for="group in groups" :key="group.section" class="flex flex-col gap-1.5" :data-testid="`results-${group.section}`">
      <h2 class="m-0 text-eyebrow text-muted-foreground">{{ group.label }} · {{ group.hits.length }}</h2>
      <ul class="m-0 flex list-none flex-col border border-border bg-card p-0">
        <li v-for="hit in group.hits" :key="hit.key" class="border-b border-border last:border-b-0">
          <RouterLink
            :to="{ path: `/canon/${group.section}`, query: { entry: hit.entryId } }"
            class="flex min-w-0 flex-col gap-0.5 px-4 py-3 hover:bg-accent/40"
            data-testid="result-link"
            @click="emit('open')"
          >
            <span class="min-w-0 text-body text-foreground">{{ hit.title === "" ? "Untitled" : hit.title }}</span>
            <span v-if="hit.kind !== null" class="text-label text-muted-foreground">{{ hit.kind }} of {{ hit.of }}</span>
            <span v-if="hit.excerpt !== null" class="text-label italic text-muted-foreground">{{ hit.excerpt }}</span>
          </RouterLink>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
/**
 * The page's search results (#1258 item 21), standing in place of the part while a query is set: one group per part,
 * each hit a link to its entry (`/canon/<part>?entry=<id>`). Following one asks the page to clear the query, so the
 * part it lands on is the one on screen.
 */
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import type { CanonHitGroup } from "@/lib/canon/canonSearch";

const { groups, query } = defineProps<{ groups: readonly CanonHitGroup[]; query: string }>();
const emit = defineEmits<{ open: [] }>();
</script>
