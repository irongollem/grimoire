<template>
  <AppButton
    variant="swatch"
    :size="large ? 'icon-sm' : 'icon-xs'"
    :active="selected"
    :style="{ backgroundColor: rgbToHex(colour) }"
    :aria-label="label"
    :tooltip="title"
    @click="emit('pick', colour)"
  />
</template>

<script setup lang="ts">
import AppButton from "@/components/common/controls/AppButton.vue";
import type { Rgb } from "../engine/types";
import { rgbToHex } from "./colourMath";

/** One colour swatch: a square of the colour that picks it. `selected` rings the one in use. */
const { colour, label, title, selected = false, large = false } = defineProps<{ colour: Rgb; label: string; title?: string; selected?: boolean; large?: boolean }>();
const emit = defineEmits<{ pick: [colour: Rgb] }>();
</script>
