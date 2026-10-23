<template>
  <section class="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-4">
    <span
      class="flex size-9 items-center justify-center border border-primary text-heading-sm font-bold text-primary"
      aria-hidden="true"
    >
      {{ n }}
    </span>
    <div class="flex min-w-0 flex-col gap-3">
      <div class="flex max-w-xl items-baseline justify-between gap-3">
        <h3 class="text-label-lg font-semibold uppercase text-muted-foreground">{{ label }}</h3>
        <slot name="aside" />
      </div>
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{ n: number; label: string }>();
</script>
