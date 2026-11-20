<script setup lang="ts">
/** The truths of the world known to all (#1226), the first page of Lore and Legend: one line each, no body. */
import type { OpenBookTruth } from "@/types/openBook.types";

defineProps<{ truths: OpenBookTruth[] }>();
</script>

<template>
  <article class="book-article book-truths">
    <header>
      <span class="book-eyebrow">What is known to all</span>
      <h1 class="book-title book-title-sm">Truths of the world</h1>
    </header>
    <section class="book-refs">
      <div v-for="truth in truths" :key="truth.id" class="book-ref">
        <span>{{ truth.title }}</span>
      </div>
    </section>
  </article>
</template>
