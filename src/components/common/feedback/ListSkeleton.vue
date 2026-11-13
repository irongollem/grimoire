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
      - tiles   : EntityListRow (every catalogue list's rows layout, factions,
                  pantheons): an emblem tile beside a name and a subtitle line.
                  `rows` is the phone's EntityMobileCard row, not this one.
      - stack   : full-width cards in one column at every width (the player
                  journal's entries, notes, quest log and handouts): a title
                  with a trailing badge over one line of text
      - entries : low art's catalogue cards (#1179): art-free cards in the grid,
                  an eyebrow, a title, a subtitle and a foot, with a tab
                  hanging top-right; `columns` like `grid`
      - ledger  : low art's rows: one sheet of 40 px lines, each a dotted rule
                  with a name and two cells
      - rows-text  : low art's phone row (EntityMobileCard "rows"): three text
                     lines, no tile, about 73 px
      - cards-text : low art's phone grid card, two-up: an eyebrow, a two-line
                     name and a stat line, 88 px, with a small tab shape
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

    <template v-else-if="variant === 'stack'">
      <div
        v-for="i in count"
        :key="i"
        class="flex flex-col gap-2 rounded-lg border border-border bg-card p-4"
      >
        <div class="flex items-start justify-between gap-2">
          <SkeletonBlock class="h-4" :class="pick(TITLE_WIDTHS, i)" />
          <SkeletonBlock class="h-4 w-12 shrink-0" />
        </div>
        <SkeletonBlock class="h-3" :class="pick(TEXT_WIDTHS, i)" />
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

    <template v-else-if="variant === 'entries'">
      <div
        v-for="i in count"
        :key="i"
        class="relative flex h-40 flex-col justify-between rounded-lg border border-border bg-card p-4"
      >
        <SkeletonBlock class="absolute right-3 top-0 h-10 w-7" />
        <div class="flex flex-col gap-2">
          <SkeletonBlock class="h-2.5 w-1/4" />
          <SkeletonBlock class="h-5" :class="pick(TITLE_WIDTHS, i)" />
          <SkeletonBlock class="h-3" :class="pick(SUBTITLE_WIDTHS, i)" />
        </div>
        <SkeletonBlock class="h-3 w-1/2" />
      </div>
    </template>

    <template v-else-if="variant === 'ledger'">
      <div class="overflow-hidden rounded-lg border border-border bg-card">
        <div
          v-for="i in count"
          :key="i"
          class="flex h-10 items-center gap-4 border-b border-dotted border-border px-4 last:border-b-0"
        >
          <SkeletonBlock class="h-3.5" :class="pick(TITLE_WIDTHS, i)" />
          <SkeletonBlock class="hidden h-3 w-24 sm:block" />
          <SkeletonBlock class="hidden h-3 w-16 sm:block" />
        </div>
      </div>
    </template>

    <template v-else-if="variant === 'rows-text'">
      <div
        v-for="i in count"
        :key="i"
        class="flex h-18 flex-col justify-center gap-1.5 rounded-xl border border-border bg-card py-2 pr-9 pl-3.5"
      >
        <SkeletonBlock class="h-4" :class="pick(TITLE_WIDTHS, i)" />
        <SkeletonBlock class="h-3" :class="pick(SUBTITLE_WIDTHS, i)" />
        <SkeletonBlock class="h-3 w-1/4" />
      </div>
    </template>

    <template v-else-if="variant === 'cards-text'">
      <div
        v-for="i in count"
        :key="i"
        class="relative flex h-22 flex-col gap-1.5 rounded-xl border border-border bg-card px-2.5 pt-2 pb-2"
      >
        <SkeletonBlock class="absolute right-2 top-0.5 h-8 w-6.5" />
        <SkeletonBlock class="h-2 w-1/3" />
        <SkeletonBlock class="h-3.5 w-4/5" />
        <SkeletonBlock class="h-3.5" :class="pick(SUBTITLE_WIDTHS, i)" />
        <SkeletonBlock class="mt-auto h-2.5 w-1/2" />
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
import SkeletonBlock from "@/components/common/feedback/SkeletonBlock.vue";

const { variant = "rows", count = 8, columns = 4 } = defineProps<{
  variant?: "rows" | "gallery" | "grid" | "text" | "tiles" | "stack" | "entries" | "ledger" | "rows-text" | "cards-text";
  count?: number;
  /**
   * The column track of a `grid`, `entries`, `text` or `tiles` list, matching the list it
   * stands in for: its widest column count (1 for a list of single-line rows,
   * which is also how `EntityCollection` lays out its rows layout), or "fill" for a list that packs
   * fixed-width cards with `auto-fill` (the item catalogue).
   */
  columns?: 1 | 2 | 3 | 4 | "fill";
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
  1: "grid grid-cols-1 gap-2",
  2: "grid grid-cols-1 gap-3 sm:grid-cols-2",
  3: "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
  fill: "grid gap-3 grid-cols-[repeat(auto-fill,minmax(11.25rem,1fr))]",
} as const;

const containerClass = computed(() => {
  if (variant === "rows" || variant === "stack" || variant === "rows-text") return "flex flex-col gap-2";
  if (variant === "ledger") return "block";
  if (variant === "gallery" || variant === "cards-text") return "grid grid-cols-2 gap-3";
  return GRID_CLASS[columns];
});
</script>
