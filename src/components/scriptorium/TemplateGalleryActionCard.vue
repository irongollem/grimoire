<template>
  <button
    type="button"
    class="group flex flex-col text-left rounded-lg border border-dashed border-border bg-card overflow-hidden hover:border-primary/50 hover:shadow-lg transition-all"
  >
    <div class="relative h-32 flex items-center justify-center overflow-hidden bg-muted/30">
      <component :is="icon" class="size-8 text-muted-foreground group-hover:text-primary transition-colors" />
    </div>
    <div class="flex flex-col gap-1 p-3 border-t border-border">
      <span class="font-cinzel text-sm font-bold text-foreground group-hover:text-primary transition-colors">
        {{ title }}
      </span>
      <span class="text-caption text-muted-foreground leading-snug">{{ blurb }}</span>
    </div>
  </button>
</template>

<script setup lang="ts">
import type { Component } from "vue";

// A dashed "do something else" tile beside the template cards: an icon, a title
// and a one-line blurb. The click falls through to the root button.
defineProps<{ icon: Component; title: string; blurb: string }>();
</script>
