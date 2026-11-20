<script setup lang="ts">
/**
 * A piece of the campaign's canon lore (#1226): its picture as a lead plate where it has one, its body, then its
 * passages in the order they were told, each under its heading. The passages arrive already limited to what the
 * whole party has been told, so the page prints exactly what it is given.
 */
import type { BookModel } from "@/lib/openBook/bookModel";
import type { OpenBookLore } from "@/types/openBook.types";
import { humanize } from "@/lib/openBook/articleData";
import BookRichText from "../BookRichText.vue";
import ArticleConnections from "./ArticleConnections.vue";
import ArticlePlate from "./ArticlePlate.vue";

const { model, lore } = defineProps<{ model: BookModel; lore: OpenBookLore }>();
</script>

<template>
  <article class="book-article book-lore">
    <ArticlePlate :src="lore.image_url" :alt="`Picture for ${lore.title}`" />
    <header>
      <span v-if="lore.lore_kind" class="book-eyebrow">{{ humanize(lore.lore_kind) }}</span>
      <h1 class="book-title book-title-sm">{{ lore.title }}</h1>
    </header>
    <div v-if="lore.body" class="book-prose book-dropcap"><BookRichText :content="lore.body" :model="model" /></div>
    <section v-for="passage in lore.passages" :key="passage.id" class="book-passage">
      <h2 v-if="passage.title" class="book-passage-title">{{ passage.title }}</h2>
      <div v-if="passage.body" class="book-prose"><BookRichText :content="passage.body" :model="model" /></div>
    </section>
    <ArticleConnections :model="model" :id="lore.id" />
  </article>
</template>
