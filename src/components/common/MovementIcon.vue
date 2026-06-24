<template>
  <MaskIcon :src="src" :label="mode" />
</template>

<script setup lang="ts">
import MaskIcon from "./MaskIcon.vue";
import { MOVEMENT_ICON, type MovementMode } from "@/lib/movement";

/**
 * A movement-mode glyph (fly/swim/climb/burrow/hover). Walk has no icon and
 * should not be rendered through this component.
 */
const { mode } = defineProps<{ mode: Exclude<MovementMode, "walk"> }>();

const src = `${import.meta.env.BASE_URL}assets/movement/${MOVEMENT_ICON[mode]}.svg`;
</script>
