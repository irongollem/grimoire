<script setup lang="ts">
/**
 * A person of the book. A facts table and the pages that name them, and no prose: the book never shows what an
 * NPC looks like, how they act or where they come from.
 */
import { computed } from "vue";
import type { BookModel } from "@/lib/openBook/bookModel";
import type { OpenBookPerson } from "@/types/openBook.types";
import { humanize, standingOf, statusLabel } from "@/lib/openBook/articleData";
import ArticleAttr from "./ArticleAttr.vue";
import ArticleEntryLink from "./ArticleEntryLink.vue";
import ArticlePlate from "./ArticlePlate.vue";
import ArticleRefList from "./ArticleRefList.vue";

const { model, person } = defineProps<{ model: BookModel; person: OpenBookPerson }>();

const standing = computed(() => standingOf(person.relationship));
const status = computed(() => statusLabel(person.status));
const mentions = computed(() => model.backlinks(person.id));
const sessions = computed(() =>
  mentions.value.filter((e) => e.kind === "session").map((e) => ({ id: e.id, note: e.subtitle })),
);
const elsewhere = computed(() => mentions.value.filter((e) => e.kind !== "session").map((e) => ({ id: e.id, note: humanize(e.kind) })));
const hasFacts = computed(
  () => person.occupation || person.race || person.location_id || standing.value || status.value,
);
</script>

<template>
  <article class="book-article book-person">
    <ArticlePlate
      :src="person.portrait_url"
      :alt="`Portrait of ${person.name}`"
      shape="portrait"
    />
    <header>
      <span v-if="person.occupation" class="book-eyebrow">{{ person.occupation }}</span>
      <h1 class="book-title">{{ person.name }}</h1>
      <p v-if="person.former_name" class="book-former">Once known as {{ person.former_name }}</p>
    </header>
    <div v-if="hasFacts" class="book-attrs">
      <ArticleAttr v-if="person.occupation" label="Occupation">{{ person.occupation }}</ArticleAttr>
      <ArticleAttr v-if="person.race" label="Folk">{{ person.race }}</ArticleAttr>
      <ArticleAttr v-if="person.location_id" label="Found at">
        <ArticleEntryLink :model="model" :id="person.location_id" />
      </ArticleAttr>
      <ArticleAttr v-if="standing" label="To the party">
        <span class="book-standing">
          <span class="book-diamond" :style="{ background: `var(${standing.token})` }" aria-hidden="true" />{{ standing.label }}
        </span>
      </ArticleAttr>
      <ArticleAttr v-if="status" label="Status">{{ status }}</ArticleAttr>
    </div>
    <ArticleRefList :model="model" title="In the Chronicle" :items="sessions" />
    <ArticleRefList :model="model" title="Mentioned in" :items="elsewhere" />
  </article>
</template>
