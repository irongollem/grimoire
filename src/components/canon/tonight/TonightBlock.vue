<template>
  <section class="flex flex-col gap-2 border border-border bg-card p-4" :aria-labelledby="headingId" :data-testid="`tonight-${block}`">
    <h2 :id="headingId" class="m-0 text-heading-sm">{{ title }}</h2>
    <slot />
  </section>
</template>

<script setup lang="ts">
/** One block of Tonight: a titled card. The page leaves a block out when it has nothing, so this never draws an empty one. */
import { computed } from "vue";

const { block, title } = defineProps<{ block: string; title: string }>();
const headingId = computed(() => `tonight-${block}-heading`);
</script>
