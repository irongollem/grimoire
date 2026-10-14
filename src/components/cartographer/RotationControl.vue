<template>
  <div class="flex flex-wrap items-center gap-1">
    <span class="text-eyebrow text-muted-foreground w-full">Rotate</span>
    <AppButton
      variant="chip"
      size="xs"
      label="–1°"
      tooltip="–1° ([)"
      @click="turn(359)"
    />
    <AppButton
      variant="chip"
      size="xs"
      label="↺ Q"
      tooltip="Rotate CCW 90° (Q)"
      @click="turn(270)"
    />
    <span class="text-caption text-foreground w-9 text-center" data-testid="rotation-readout">{{ modelValue }}°</span>
    <AppButton
      variant="chip"
      size="xs"
      label="↻ E"
      tooltip="Rotate CW 90° (E)"
      @click="turn(90)"
    />
    <AppButton
      variant="chip"
      size="xs"
      label="+1°"
      tooltip="+1° (])"
      @click="turn(1)"
    />
  </div>
</template>

<script setup lang="ts">
// The rotate row the Object stamp and the Dressing tool share: -1 degree,
// quarter turn left, readout, quarter turn right, +1 degree. The same four
// steps the Q / E / [ / ] keys take (src/cartographer/keymap.ts).
import AppButton from "@/components/common/controls/AppButton.vue";

const { modelValue } = defineProps<{ modelValue: number }>();
const emit = defineEmits<{ "update:modelValue": [degrees: number] }>();

/** `delta` is added mod 360, so a turn left is 270 and -1 degree is 359. */
function turn(delta: number): void {
  emit("update:modelValue", (modelValue + delta) % 360);
}
</script>
