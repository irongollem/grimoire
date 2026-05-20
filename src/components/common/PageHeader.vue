<template>
  <!--
    On mobile: sits inside <main overflow-y-auto>; the sticky header sticks to
    the top of <main> as the user scrolls.

    On desktop: <main> is overflow-hidden flex-col. This component takes flex-1
    (when it has body content), dividing itself into:
      • a non-scrolling header section (title, actions, divider, optional sticky slot)
      • a flex-1 overflow-y-auto body — the real scroll container for page content

    The optional `sidebar` slot (desktop only) renders to the right of the body
    in its own overflow-y-auto column. On mobile it stacks below the body.
  -->
  <div :class="['lg:flex lg:flex-col lg:min-h-0', $slots.default ? 'lg:flex-1' : '']">
    <!-- Header section — sticky on mobile, static on desktop -->
    <div class="sticky top-0 z-20 bg-background px-4 pt-4 md:px-6 md:pt-6">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div class="min-w-0">
          <h1 class="font-cinzel text-2xl md:text-3xl font-bold text-foreground tracking-wide">
            {{ title }}
          </h1>
          <p v-if="description" class="font-fell text-muted-foreground mt-1 italic">
            {{ description }}
          </p>
        </div>
        <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2 sm:shrink-0">
          <slot name="actions" />
        </div>
      </div>
      <div class="gold-divider mt-4" />
      <div v-if="$slots['sticky']" class="py-3">
        <slot name="sticky" />
      </div>
      <div v-else class="pb-4" />
    </div>

    <!-- Body + optional sidebar (only rendered when default slot has content) -->
    <div v-if="$slots.default" class="lg:flex lg:flex-1 lg:overflow-hidden lg:min-h-0">
      <!-- Scrollable body -->
      <div class="px-4 pb-4 md:px-6 md:pb-6 lg:flex-1 lg:overflow-y-auto lg:min-h-0">
        <slot />
      </div>
      <!-- Optional sidebar — desktop only; stacks below body on mobile -->
      <aside
        v-if="$slots.sidebar"
        class="px-4 pb-4 md:px-6 md:pb-6 lg:w-80 lg:shrink-0 lg:overflow-y-auto lg:border-l lg:border-border lg:px-4 lg:py-4"
      >
        <slot name="sidebar" />
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  description?: string;
}>();
</script>
