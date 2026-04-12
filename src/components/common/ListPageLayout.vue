<template>
  <!--
    Generic shell for list-style pages (NPCs, Monsters, Items, Notes, etc.).
    Every list view in Grimoire follows the same skeleton:

      ┌───────────────────────────────────────────┐
      │ Title          [action] [action] [Primary]│  ← sticky
      │ Description                                │
      │ ─────────── gold divider ──────────────── │
      │ [search] [filter] [filter] [Clear]        │  ← sticky (if present)
      ├───────────────────────────────────────────┤
      │ list body                                  │
      │ …                                          │
      └───────────────────────────────────────────┘

    This component owns:
      - Sticky header positioning
      - Title / description layout (mobile-first: smaller type, smaller padding)
      - Action-row overflow handling (horizontal scroll on narrow screens so
        DMs on phones don't lose buttons off the viewport)
      - DiceRoller auto-mount in the action row (every list page had this)

    What callers still own:
      - The actual buttons (use ListActionButton)
      - The filter controls (free-form; wrap your own markup)
      - The list rendering

    Slots:
      - `actions`  — right-aligned on ≥md, wraps into a scrollable row on mobile
      - `filters`  — below the divider (sticky). Free-form; caller supplies
                     their own flex wrapper
      - default    — list body
      - `footer`   — optional; rendered below the body (e.g. "N of M" counts)
  -->
  <div>
    <!-- Sticky header region -->
    <div class="sticky top-0 z-20 bg-background px-4 pt-3 md:px-6 md:pt-6">
      <!-- Title + actions row -->
      <div class="flex items-start justify-between gap-3 md:gap-4">
        <div class="min-w-0 flex-1">
          <h1
            class="font-cinzel text-xl md:text-3xl font-bold text-foreground tracking-wide truncate"
          >
            {{ title }}
          </h1>
          <p
            v-if="description"
            class="font-fell text-muted-foreground mt-0.5 md:mt-1 italic text-sm md:text-base line-clamp-2"
          >
            {{ description }}
          </p>
        </div>

        <!--
          Actions wrapper:
          - On mobile: capped width + overflow-x-auto so long action rows stay
            reachable via horizontal scroll instead of pushing off the viewport.
          - On ≥md: natural width, no scroll.
          - Negative-margin/padding trick so the scroll area extends to the
            viewport edge on mobile rather than being clipped by the
            surrounding px-4.
        -->
        <div
          v-if="hasActions || showDiceRoller"
          class="flex items-center gap-2 shrink-0 -mr-4 pr-4 md:mr-0 md:pr-0 max-w-[70%] md:max-w-none overflow-x-auto md:overflow-visible list-actions-row"
        >
          <slot name="actions" />
          <DiceRoller v-if="showDiceRoller" />
        </div>
      </div>

      <div class="gold-divider mt-3 md:mt-4" />

      <!-- Filters row (caller provides layout) -->
      <div
        v-if="hasFilters"
        class="py-3 -mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto md:overflow-visible list-filters-row"
      >
        <slot name="filters" />
      </div>
      <div v-else class="pb-3 md:pb-4" />
    </div>

    <!-- Body -->
    <div class="px-4 pb-4 md:px-6 md:pb-6">
      <slot />
    </div>

    <!-- Optional footer (e.g. item counts, pagination) -->
    <div v-if="hasFooter" class="px-4 pb-4 md:px-6 md:pb-6">
      <slot name="footer" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, useSlots } from "vue";
import DiceRoller from "@/components/common/DiceRoller.vue";

const props = withDefaults(
  defineProps<{
    title: string;
    description?: string;
    /**
     * Whether to auto-mount the DiceRoller in the actions row. Every list
     * page in Grimoire had it; disable for non-campaign pages.
     */
    showDiceRoller?: boolean;
  }>(),
  {
    showDiceRoller: true,
  },
);

const slots = useSlots();
const hasActions = computed(() => !!slots.actions);
const hasFilters = computed(() => !!slots.filters);
const hasFooter = computed(() => !!slots.footer);

// Surface `title`/`description` for devtools discoverability.
void props;
</script>

<style scoped>
/*
 * Hide the horizontal scrollbar on the mobile action/filter rows — the
 * behaviour (scroll on overflow) is still active, but a visible scrollbar in
 * a header strip reads as chrome noise.
 */
.list-actions-row,
.list-filters-row {
  scrollbar-width: none;
}
.list-actions-row::-webkit-scrollbar,
.list-filters-row::-webkit-scrollbar {
  display: none;
}
</style>
