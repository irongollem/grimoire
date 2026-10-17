<template>
  <PackTileThumb
    v-if="item.kind === 'object'"
    :runtime="runtime"
    :category="item.category"
    :variant="item.variant === 'any' ? 0 : item.variant"
    :side="isStairs(item.category) ? 'N' : undefined"
  />
  <img
    v-else-if="imageUrl"
    :src="imageUrl"
    alt=""
    crossorigin="anonymous"
    loading="lazy"
    class="size-full object-contain"
  />
  <span
    v-else
    class="block rounded-sm border border-border bg-muted-foreground/20"
    :style="footprintBox"
    aria-hidden="true"
  ></span>
</template>

<script setup lang="ts">
// The picture of whatever Place holds: an object's tile, a prop's image, or the footprint
// box of a prop whose art is not painted yet. Shared by the catalogue's recent row and the
// options slip so the two never disagree about how an item looks.
import { computed } from "vue";
import PackTileThumb from "@/components/cartographer/PackTileThumb.vue";
import type { TilePackRuntime } from "@/cartographer/packLoader";
import type { PlaceItem } from "@/cartographer/tools";

const { item, runtime, imageUrl, footprint } = defineProps<{
  item: PlaceItem;
  runtime: TilePackRuntime | null;
  /** A prop's picture; null while it has none. */
  imageUrl: string | null;
  /** A prop's footprint in cells, for the box shown in place of missing art. */
  footprint: { w: number; h: number } | null;
}>();

function isStairs(category: string): boolean {
  return category === "stairsUp" || category === "stairsDown";
}

/** A footprint-shaped box scaled so the longer side fills the tile. */
const footprintBox = computed<Record<string, string>>(() => {
  if (!footprint) return { width: "100%", height: "100%" };
  const longest = Math.max(footprint.w, footprint.h);
  return { width: `${(footprint.w / longest) * 100}%`, height: `${(footprint.h / longest) * 100}%` };
});
</script>
