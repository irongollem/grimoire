<template>
  <!--
    Segmented pill group — a single-choice filter rendered as a row of
    joined-edge buttons. Used for 2–6 mutually-exclusive options (status,
    type, source, sort, etc.).

    Generic over the value type so T is preserved through v-model bindings.
    `shrink-0` keeps the whole group together in horizontally-scrollable
    filter rows on mobile.
  -->
  <div
    class="flex rounded-md border border-border overflow-hidden text-xs font-cinzel font-semibold tracking-wider shrink-0"
    :aria-label="ariaLabel"
    role="radiogroup"
  >
    <button
      v-for="opt in options"
      :key="String(opt.value)"
      type="button"
      role="radio"
      :aria-checked="model === opt.value"
      class="px-2.5 py-1.5 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      :class="
        model === opt.value
          ? 'bg-primary text-primary-foreground'
          : 'bg-card text-muted-foreground hover:text-foreground'
      "
      @click="model = opt.value"
    >
      {{ opt.label }}
    </button>
  </div>
</template>

<script setup lang="ts" generic="T extends string | number">
const model = defineModel<T>({ required: true });
defineProps<{
  options: ReadonlyArray<{ value: T; label: string }>;
  /** Optional accessibility label for the radio group (e.g. "Status filter"). */
  ariaLabel?: string;
}>();
</script>
