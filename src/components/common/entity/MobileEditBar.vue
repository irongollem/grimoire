<template>
  <!--
    The sticky app bar of a phone editor: a ghost lead button, the title centred
    and truncated, and whatever trails (a menu, or a spacer that keeps the title
    centred). Phone editors sit inside a takeover that hides the app's own bars,
    so each draws this one. The caller adds placement classes (negative margins,
    `md:hidden`) through `class`.
  -->
  <header
    class="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-background/95 px-2 py-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] backdrop-blur"
  >
    <AppButton
      variant="ghost"
      size="sm"
      :label="leadLabel"
      :icon="leadIcon"
      class="shrink-0"
      @click="emit('lead')"
    />
    <h1 class="min-w-0 flex-1 truncate text-center text-heading-sm font-bold text-foreground">
      {{ title }}
    </h1>
    <slot />
  </header>
</template>

<script setup lang="ts">
import type { Component } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";

defineProps<{
  title: string;
  leadLabel: string;
  leadIcon?: Component;
}>();

const emit = defineEmits<{ lead: [] }>();
</script>
