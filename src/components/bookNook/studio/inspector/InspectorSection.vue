<template>
  <section class="flex flex-col gap-1.5">
    <h3 class="text-label uppercase text-muted-foreground">{{ title }}</h3>
    <slot />
  </section>
</template>

<script setup lang="ts">
/** A titled block of the inspector: the small-caps label, then whatever controls it holds. */
defineProps<{ title: string }>();
</script>
