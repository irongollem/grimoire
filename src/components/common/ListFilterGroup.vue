<template>
  <!--
    Segmented pill group — a single-choice filter rendered as a row of
    joined-edge buttons. Used for 2–6 mutually-exclusive options (status,
    type, source, sort, etc.).

    Generic over the value type so T is preserved through v-model bindings.
    `shrink-0` keeps the whole group together as one unit when the filter row
    wraps on mobile. Each segment is ≥44px tall on mobile (max-md:min-h-11) for
    a comfortable tap target; on ≥md the height reverts to py-1.5 as before.

    Wide groups (e.g. the 7-option Relationship filter) overflow a phone. On
    mobile the group scrolls horizontally (`max-md:overflow-x-auto`, segments
    `max-md:shrink-0`) so no option is clipped/unreachable; on ≥md it keeps the
    original `overflow-hidden` joined-edge look unchanged.
  -->
  <div
    class="flex rounded-md border border-border md:overflow-hidden max-md:overflow-x-auto text-xs font-cinzel font-semibold tracking-wider shrink-0 filter-group-scroll"
    :aria-label="ariaLabel"
    role="radiogroup"
  >
    <button
      v-for="opt in options"
      :key="String(opt.value)"
      type="button"
      role="radio"
      :aria-checked="model === opt.value"
      class="max-md:shrink-0 max-md:inline-flex max-md:items-center max-md:justify-center max-md:min-h-11 px-2.5 py-1.5 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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

<style scoped>
/* Hide the horizontal scrollbar on the mobile-scrolling segmented group —
   the scroll behaviour stays active; a scrollbar inside a pill reads as noise. */
.filter-group-scroll {
  scrollbar-width: none;
}
.filter-group-scroll::-webkit-scrollbar {
  display: none;
}
</style>
