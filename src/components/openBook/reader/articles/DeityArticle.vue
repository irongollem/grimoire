<script setup lang="ts">
/** A deity: holy-symbol plate, domains as gilt-ruled chips, a facts table, the description. */
import { computed } from "vue";
import type { BookModel } from "@/lib/openBook/bookModel";
import type { OpenBookDeity } from "@/types/openBook.types";
import BookRichText from "../BookRichText.vue";
import ArticleAttr from "./ArticleAttr.vue";
import ArticleEntryLink from "./ArticleEntryLink.vue";
import ArticlePlate from "./ArticlePlate.vue";

const { model, deity } = defineProps<{ model: BookModel; deity: OpenBookDeity }>();

const domains = computed(() => deity.domains ?? []);
const alsoCalled = computed(() => (deity.alternate_names ?? []).join(", "));
const hasFacts = computed(
  () => deity.titles || alsoCalled.value || deity.alignment || deity.symbol || deity.portfolio || deity.pantheon_id,
);
</script>

<template>
  <article class="book-article book-deity">
    <div class="book-plates-row">
      <ArticlePlate :src="deity.symbol_image_url" :alt="`Holy symbol of ${deity.name}`" shape="square" />
      <ArticlePlate
        :src="deity.portrait_url"
        :alt="`Portrait of ${deity.name}`"
        shape="portrait"
      />
    </div>
    <header>
      <span v-if="deity.titles" class="book-eyebrow">{{ deity.titles }}</span>
      <h1 class="book-title">{{ deity.name }}</h1>
    </header>
    <div v-if="domains.length > 0" class="book-domains">
      <span v-for="domain in domains" :key="domain" class="book-dom">{{ domain }}</span>
    </div>
    <div v-if="hasFacts" class="book-attrs">
      <ArticleAttr v-if="deity.titles" label="Titles">{{ deity.titles }}</ArticleAttr>
      <ArticleAttr v-if="alsoCalled" label="Also called">{{ alsoCalled }}</ArticleAttr>
      <ArticleAttr v-if="deity.alignment" label="Alignment">{{ deity.alignment }}</ArticleAttr>
      <ArticleAttr v-if="deity.symbol" label="Symbol">{{ deity.symbol }}</ArticleAttr>
      <ArticleAttr v-if="deity.portfolio" label="Portfolio">{{ deity.portfolio }}</ArticleAttr>
      <ArticleAttr v-if="deity.pantheon_id" label="Pantheon">
        <ArticleEntryLink :model="model" :id="deity.pantheon_id" />
      </ArticleAttr>
    </div>
    <div v-if="deity.description" class="book-prose book-dropcap">
      <BookRichText :content="deity.description" :model="model" />
    </div>
  </article>
</template>
