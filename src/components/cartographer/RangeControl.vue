<template>
  <label class="text-label text-muted-foreground" :for="id">{{ label }}</label>
  <!-- A bare range input: the app has no slider primitive, and this one carries no chrome of its own beyond the track. -->
  <input
    :id="id"
    type="range"
    :min="min"
    :max="max"
    :step="step"
    :value="value"
    class="h-1.5 w-32 cursor-pointer appearance-none rounded-full bg-border accent-primary"
    @input="(e) => (value = parseFloat((e.target as HTMLInputElement).value))"
  />
  <span class="text-caption text-muted-foreground tabular-nums">{{ readout }}</span>
</template>

<script setup lang="ts">
// A labelled range with a read-out beside it. The one range input of the Cartographer's slips: the brush size, and the
// wall finder's sensitivity and pull-in (#1197).
defineProps<{ id: string; label: string; min: number; max: number; step: number; readout: string }>();
const value = defineModel<number>({ required: true });
</script>
