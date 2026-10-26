<template>
  <section class="rounded-md border border-border bg-card px-4 py-3" aria-live="polite">
    <p class="text-label text-muted-foreground uppercase tracking-wider">The answer</p>
    <p class="mt-0.5 text-heading-xs italic text-foreground">{{ answerSentence(result) }}</p>
    <ul v-if="result.lines.length" class="mt-2 divide-y divide-border/60">
      <li v-for="line in result.lines" :key="line.key" class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5">
        <span class="text-body font-semibold text-foreground">
          <template v-for="(part, i) in highlightParts(line.name, query)" :key="i">
            <mark v-if="part.hit" class="packs-mark">{{ part.text }}</mark>
            <template v-else>{{ part.text }}</template>
          </template>
          <span v-if="line.total > 1" class="ml-1 font-normal text-muted-foreground">×{{ line.total }}</span>
        </span>
        <span class="text-caption text-muted-foreground">{{ line.where.join(" · ") }}</span>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { answerSentence, highlightParts, type PackSearchResult } from "@/lib/inventory/packSearch";

defineProps<{ result: PackSearchResult; query: string }>();
</script>

<style>
/* The match mark, shared by the answer strip and the rows: gilt where a theme has it. */
.packs-mark {
  background: color-mix(in oklab, var(--primary-fill, var(--primary)) 32%, transparent);
  color: inherit;
  border-radius: 0.125rem;
  padding: 0 0.0625rem;
}
</style>
