<script setup lang="ts">
/** A pantheon: its emblem, its description, and the deities that belong to it as a list of pages. */
import { computed } from "vue";
import type { BookModel } from "@/lib/openBook/bookModel";
import type { OpenBookPantheon } from "@/types/openBook.types";
import BookRichText from "../BookRichText.vue";
import ArticlePlate from "./ArticlePlate.vue";
import ArticleRefList from "./ArticleRefList.vue";

const { model, pantheon } = defineProps<{ model: BookModel; pantheon: OpenBookPantheon }>();

const deities = computed(() => model.deitiesOf(pantheon.id).map((d) => ({ id: d.id, note: d.titles })));
</script>

<template>
  <article class="book-article book-pantheon">
    <ArticlePlate class="book-plate-centered" :src="pantheon.emblem_url" :alt="`Emblem of ${pantheon.name}`" shape="square" />
    <header>
      <span class="book-eyebrow">A pantheon</span>
      <h1 class="book-title">{{ pantheon.name }}</h1>
    </header>
    <div v-if="pantheon.description" class="book-prose book-dropcap">
      <BookRichText :content="pantheon.description" :model="model" />
    </div>
    <ArticleRefList :model="model" title="Its deities" :items="deities" />
  </article>
</template>
