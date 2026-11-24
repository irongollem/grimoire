<template>
  <section class="flex flex-col gap-3 rounded-lg border border-border bg-card p-4" :aria-label="title">
    <div class="flex items-center gap-2">
      <h3 class="m-0 min-w-0 flex-1 text-body font-bold">{{ title }}</h3>
      <CanonSuggest v-if="suggest !== undefined" :request="suggest" />
    </div>
    <slot />
  </section>
</template>

<script setup lang="ts">
/**
 * A chapter's own block inside an open entry (who knows it, the clues, the steps): a card with a heading and, when the
 * chapter has a written request for the Familiar, a Suggest at the head's right edge.
 */
import CanonSuggest from "./CanonSuggest.vue";

const { title, suggest } = defineProps<{ title: string; suggest?: string }>();
</script>
