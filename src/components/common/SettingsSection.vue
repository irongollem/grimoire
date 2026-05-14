<template>
  <section class="rounded-lg border border-border bg-card overflow-hidden">
    <header v-if="title || description || $slots.header" class="px-4 py-3 border-b border-border">
      <slot name="header">
        <h3 class="font-cinzel text-sm font-bold text-foreground tracking-wide">{{ title }}</h3>
        <p v-if="description" class="font-fell text-xs text-muted-foreground italic mt-0.5">{{ description }}</p>
      </slot>
    </header>
    <div class="p-4">
      <slot />
    </div>
    <footer v-if="$slots.footer" class="px-4 py-3 border-t border-border bg-muted/30">
      <slot name="footer" />
    </footer>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  title?: string;
  description?: string;
}>();
</script>
