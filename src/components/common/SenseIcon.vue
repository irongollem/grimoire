<template>
  <MaskIcon :src="src" :label="sense" />
</template>

<script setup lang="ts">
import MaskIcon from "./MaskIcon.vue";
import { artUrl } from "@/lib/assets/artUrl";
import type { SenseType } from "@/lib/senses";

/** A sense glyph (blindsight/darkvision/tremorsense/truesight). */
const { sense } = defineProps<{ sense: SenseType }>();

const src = artUrl(`/assets/vision/${sense}.svg`);
</script>
