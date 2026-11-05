<template>
  <div class="flex items-center gap-3">
    <div
      ref="track"
      class="relative h-6 min-w-0 flex-1 cursor-pointer touch-none rounded-sm border border-border bg-muted/60"
      role="slider"
      tabindex="0"
      aria-label="Playhead"
      :aria-valuemin="0"
      :aria-valuemax="loop"
      :aria-valuenow="Math.round(t * 10) / 10"
      :aria-valuetext="`${t.toFixed(1)} seconds into a ${loop} second loop`"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
      @keydown.left.prevent="emit('seek', t - 1)"
      @keydown.right.prevent="emit('seek', t + 1)"
    >
      <div class="absolute inset-y-0 left-0 rounded-l-sm bg-primary/20" :style="{ width: `${share * 100}%` }" />
      <div class="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-primary" :style="{ left: `${share * 100}%` }" />
    </div>
    <span class="shrink-0 text-label uppercase text-muted-foreground">One loop</span>
    <AppSelect :model-value="loop" size="sm" aria-label="Loop length" @update:model-value="(v) => emit('update:loop', Number(v))">
      <option v-for="seconds in LOOP_CHOICES" :key="seconds" :value="seconds">{{ seconds }} s</option>
    </AppSelect>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import { LOOP_CHOICES } from "@/lib/bookNook/edit";

/**
 * "One loop · 12 s": a track with the playhead moving through the loop. Press or drag on it to scrub, arrow
 * keys step a second. Scrubbing holds the clock still (`scrub`) until the pointer lets go.
 */
const { t, loop } = defineProps<{ t: number; loop: number }>();
const emit = defineEmits<{ seek: [seconds: number]; "update:loop": [seconds: number]; scrub: [held: boolean] }>();

const track = ref<HTMLElement | null>(null);
const share = computed(() => (loop > 0 ? Math.min(1, Math.max(0, t / loop)) : 0));
let scrubbing = false;

function seekTo(event: PointerEvent) {
  const box = track.value?.getBoundingClientRect();
  if (!box || box.width === 0) return;
  emit("seek", Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)) * loop);
}
function onDown(event: PointerEvent) {
  scrubbing = true;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  emit("scrub", true);
  seekTo(event);
}
function onMove(event: PointerEvent) {
  if (scrubbing) seekTo(event);
}
function onUp(event: PointerEvent) {
  if (!scrubbing) return;
  scrubbing = false;
  const el = event.currentTarget as HTMLElement;
  if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
  emit("scrub", false);
}
</script>
