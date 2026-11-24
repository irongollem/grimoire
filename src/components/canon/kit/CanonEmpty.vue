<template>
  <EmptyState class="rounded-lg border border-dashed border-border bg-card" :title="title" :description="text">
    <template v-if="ask !== undefined" #action>
      <CanonSuggest :request="ask" label="Ask the Familiar" />
    </template>
  </EmptyState>
</template>

<script setup lang="ts">
/** A chapter with nothing in it yet: what an entry here is, and (when the chapter has one) a request for the Familiar. */
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import CanonSuggest from "./CanonSuggest.vue";

const { title, text, ask } = defineProps<{ title: string; text: string; ask?: string }>();
</script>
