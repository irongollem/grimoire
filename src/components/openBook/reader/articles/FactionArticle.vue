<script setup lang="ts">
/** A faction or house: its emblem, its facts, and the description. */
import { computed } from "vue";
import type { BookModel } from "@/lib/openBook/bookModel";
import type { OpenBookFaction } from "@/types/openBook.types";
import { humanize } from "@/lib/openBook/articleData";
import BookRichText from "../BookRichText.vue";
import ArticleAttr from "./ArticleAttr.vue";
import ArticlePlate from "./ArticlePlate.vue";

const { model, faction } = defineProps<{ model: BookModel; faction: OpenBookFaction }>();

const kind = computed(() => (faction.faction_type ? humanize(faction.faction_type) : null));
// A standing nobody has set (null, or the app's own "unknown") says nothing, so the row is left out.
const standing = computed(() =>
  faction.party_standing && faction.party_standing !== "unknown" ? humanize(faction.party_standing) : null,
);
const hasFacts = computed(() => kind.value || faction.alignment || faction.descent || standing.value);
</script>

<template>
  <article class="book-article book-faction">
    <ArticlePlate class="book-plate-centered" :src="faction.emblem_url" :alt="`Arms of ${faction.name}`" shape="square" />
    <header>
      <span v-if="kind" class="book-eyebrow">{{ kind }}</span>
      <h1 class="book-title">{{ faction.name }}</h1>
    </header>
    <div v-if="hasFacts" class="book-attrs">
      <ArticleAttr v-if="kind" label="Kind">{{ kind }}</ArticleAttr>
      <ArticleAttr v-if="faction.alignment" label="Alignment">{{ faction.alignment }}</ArticleAttr>
      <ArticleAttr v-if="faction.descent" label="Descent">{{ faction.descent }}</ArticleAttr>
      <ArticleAttr v-if="standing" label="To the party">{{ standing }}</ArticleAttr>
    </div>
    <div v-if="faction.description" class="book-prose book-dropcap">
      <BookRichText :content="faction.description" :model="model" />
    </div>
  </article>
</template>
