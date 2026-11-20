<template>
  <li
    :id="id"
    class="relative flex min-w-0 border-b border-border px-4 py-3 transition-colors last:border-b-0 hover:bg-accent/40"
    :class="[selected ? 'bg-primary/10 shadow-[inset_2px_0_0_var(--primary)]' : '', layout]"
    :data-selected="selected"
  >
    <!-- A bare button stretched over the row: all the chrome is on the <li>, and the row stays one keyboard stop. -->
    <button
      type="button"
      class="absolute inset-0 z-10 cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      
      :aria-pressed="selected"
      :aria-label="label"
      @click="emit('select')"
    />
    <slot />
  </li>
</template>

<script setup lang="ts">
/**
 * The one row every canon ledger (truths, secrets, forces, lore) is drawn with: the card chrome, the selected mark and
 * the stretched button that selects it. The row's own content goes in the slot. `id` is the anchor the page scrolls to.
 */
const {
  id,
  label,
  selected = false,
  layout = "flex-row items-start gap-3",
} = defineProps<{
  id: string;
  /** The row's accessible name: the entry's words. */
  label: string;
  selected?: boolean;
  /** The flex direction and gap of the content, for a row that stacks on a phone. */
  layout?: string;
}>();
const emit = defineEmits<{ select: [] }>();
</script>
