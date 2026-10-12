<template>
  <VirtualGrid
    :items="items"
    :item-key="itemKey"
    :columns="layout === 'grid' ? gridColumns : rowColumns"
    :estimate-row-height="layout === 'grid' ? gridRowEstimate : rowEstimate"
    :gap="layout === 'grid' ? 0.75 : 0.5"
  >
    <template #default="{ item, index }">
      <slot v-if="layout === 'grid'" name="card" :item="item" :index="index" />
      <slot v-else name="row" :item="item" :index="index" />
    </template>
  </VirtualGrid>
</template>

<script setup lang="ts" generic="T">
/**
 * The one place a catalogue list renders its items in either layout: a grid of
 * cards, or one `EntityListRow` per line. The list passes both shapes as slots
 * and the toggle (`ListLayoutToggle` + `useListLayout`) picks between them, so
 * every list switches the same way.
 *
 *   <EntityCollection
 *     :items="rows" :item-key="(r) => r.id"
 *     :layout="layout"
 *     :grid-columns="columns" :grid-row-estimate="GRID_ROW_PX"
 *   >
 *     <template #card="{ item }"><XGridCard :x="item" /></template>
 *     <template #row="{ item }"><EntityListRow ... /></template>
 *   </EntityCollection>
 *
 * Both layouts are windowed (VirtualGrid), so a long list never mounts every
 * item. Wrap each slot's content in `BulkSelectableCard` yourself when the list
 * has bulk select, once per slot.
 *
 * Gaps are fixed: 0.5rem between rows, 0.75rem (`gap-3`) between cards, the
 * values the lists already used. `rowColumns` stays 1 unless a list wants rows
 * side by side on wide screens.
 *
 * `rowEstimate` is px before a row is measured. 98 is EntityListRow with a
 * subtitle and a tag line: p-4 (32) + border (2) + the text column of title 20,
 * subtitle 18 (mt-0.5 + 16) and tags 26 (mt-1.5 + 20) = 64. A row with neither
 * is 82 (the h-12 emblem decides). The estimate only steers the scrollbar and
 * scroll restoration until rows are measured.
 *
 * Phones keep `EntityMobileGrid`, which has its own measured card heights.
 */
import VirtualGrid from "@/components/common/list/VirtualGrid.vue";
import type { ListLayout } from "@/composables/useListLayout";

const {
  items,
  itemKey,
  layout,
  gridColumns,
  gridRowEstimate,
  rowEstimate = 98,
  rowColumns = 1,
} = defineProps<{
  items: T[];
  itemKey: (item: T) => string | number;
  layout: ListLayout;
  /** Cards per row in the grid layout; pass `useBreakpointColumns` / `useAutoFillColumns`. */
  gridColumns: number;
  /** Grid card row height in px before it is measured. */
  gridRowEstimate: number;
  /** `EntityListRow` height in px before it is measured. */
  rowEstimate?: number;
  /** Items per line in the rows layout. */
  rowColumns?: number;
}>();

defineSlots<{
  card(props: { item: T; index: number }): unknown;
  row(props: { item: T; index: number }): unknown;
}>();
</script>
