<template>
  <HearthSection :title="title">
    <p class="torn hearth-card rounded-lg px-3.5 py-3 text-body italic text-muted-foreground">
      <slot />
    </p>
  </HearthSection>
</template>

<script setup lang="ts">
import HearthSection from "./HearthSection.vue";

/** A section that has nothing to show for this viewer and says why, in one quiet card. */
defineProps<{ title: string }>();
</script>
