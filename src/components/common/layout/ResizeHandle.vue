<template>
  <div
    class="resize-handle"
    title="Drag to resize"
    @mousedown.prevent="emit('mousedown', $event)"
    @touchstart.prevent="emit('touchstart', $event)"
  ></div>
</template>

<script setup lang="ts">
/**
 * The draggable seam between a list and its side panel. Pair with `useDetailResize`, whose
 * `startMouse` / `startTouch` take these events.
 */
const emit = defineEmits<{
  mousedown: [event: MouseEvent];
  touchstart: [event: TouchEvent];
}>();
</script>

<style scoped>
.resize-handle {
  position: relative;
  width: 0.3125rem;
  flex-shrink: 0;
  cursor: col-resize;
  background: var(--border);
  transition: background 0.15s;
  z-index: 1;
}

/* Expand the touch/click surface to 44px without affecting layout */
.resize-handle::before {
  content: "";
  position: absolute;
  inset: 0;
  margin-inline: -1.25rem;
}

.resize-handle:hover {
  background: color-mix(in oklab, var(--primary) 50%, transparent);
}
</style>
