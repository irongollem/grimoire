<template>
  <span class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted" aria-hidden="true">
    <img :src="spriteSrc(sprite.sprite)" alt="" draggable="false" class="h-9 w-9 object-contain" :style="{ filter }" />
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { spriteSrc } from "@/lib/crafting/workbench/art";
import type { ResolvedSprite } from "@/lib/crafting/workbench/materialSprite";

/**
 * A material's picture as a list thumbnail. `faded` is a failed attempt's loss, `charred` a critical
 * failure's, `plain` is as painted. The thumbnail char is lighter than the bench's: a loss list has to
 * show what was lost, and the bench's full char turned every material into the same black blob here.
 */
const { sprite, look } = defineProps<{ sprite: ResolvedSprite; look: "plain" | "faded" | "charred" }>();

const LOOK = {
  plain: "",
  faded: "grayscale(1) brightness(0.6)",
  charred: "sepia(0.7) saturate(1.3) brightness(0.62) contrast(1.15)",
} as const;

const filter = computed(() => [sprite.filter, LOOK[look]].filter((f) => f).join(" ") || undefined);
</script>
