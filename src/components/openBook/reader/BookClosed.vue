<script setup lang="ts">
/**
 * The two quiet pages (#1085): a book that is closed, or was never opened (no such slug, or the DM has shut it), and
 * a page that is not in an open book (a chapter or entry the release does not hold). Neither explains which: a
 * visitor cannot be told whether a closed book ever existed.
 */
import AppButton from "@/components/common/controls/AppButton.vue";

const { kind, slug = null } = defineProps<{ kind: "closed" | "page"; slug?: string | null }>();
</script>

<template>
  <div class="ob-quiet">
    <div class="ob-quiet-book ob-leather" style="--ob-hide: #4a1411" aria-hidden="true" />
    <template v-if="kind === 'closed'">
      <h1>This book is closed</h1>
      <p>This book is closed, or was never opened.</p>
    </template>
    <template v-else>
      <h1>This page is not in the book</h1>
      <p>The leaf you were looking for was never bound in, or has been taken out since.</p>
      <div v-if="slug" class="ob-deskbar-group">
        <AppButton variant="outline" size="sm" :to="{ name: 'open-book-contents', params: { slug } }" label="Contents" />
        <AppButton variant="outline" size="sm" :to="{ name: 'open-book', params: { slug } }" label="Cover" />
      </div>
    </template>
  </div>
</template>
