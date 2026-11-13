<template>
  <!--
    The card for an entity with no picture at all: an archetype, an ability, a
    feat. `EntityGridCard` is portrait-led, and without an image it would spend
    9rem of every card on an empty muted band with a stock placeholder in it, so
    a text-first entity gets this instead: an emblem tile beside the name, the
    supporting line, whatever `#body` adds, and the tags along the bottom. An
    entity with controls of its own (a recipe's reveal and delete) puts them in
    `#actions`, beside the name. Same
    box as the portrait card (radius, border, hover) so a grid reads as one
    family, and the same whole-card link behind the content.
  -->
  <div
    class="group relative flex h-full flex-col gap-2 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50"
  >
    <RouterLink :to="to" class="absolute inset-0 z-2" />

    <div class="flex items-start gap-3">
      <div
        class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted"
      >
        <component :is="fallbackIcon" class="h-5 w-5 text-muted-foreground/60" />
      </div>
      <div class="min-w-0 flex-1">
        <p class="truncate text-heading-xs font-bold text-foreground">{{ title }}</p>
        <p v-if="subtitle" class="truncate text-label text-muted-foreground">{{ subtitle }}</p>
      </div>
      <!-- Controls beside the name (reveal, delete); z-10 lifts them over the card link. -->
      <div v-if="$slots.actions" class="relative z-10 flex shrink-0 items-center gap-1">
        <slot name="actions" />
      </div>
    </div>

    <slot name="body" />

    <TagChips :tags="tags" :max="maxTags" class="mt-auto pt-1" />
  </div>
</template>

<script setup lang="ts">
import TagChips from "@/components/common/TagChips.vue";
import type { Component } from "vue";
import { RouterLink } from "vue-router";

const { subtitle = null, tags = [], maxTags = 4 } = defineProps<{
  to: string;
  title: string;
  subtitle?: string | null;
  /** The emblem; there is no image to show. */
  fallbackIcon: Component;
  tags?: readonly string[];
  maxTags?: number;
}>();
</script>
