<template>
  <div class="pb-2">
    <VirtualGrid
      :items="items"
      :item-key="itemKey"
      :columns="layout === 'gallery' ? 2 : 1"
      :estimate-row-height="layout === 'gallery' ? GALLERY_ROW_PX : ROWS_ROW_PX"
      :gap="layout === 'gallery' ? 0.75 : 0.5"
    >
      <template #default="slotProps">
        <slot v-bind="slotProps" />
      </template>
    </VirtualGrid>
  </div>
</template>

<script setup lang="ts" generic="T">
/**
 * The phone layout of a catalogue of `EntityMobileCard`s (monsters, NPCs,
 * deities): the DM's rows/gallery preference, windowed so a long list never
 * holds every portrait decoded at once. One place for the card's measured row
 * heights, so a re-measure cannot leave the lists that share the card behind.
 */
import VirtualGrid from "@/components/common/VirtualGrid.vue";

const { items, itemKey, layout } = defineProps<{
  items: T[];
  itemKey: (item: T) => string | number;
  layout: "rows" | "gallery";
}>();

defineSlots<{
  default(props: { item: T; index: number }): unknown;
}>();

// EntityMobileCard's row heights (px), measured at a 390px phone on 8 Oct 2026.
// They decide where a restored scroll lands: coming back from a detail
// re-renders every unmeasured row above the viewport, and an estimate 2px off
// put the DM nine rows away in a 911-monster bestiary.
const ROWS_ROW_PX = 78;
const GALLERY_ROW_PX = 275;
</script>
