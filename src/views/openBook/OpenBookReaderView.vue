<script setup lang="ts">
/**
 * /w/<slug>/contents, /index, /<chapter> and /<chapter>/<entry>: the open book (#1085). One component for all four
 * routes, so turning from a chapter to the next page keeps the book mounted instead of rebuilding it.
 */
import { computed } from "vue";
import { useRoute } from "vue-router";
import BannerLoader from "@/components/brand/BannerLoader.vue";
import BookClosed from "@/components/openBook/reader/BookClosed.vue";
import BookPreviewBanner from "@/components/openBook/reader/BookPreviewBanner.vue";
import BookReader from "@/components/openBook/reader/BookReader.vue";
import "@/components/openBook/reader/book.css";
import { usePublicOpenBook } from "@/composables/openBook/usePublicOpenBook";
import { previewFor } from "@/lib/openBook/preview";

const route = useRoute();
const slug = computed(() => {
  const raw = route.params.slug;
  return Array.isArray(raw) ? (raw[0] ?? "") : raw;
});
const query = usePublicOpenBook(slug);
const previewing = computed(() => previewFor(slug.value) !== null);
const found = computed(() => (query.data.value?.status === "found" ? query.data.value.book : null));
</script>

<template>
  <template v-if="found">
    <BookPreviewBanner v-if="previewing" />
    <BookReader :book="found" />
  </template>
  <div v-else class="ob-root">
    <div v-if="query.isPending.value" class="ob-quiet" role="status">
      <BannerLoader class="h-12" />
    </div>
    <BookClosed v-else kind="closed" />
  </div>
</template>
