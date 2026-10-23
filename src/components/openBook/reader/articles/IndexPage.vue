<script setup lang="ts">
/** The A-Z index: every page of the book under its letter, each a link. */
import type { BookModel } from "@/lib/openBook/bookModel";
import { CHAPTER_META } from "@/lib/openBook/bookModel";
import ArticleEntryLink from "./ArticleEntryLink.vue";
import "./bookArticles.css";

defineProps<{ model: BookModel }>();
</script>

<template>
  <section class="book-index">
    <span class="book-eyebrow">A to Z</span>
    <h2>Index</h2>
    <div v-for="group in model.index" :key="group.letter">
      <h3 class="book-index-letter">{{ group.letter }}</h3>
      <div v-for="entry in group.entries" :key="entry.id" class="book-ref">
        <ArticleEntryLink :model="model" :id="entry.id" />
        <span class="book-ref-note">{{ CHAPTER_META[entry.chapter].tab }}</span>
      </div>
    </div>
  </section>
</template>
