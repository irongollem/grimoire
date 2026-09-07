<template>
  <div class="flex flex-col gap-1.5 rounded-md border border-border bg-card px-3 py-2">
    <div class="flex items-center gap-2">
      <slot name="badge" />
      <RouterLink
        :to="to"
        class="min-w-0 flex-1 truncate font-cinzel text-xs font-semibold text-foreground transition-colors hover:text-primary"
      >{{ name }}</RouterLink>
      <slot name="actions" />
    </div>
    <slot />
  </div>
</template>

<script setup lang="ts">
/**
 * One row in a location's "what is here" list: a card, a badge, a link to the
 * thing, whatever controls that list needs, and a body underneath.
 *
 * `EntityPlacements`, `LocationPlacements` and `LocationDoors` each grew their
 * own copy of this card — identical wrapper, identical link recipe — because
 * each was written as "the reverse of" the one before it and said so in its own
 * docstring. Three deliberate echoes is the case the granularity rule names, so
 * the chrome lives here and the three keep only what actually differs: the
 * badge, the actions, and what hangs below the title.
 *
 * Deliberately *not* also owning the note field or the remove button. Doors
 * carries two inputs and three toggles where the placements carry one and one,
 * so a row that tried to own the body would need a prop per variation — the
 * shape this component exists to avoid. Slots keep the difference at the call
 * site where it is readable.
 */
import { RouterLink } from "vue-router";
import type { RouteLocationRaw } from "vue-router";

defineProps<{
  /** Where the title links — the placed entity, or the room on the far side. */
  to: RouteLocationRaw;
  /** The title itself. Callers resolve their own "???" for a missing name. */
  name: string;
}>();
</script>
