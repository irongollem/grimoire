<template>
  <!-- A raw button on purpose: the colour is the whole content, so none of AppButton's chrome applies. -->
  <button
    type="button"
    class="h-6 w-6 rounded-md border border-border"
    :class="selected ? 'ring-2 ring-primary ring-offset-1 ring-offset-card' : ''"
    :style="{ backgroundColor: rgbToHex(colour) }"
    :aria-label="label"
    :title="title"
    @click="emit('pick', colour)"
  />
</template>

<script setup lang="ts">
import type { Rgb } from "../engine/types";
import { rgbToHex } from "./colourMath";

/** One colour swatch: a square of the colour that picks it. `selected` rings the one in use. */
const { colour, label, title, selected = false } = defineProps<{ colour: Rgb; label: string; title?: string; selected?: boolean }>();
const emit = defineEmits<{ pick: [colour: Rgb] }>();
</script>
