<script setup lang="ts">
/**
 * A name that links to another page of the book when the book holds that page, and is plain small-caps when it
 * does not (the DM may have left it out), so a missing page is never a dead link.
 */
import { computed } from "vue";
import { RouterLink, useRoute } from "vue-router";
import type { BookModel } from "@/lib/openBook/bookModel";

const { model, id, label = null } = defineProps<{ model: BookModel; id: string; label?: string | null }>();

const route = useRoute();
const entry = computed(() => model.byId.get(id) ?? null);
const text = computed(() => label ?? entry.value?.title ?? model.nameFor(id));
const to = computed(() => {
  if (!entry.value) return null;
  const raw = route.params.slug;
  return {
    name: "open-book-entry",
    params: { slug: Array.isArray(raw) ? raw[0] : raw, chapter: entry.value.chapter, entryId: entry.value.id },
  };
});
</script>

<template>
  <RouterLink v-if="to && text" class="book-xref" :to="to">{{ text }}</RouterLink>
  <span v-else-if="text" class="book-name">{{ text }}</span>
</template>
