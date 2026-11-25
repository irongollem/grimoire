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
      :aria-label="title"
      @click="emit('select')"
    />
    <slot name="lead" />
    <span class="min-w-0 flex-1">
      <span class="block text-body leading-snug text-foreground" :class="strong ? 'font-semibold' : ''">{{ title }}</span>
      <slot />
    </span>
    <!-- A mark is text at the row's right edge; the one thing in it that takes a tap (the move buttons) lifts itself above the stretched button. -->
    <span v-if="$slots.mark || move" class="pointer-events-none relative z-20 flex shrink-0 items-center gap-2" data-testid="row-mark">
      <slot name="mark" />
      <CanonMoveButtons v-if="move" class="pointer-events-auto" :label="title" :first="move.first" :last="move.last" :to-ends="move.toEnds === true" @move="(d) => emit('move', d)" @move-to="(end) => emit('moveTo', end)" />
    </span>
  </li>
</template>

<script setup lang="ts">
/**
 * The one row every canon list (truths, secrets, forces, lore, backstories, habitats) is drawn with: the card chrome, the selected mark,
 * the stretched button that selects it and the title. What sits under the title goes in the slot, a picture before it in `lead`, a mark
 * at the right edge in `mark`, and `move` adds Up and Down after it. `id` is the anchor the page scrolls to.
 */
import CanonMoveButtons from "../CanonMoveButtons.vue";

const {
  id,
  title,
  selected = false,
  layout = "flex-row items-start gap-3",
  strong = false,
  move = null,
} = defineProps<{
  id: string;
  /** The entry's words: the visible title and the row button's accessible name. */
  title: string;
  selected?: boolean;
  /** The flex direction and gap of the content, for a row that stacks on a phone. */
  layout?: string;
  strong?: boolean;
  /** Up and down, offered only while nothing narrows the list; `null` hides them. */
  move?: { first: boolean; last: boolean; toEnds?: boolean } | null;
}>();
const emit = defineEmits<{ select: []; move: [direction: -1 | 1]; moveTo: [end: "top" | "bottom"] }>();
</script>
