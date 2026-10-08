<template>
  <!--
    Placeholder for a list body while its code or data is on the way. Each
    variant mirrors the real card it stands in for (same radius, border, thumb
    and padding) so the page does not jump when content lands:
      - rows    : EntityMobileCard "rows"
      - gallery : EntityMobileCard "gallery", in its two-column grid
      - grid    : EntityGridCard, in the desktop list grid
      - text    : the thumbnail-less cards (quests, notes, encounters, spells,
                  Scriptorium documents): a colour bar, a title with a
                  trailing badge and two lines of text
      - tiles   : EntityListRow (factions, pantheons): an emblem tile beside
                  a name and a count line
  -->
  <div role="status" :class="containerClass">
    <span class="sr-only">Loading…</span>

    <template v-if="variant === 'rows'">
      <div
        v-for="i in count"
        :key="i"
        class="flex items-center gap-3 rounded-xl border border-border bg-card p-2.5"
      >
        <SkeletonBlock class="size-14 shrink-0 rounded-lg" />
        <div class="flex min-w-0 flex-1 flex-col gap-1.5">
          <SkeletonBlock class="h-4" :class="pick(TITLE_WIDTHS, i)" />
          <SkeletonBlock class="h-3" :class="pick(SUBTITLE_WIDTHS, i)" />
          <SkeletonBlock class="h-4 w-14" />
        </div>
      </div>
    </template>

    <template v-else-if="variant === 'gallery'">
      <div
        v-for="i in count"
        :key="i"
        class="flex flex-col overflow-hidden rounded-xl border border-border bg-card"
      >
        <SkeletonBlock class="aspect-4/5 w-full rounded-none" />
        <div class="flex flex-col gap-1.5 p-3">
          <SkeletonBlock class="h-4" :class="pick(TITLE_WIDTHS, i)" />
          <SkeletonBlock class="h-3" :class="pick(SUBTITLE_WIDTHS, i)" />
        </div>
      </div>
    </template>

    <template v-else-if="variant === 'tiles'">
      <div
        v-for="i in count"
        :key="i"
        class="flex items-center gap-3 rounded-lg border border-border bg-card p-4"
      >
        <SkeletonBlock class="size-12 shrink-0 rounded-lg" />
        <div class="flex min-w-0 flex-1 flex-col gap-1.5">
          <SkeletonBlock class="h-4" :class="pick(TITLE_WIDTHS, i)" />
          <SkeletonBlock class="h-3" :class="pick(SUBTITLE_WIDTHS, i)" />
        </div>
      </div>
    </template>

    <template v-else-if="variant === 'text'">
      <div
        v-for="i in count"
        :key="i"
        class="flex flex-col overflow-hidden rounded-lg border border-border bg-card"
      >
        <SkeletonBlock class="h-1.5 w-full rounded-none" />
        <div class="flex flex-col gap-3 p-4">
          <div class="flex items-start justify-between gap-2">
            <SkeletonBlock class="h-4" :class="pick(TITLE_WIDTHS, i)" />
            <SkeletonBlock class="h-4 w-12 shrink-0" />
          </div>
          <div class="flex flex-col gap-1.5">
            <SkeletonBlock class="h-3 w-full" />
            <SkeletonBlock class="h-3" :class="pick(TEXT_WIDTHS, i)" />
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <div
        v-for="i in count"
        :key="i"
        class="flex flex-col overflow-hidden rounded-lg border border-border bg-card"
      >
        <SkeletonBlock class="h-36 w-full rounded-none" />
        <div class="flex flex-col gap-2 p-3">
          <SkeletonBlock class="h-4" :class="pick(TITLE_WIDTHS, i)" />
          <SkeletonBlock class="h-3" :class="pick(SUBTITLE_WIDTHS, i)" />
          <SkeletonBlock class="h-3 w-1/3" />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import SkeletonBlock from "@/components/common/SkeletonBlock.vue";

const { variant = "rows", count = 8, columns = 4 } = defineProps<{
  variant?: "rows" | "gallery" | "grid" | "text" | "tiles";
  count?: number;
  /**
   * The column track of a `grid`, `text` or `tiles` list, matching the list it
   * stands in for: its widest column count, or "fill" for a list that packs
   * fixed-width cards with `auto-fill` (the item catalogue).
   */
  columns?: 3 | 4 | "fill";
}>();

// Literal class strings, because Tailwind only generates the ones written in
// source. Cycled by index so neighbouring cards differ without any randomness
// (a random width would reshuffle on every render).
const TITLE_WIDTHS = ["w-3/5", "w-2/3", "w-1/2", "w-3/4", "w-2/5"];
const SUBTITLE_WIDTHS = ["w-2/5", "w-1/3", "w-1/2", "w-1/4", "w-3/5"];
const TEXT_WIDTHS = ["w-2/3", "w-1/2", "w-3/4"];

function pick(widths: string[], index: number): string {
  return widths[(index * 2 + 1) % widths.length];
}

const GRID_CLASS = {
  3: "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
  fill: "grid gap-3 grid-cols-[repeat(auto-fill,minmax(11.25rem,1fr))]",
} as const;

const containerClass = computed(() => {
  if (variant === "rows") return "flex flex-col gap-2";
  if (variant === "gallery") return "grid grid-cols-2 gap-3";
  return GRID_CLASS[columns];
});
</script>
