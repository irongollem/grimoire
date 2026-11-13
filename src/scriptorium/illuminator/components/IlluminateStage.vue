<template>
  <div ref="holder" class="relative flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center overflow-hidden bg-muted/40 p-6">
    <div
      v-if="loadError"
      role="alert"
      class="text-body text-muted-foreground"
    >{{ loadError }}</div>
    <div v-else-if="!ready" class="text-body text-muted-foreground" role="status">Opening the picture…</div>

    <!-- The picture, twice, one over the other: the original, and the edits clipped to the right of the divider. -->
    <div
      v-show="ready"
      class="relative shrink-0 select-none shadow-lg"
      :style="{ width: `${display.width}px`, height: `${display.height}px`, background: CHECKER }"
      data-testid="workbench-stage"
    >
      <canvas
        ref="beforeEl"
        class="absolute inset-0 size-full"
        :style="{ clipPath: `inset(0 ${100 - effectivePos}% 0 0)` }"
        aria-label="The original picture"
      />
      <canvas
        ref="afterEl"
        class="absolute inset-0 size-full"
        :style="{ clipPath: `inset(0 0 0 ${effectivePos}%)` }"
        aria-label="The picture with your edits"
      />

      <!-- Pointer layer: the focus point, wherever the divider is. -->
      <div
        class="absolute inset-0"
        :class="cursorClass"
        data-testid="workbench-pointer-layer"
        @click="emit('canvas-click', $event)"
        @contextmenu.prevent
      />

      <!-- A tool's own overlay: the crop box. -->
      <slot />

      <template v-if="ready && compareShown">
        <span class="pointer-events-none absolute bottom-2 left-2 rounded-sm bg-background/80 px-2 py-0.5 text-eyebrow uppercase text-foreground">Before</span>
        <span class="pointer-events-none absolute bottom-2 right-2 rounded-sm bg-background/80 px-2 py-0.5 text-eyebrow uppercase text-primary">After</span>
        <div
          class="absolute inset-y-0 w-8 -translate-x-1/2 cursor-ew-resize touch-none"
          :style="{ left: `${effectivePos}%` }"
          data-testid="workbench-divider"
          @pointerdown.stop.prevent="startDrag"
          @pointermove="onDrag"
          @pointerup="endDrag"
          @pointercancel="endDrag"
        >
          <div class="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-primary shadow-[0_0_0_1px_rgba(0,0,0,0.35)]" aria-hidden="true" />
        </div>
      </template>
    </div>

    <AppButton
      v-if="ready"
      variant="tool"
      size="xs"
      class="absolute right-3 top-3 bg-card"
      :icon="IconColumns"
      label="Compare"
      :active="compareShown"
      :disabled="compareOff"
      :tooltip="compareOff ? 'Compare is off while this tool shows the whole picture' : `Show the original beside your edits (${COMPARE_KEY.toUpperCase()}). Hold O to peek`"
      data-testid="compare-toggle"
      @click="emit('update:compare', !compare)"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * The workbench's stage (#1176 frame 12): the picture, with a before/after
 * divider you drag once Compare is on. It only draws and reports; the render is the composable's.
 * Painting has a stage of its own (paint/components/PaintStage.vue). The two canvases are exposed so it can draw into them.
 */
import { computed, ref } from "vue";
import { useElementSize } from "@vueuse/core";
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconColumns } from "@/lib/icons";
import { COMPARE_KEY } from "../toolKeys";

const CHECKER = "repeating-conic-gradient(#3a3a3a 0% 25%, #2a2a2a 0% 50%) 0 0 / 1.25rem 1.25rem";
/** Room kept round the picture. */
const CHROME_PX = 0;
const PAD_PX = 48;

const { size, comparePos, compare, showOriginal, compareOff = false, cursorClass = "", loadError = "" } = defineProps<{
  /** The preview's pixel size; zero until the picture has loaded. */
  size: { width: number; height: number };
  comparePos: number;
  /** The before/after split is on (the Compare button). */
  compare: boolean;
  /** Held O: the original in full. */
  showOriginal: boolean;
  /** Setting the crop and picking a focus point want the whole edited picture, so the divider steps aside. */
  compareOff?: boolean;
  cursorClass?: string;
  loadError?: string;
}>();

const emit = defineEmits<{
  "update:comparePos": [value: number];
  "update:compare": [value: boolean];
  "canvas-click": [event: MouseEvent];
}>();

const holder = ref<HTMLElement | null>(null);
const beforeEl = ref<HTMLCanvasElement | null>(null);
const afterEl = ref<HTMLCanvasElement | null>(null);
const { width: holderW, height: holderH } = useElementSize(holder);

const ready = computed(() => size.width > 0 && size.height > 0);
/** Held O puts the divider all the way over: the whole picture is the original. */
const compareShown = computed(() => compare && !compareOff);
const effectivePos = computed(() => (showOriginal ? 100 : compareShown.value ? comparePos : 0));

/** The preview fitted into the room there is, never larger than it was drawn. */
const display = computed(() => {
  if (!ready.value) return { width: 0, height: 0 };
  const room = { w: Math.max(80, holderW.value - PAD_PX), h: Math.max(80, holderH.value - PAD_PX - CHROME_PX) };
  const scale = Math.min(1, room.w / size.width, room.h / size.height);
  return { width: Math.round(size.width * scale), height: Math.round(size.height * scale) };
});

let dragging = false;
function startDrag(e: PointerEvent) {
  dragging = true;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
}
function onDrag(e: PointerEvent) {
  const box = afterEl.value?.getBoundingClientRect();
  if (!dragging || !box || box.width === 0) return;
  emit("update:comparePos", Math.max(0, Math.min(100, ((e.clientX - box.left) / box.width) * 100)));
}
function endDrag() {
  dragging = false;
}

defineExpose({ beforeEl, afterEl });
</script>
