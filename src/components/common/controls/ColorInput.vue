<template>
  <label v-if="shape === 'field'" class="inline-flex items-center gap-1.5">
    <span v-if="label" class="text-label text-muted-foreground">{{ label }}</span>
    <input
      v-model="model"
      type="color"
      :aria-label="ariaLabel"
      :disabled="disabled"
      class="h-7 w-10 cursor-pointer rounded-md border border-border bg-card p-0.5 disabled:cursor-not-allowed disabled:opacity-50"
    />
  </label>
  <!-- Round shapes: the swatch is the face, the native input sits invisibly over it to take the click. -->
  <span
    v-else
    :title="title"
    :class="[
      'relative inline-block shrink-0 overflow-hidden rounded-full border',
      shape === 'dot' ? 'size-4 border-border/50' : 'size-7 border-2 border-border transition-transform hover:scale-110',
    ]"
    :style="{ background: shape === 'wheel' ? WHEEL : model }"
  >
    <input
      v-model="model"
      type="color"
      :aria-label="ariaLabel"
      :disabled="disabled"
      class="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-default"
    />
  </span>
</template>

<script setup lang="ts">
/**
 * A colour swatch that opens the browser's picker. The model is "#rrggbb", which is what a native
 * colour input yields and accepts, so nothing is converted on the way through. Give it a `label`
 * (shown beside the swatch) or an `ariaLabel` when the surrounding text already names it.
 *
 * `shape` is how it looks: "field" is the framed swatch; "dot" is a small round chip of the colour
 * itself (a faction's colour in a row); "wheel" is a colour-wheel button for "pick any colour" next
 * to a row of presets, where the chosen colour is shown elsewhere.
 */
const model = defineModel<string>({ required: true });

const {
  label,
  ariaLabel,
  title,
  shape = "field",
  disabled = false,
} = defineProps<{
  label?: string;
  ariaLabel?: string;
  /** Hover text for the round shapes. */
  title?: string;
  shape?: "field" | "dot" | "wheel";
  disabled?: boolean;
}>();

const WHEEL = "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)";
</script>
