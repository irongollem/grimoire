<template>
  <div class="relative flex h-full min-h-0 flex-col" data-testid="play-layout">
    <slot name="bar" />

    <div class="relative flex min-h-0 flex-1">
      <aside class="flex w-64 shrink-0 flex-col border-r border-border bg-card" :aria-label="leftLabel">
        <slot name="left" />
      </aside>

      <main class="min-w-0 flex-1">
        <slot name="map" />
      </main>

      <ResizeHandle @mousedown="startMouse" @touchstart="startTouch" />
      <aside class="flex min-h-0 shrink-0 flex-col overflow-hidden bg-card" :style="{ width: detailWidth + 'px' }" :aria-label="rightLabel">
        <slot name="right" />
      </aside>

      <slot name="overlay" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import ResizeHandle from "@/components/common/layout/ResizeHandle.vue";
import { useDetailResize } from "@/composables/encounters/useDetailResize";
import { useAppUiStore } from "@/stores/ui/app";

/**
 * The frame every Play screen shares (#1125 decision 9, frames 09 and 10): a bar, three columns (a list on the
 * left, the map in the middle, a resizable card on the right), and the whole window. A fight (PlayLayout) and
 * exploring a site (SiteExploreView) fill the slots, which is what lets the one screen turn from one into the
 * other without the frame moving.
 */
defineProps<{ leftLabel: string; rightLabel: string }>();

const { detailWidth, startMouse, startTouch } = useDetailResize(320);

// The Play screen is the whole window: the app's sidebar and top bar give way (as for Edit map), and the bar's
// back link is the way out. Only this layout; the classic runner and the phone keep the shell.
const appUi = useAppUiStore();
onMounted(() => {
  appUi.editorFocus = true;
});
onBeforeUnmount(() => {
  appUi.editorFocus = false;
});
</script>
