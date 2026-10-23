<script setup lang="ts">
/** A long article of lore. Everything it is made of (sections, tables, figures, small print) is its rich text. */
import type { BookModel } from "@/lib/openBook/bookModel";
import type { OpenBookLore } from "@/types/openBook.types";
import { humanize } from "@/lib/openBook/articleData";
import BookRichText from "../BookRichText.vue";

const { model, lore } = defineProps<{ model: BookModel; lore: OpenBookLore }>();
</script>

<template>
  <article class="book-article book-lore">
    <header>
      <span v-if="lore.category" class="book-eyebrow">{{ humanize(lore.category) }}</span>
      <h1 class="book-title book-title-sm">{{ lore.title }}</h1>
    </header>
    <div v-if="lore.content" class="book-prose book-dropcap"><BookRichText :content="lore.content" :model="model" /></div>
  </article>
</template>
