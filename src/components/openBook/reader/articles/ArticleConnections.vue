<script setup lang="ts">
/**
 * The ties of one entry (#1084), grouped as on the sheet and read from the page's own side: "worships", then the
 * far page. Each line runs to a dotted leader; the printed book fills the end of it with the far page's number.
 * Nothing renders for an entry with no ties, which includes every entry of a release made before ties existed.
 */
import { computed } from "vue";
import type { BookModel } from "@/lib/openBook/bookModel";
import ArticleEntryLink from "./ArticleEntryLink.vue";

const { model, id } = defineProps<{ model: BookModel; id: string }>();

const groups = computed(() => model.connectionsOf(id));
</script>

<template>
  <section v-if="groups.length > 0" class="book-refs book-conns">
    <span class="book-eyebrow">Connections</span>
    <div v-for="group in groups" :key="group.group" class="book-conn-group">
      <span class="book-eyebrow book-conn-title">{{ group.title }}</span>
      <div v-for="line in group.lines" :key="`${line.word}|${line.entry.id}`" class="book-conn">
        <span class="book-conn-text">
          <span class="book-conn-word">{{ line.word }}</span>
          <ArticleEntryLink :model="model" :id="line.entry.id" />
          <i v-if="line.told" class="book-conn-told">{{ line.told }}</i>
        </span>
        <span class="book-conn-lead" aria-hidden="true" />
      </div>
    </div>
  </section>
</template>
