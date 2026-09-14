<template>
  <MaskIcon :src="src" :label="label ?? type" />
</template>

<script setup lang="ts">
import MaskIcon from "./MaskIcon.vue";
import { artUrl } from "@/lib/assets/artUrl";
import type { DamageType } from "@/types/damage.types";

/**
 * A damage-type glyph. Thin wrapper over MaskIcon that resolves the asset path
 * for a DamageType. Source art lives in public/assets/damage-types/<type>.svg.
 */
const { type, label } = defineProps<{ type: DamageType; label?: string }>();

const src = artUrl(`/assets/damage-types/${type}.svg`);
</script>
