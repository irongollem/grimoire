<template>
  <MaskIcon :src="src" :label="sense" />
</template>

<script setup lang="ts">
import MaskIcon from "./MaskIcon.vue";
import type { SenseType } from "@/lib/senses";

/** A sense glyph (blindsight/darkvision/tremorsense/truesight). */
const { sense } = defineProps<{ sense: SenseType }>();

const src = `${import.meta.env.BASE_URL}assets/vision/${sense}.svg`;
</script>
