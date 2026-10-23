<script setup lang="ts">
/**
 * Every article of a release, drawn once with the reader's own components, so the printed book reads like the web
 * one. It is mounted off-screen by `renderArticles`, whose HTML the page layout then cuts into pages; nothing here
 * is interactive. Each section is wrapped so the caller can take its markup by key.
 */
import { computed } from "vue";
import type { BookModel } from "@/lib/openBook/bookModel";
import { sectionsOf } from "@/lib/openBook/sections";
import AlmanacPage from "@/components/openBook/reader/articles/AlmanacPage.vue";
import BookArticle from "@/components/openBook/reader/articles/BookArticle.vue";
import IndexPage from "@/components/openBook/reader/articles/IndexPage.vue";

const { model } = defineProps<{ model: BookModel }>();

const sections = computed(() => sectionsOf(model).filter((s) => s.kind !== "contents"));
</script>

<template>
  <div>
    <div v-for="section in sections" :key="section.key" :data-section="section.key">
      <AlmanacPage v-if="section.kind === 'almanac'" :model="model" />
      <IndexPage v-else-if="section.kind === 'index'" :model="model" />
      <BookArticle v-else-if="section.entry" :model="model" :entry="section.entry" />
    </div>
  </div>
</template>
