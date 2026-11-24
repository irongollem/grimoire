<template>
  <!-- One quiet line, not a block: the chapter's add row sits right under it, and a block only pushed that off screen. -->
  <div class="flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="canon-empty">
    <p class="m-0 min-w-0 flex-1 text-caption italic text-muted-foreground"><span class="font-semibold not-italic text-foreground">{{ title }}.</span> {{ text }}</p>
    <CanonSuggest v-if="ask !== undefined" :request="ask" label="Ask the Familiar" />
  </div>
</template>

<script setup lang="ts">
/** A chapter with nothing in it yet: what an entry here is, and (when the chapter has one) a request for the Familiar. */
import CanonSuggest from "./CanonSuggest.vue";

const { title, text, ask } = defineProps<{ title: string; text: string; ask?: string }>();
</script>
