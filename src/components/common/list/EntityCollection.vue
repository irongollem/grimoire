<template>
  <!-- Low art, rows with a ledger spec: one sheet, column heads, then the lines. -->
  <div v-if="ledgerOn" class="overflow-hidden rounded-lg border border-border bg-card">
    <div
      class="hidden items-center gap-x-3 border-b border-border px-4 py-2 text-eyebrow text-muted-foreground lg:grid"
      :style="{ gridTemplateColumns: template ?? undefined }"
      data-ledger-head
    >
      <span>Name</span>
      <span v-for="col in ledger" :key="col.label">{{ col.label }}</span>
      <span aria-hidden="true" />
    </div>
    <VirtualGrid :items="items" :item-key="itemKey" :columns="1" :estimate-row-height="LEDGER_LINE_PX" :gap="0">
      <template #default="{ item, index }">
        <slot name="row" :item="item" :index="index" />
      </template>
    </VirtualGrid>
  </div>
  <div v-else ref="containerRef">
    <VirtualGrid
      :items="items"
      :item-key="itemKey"
      :columns="columns"
      :estimate-row-height="estimate"
      :gap="layout === 'grid' ? 0.75 : 0.5"
    >
      <template #default="{ item, index }">
        <slot v-if="layout === 'grid'" name="card" :item="item" :index="index" />
        <slot v-else name="row" :item="item" :index="index" />
      </template>
    </VirtualGrid>
  </div>
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
 *
 * Low art (#1179) changes the metrics, never the slots, and only for a list
 * that passes `ledger`: that prop is the list's opt-in to low art as a whole,
 * so a list whose cards are their pictures (Minis, Book Nook) behaves exactly
 * as always. Rows with a `ledger`
 * spec become one sheet with column heads and 41 px lines (40 plus the rule),
 * the template provided to every `EntityListRow` so its cells line up with the
 * heads; a list without a spec (notes, sessions) keeps its rows. Grids with a
 * spec ignore
 * `gridColumns` and `gridRowEstimate` and pack art-free catalogue cards at a
 * 14.5rem minimum.
 */
import { computed, provide, ref } from "vue";
import VirtualGrid from "@/components/common/list/VirtualGrid.vue";
import { ART_FREE_CARD_PX, LEDGER_TEMPLATE_KEY, ledgerTemplate, type LedgerColumn } from "@/components/common/list/ledger";
import { useAutoFillColumns } from "@/composables/useGridColumns";
import type { ListLayout } from "@/composables/useListLayout";
import { useLowArt } from "@/composables/useLowArt";

const {
  items,
  itemKey,
  layout,
  gridColumns,
  gridRowEstimate,
  rowEstimate = 98,
  rowColumns = 1,
  ledger,
  artFreeRowEstimate = ART_FREE_CARD_PX,
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
  /** Low art's columns after the name; without it rows stay rows (#1179). */
  ledger?: readonly LedgerColumn[];
  /** The art-free card's row height in px before it is measured, when the list's cards
   *  carry more than the usual eyebrow, name, one line and foot (an NPC's place and tags). */
  artFreeRowEstimate?: number;
}>();

defineSlots<{
  card(props: { item: T; index: number }): unknown;
  row(props: { item: T; index: number }): unknown;
}>();

const { lowArt } = useLowArt();

/** One ledger line: 40 px plus its dotted rule. */
const LEDGER_LINE_PX = 41;

const ledgerOn = computed(() => lowArt.value && layout === "rows" && !!ledger);
const template = computed(() => (ledgerOn.value && ledger ? ledgerTemplate(ledger) : null));
provide(LEDGER_TEMPLATE_KEY, template);

// Hooks run whatever the layout; the ref only matters for the low-art grid.
const containerRef = ref<HTMLElement | null>(null);
const fillColumns = useAutoFillColumns(containerRef, 14.5, 0.75);

// The ledger prop is the list's opt-in to low art as a whole: Minis and Book Nook
// cards are their pictures, so without it nothing here reflows.
const lowArtGrid = computed(() => lowArt.value && !!ledger && layout === "grid");
const columns = computed(() => {
  if (layout !== "grid") return rowColumns;
  return lowArtGrid.value ? fillColumns.value : gridColumns;
});
const estimate = computed(() => {
  if (layout !== "grid") return rowEstimate;
  return lowArtGrid.value ? artFreeRowEstimate : gridRowEstimate;
});
</script>
