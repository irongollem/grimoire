<script setup lang="ts">
/**
 * One entry of the public book as a single flowing article. No page chrome, no fixed height: the reader cuts it
 * into pages with CSS columns, so an article is plain blocks and a plate, row or list item never splits.
 */
import { computed } from "vue";
import type { BookEntryRef, BookModel } from "@/lib/openBook/bookModel";
import { recordFor } from "@/lib/openBook/articleData";
import DeityArticle from "./DeityArticle.vue";
import FactionArticle from "./FactionArticle.vue";
import LoreArticle from "./LoreArticle.vue";
import PantheonArticle from "./PantheonArticle.vue";
import PersonArticle from "./PersonArticle.vue";
import PlaceArticle from "./PlaceArticle.vue";
import SessionArticle from "./SessionArticle.vue";
import "./bookArticles.css";

const { model, entry } = defineProps<{ model: BookModel; entry: BookEntryRef }>();

const found = computed(() => recordFor(model.snapshot, entry));
</script>

<template>
  <PlaceArticle v-if="found?.kind === 'place'" :model="model" :place="found.record" />
  <PersonArticle v-else-if="found?.kind === 'person'" :model="model" :person="found.record" />
  <FactionArticle v-else-if="found?.kind === 'faction'" :model="model" :faction="found.record" />
  <PantheonArticle v-else-if="found?.kind === 'pantheon'" :model="model" :pantheon="found.record" />
  <DeityArticle v-else-if="found?.kind === 'deity'" :model="model" :deity="found.record" />
  <LoreArticle v-else-if="found?.kind === 'lore'" :model="model" :lore="found.record" />
  <SessionArticle v-else-if="found?.kind === 'session'" :model="model" :session="found.record" />
  <article v-else class="book-article">
    <h1 class="book-title">{{ entry.title }}</h1>
  </article>
</template>
