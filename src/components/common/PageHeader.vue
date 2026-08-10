<template>
  <!--
    This component takes flex-1
    (when it has body content), dividing itself into:
      • a non-scrolling header section (title, actions, divider, optional header slot)
      • a flex-1 overflow-y-auto body — the real scroll container for page content

    The optional `sidebar` slot renders to the right of the body on desktop.
    On mobile it stacks below the body inside the same scroll container.
  -->
  <div
    :class="[
      'max-w-full min-w-0 overflow-x-hidden',
      $slots.default ? 'flex h-full min-h-0 flex-1 flex-col' : '',
    ]"
  >
    <!-- Header section -->
    <div class="max-w-full min-w-0 bg-background px-4 pt-4 md:px-6 md:pt-6">
      <div
        class="flex min-w-0 max-w-full flex-col gap-2 lg:flex-row lg:items-start lg:justify-between lg:gap-4"
      >
        <div class="min-w-0 max-w-full hidden md:block">
          <h1
            class="wrap-break-word font-cinzel text-2xl md:text-3xl font-bold text-foreground tracking-wide inline-flex items-center gap-2"
          >
            {{ title }}
            <slot name="title-suffix" />
          </h1>
          <p
            v-if="description"
            class="wrap-break-word font-fell text-muted-foreground mt-1 italic"
          >
            {{ description }}
          </p>
        </div>
        <div
          v-if="$slots.actions"
          class="flex w-full min-w-0 flex-wrap items-center gap-2 lg:w-auto lg:shrink-0 lg:justify-end"
        >
          <slot name="actions" />
        </div>
      </div>
      <div class="gold-divider mt-4" />
      <div v-if="$slots['header-extra']" class="py-3">
        <slot name="header-extra" />
      </div>
      <div v-else class="pb-4" />
    </div>

    <!-- Body + optional sidebar (only rendered when default slot has content) -->
    <div
      v-if="$slots.default"
      class="min-h-0 max-w-full min-w-0 flex-1 overflow-x-hidden overflow-y-auto lg:flex lg:overflow-hidden"
    >
      <!-- Scrollable body -->
      <div
        data-testid="page-body"
        :class="[
          'min-w-0 max-w-full px-4 pb-4 md:px-6 md:pb-6 lg:min-h-0 lg:flex-1',
          contained ? 'lg:overflow-hidden' : 'lg:overflow-y-auto',
        ]"
      >
        <slot />
      </div>
      <!-- Optional sidebar — desktop only; stacks below body on mobile -->
      <aside
        v-if="$slots.sidebar"
        class="min-w-0 max-w-full px-4 pb-4 md:px-6 md:pb-6 lg:w-80 lg:shrink-0 lg:overflow-y-auto lg:border-l lg:border-border lg:px-4 lg:py-4"
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
  contained?: boolean;
}>();
</script>
