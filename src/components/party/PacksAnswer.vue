<template>
  <section class="rounded-md border border-border bg-card px-4 py-3" aria-live="polite">
    <p class="text-label text-muted-foreground uppercase">The answer</p>
    <p class="mt-0.5 text-heading-xs italic text-foreground">{{ answerSentence(result) }}</p>
    <ul v-if="result.lines.length" class="mt-2 divide-y divide-border/60">
      <li v-for="line in result.lines" :key="line.key" class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5">
        <span class="text-body font-semibold text-foreground">
          <PackHighlight :text="line.name" :query="query" />
          <span v-if="line.total > 1" class="ml-1 font-normal text-muted-foreground">×{{ line.total }}</span>
        </span>
        <span class="text-caption text-muted-foreground">{{ line.where.join(" · ") }}</span>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { answerSentence, type PackSearchResult } from "@/lib/inventory/packSearch";
import PackHighlight from "./PackHighlight.vue";

defineProps<{ result: PackSearchResult; query: string }>();
</script>

