<template>
  <!--
    Map frame: clipped viewport that the inner map transforms inside of.
    `touch-action: none` lets us capture multi-finger pinch gestures
    locally instead of the browser zooming the whole viewport. Single-
    finger drag is handled manually (only when zoomed in) so regular taps
    still reach pins. When `scale === 1`, touch-action is relaxed to
    `pan-y` so users can still scroll the page by swiping through the
    map area.
  -->
  <!--
    `touch-action: none` applies unconditionally: the browser's default
    pinch-to-zoom on `pan-y` isn't reliably disabled on all engines, so we
    have to opt out entirely for pinch to reach our handlers. Users can
    still scroll the page by swiping around the map card.
  -->
  <div
    ref="mapFrame"
    class="relative rounded-lg border border-border select-none bg-muted/30 overflow-hidden"
    :class="[
      placing ? 'cursor-crosshair' : '',
      scale > 1.01 && !placing ? (isGesturing ? 'cursor-grabbing' : 'cursor-grab') : '',
    ]"
    style="touch-action: none;"
    @pointerdown="onFramePointerDown"
    @pointermove="onFramePointerMove"
    @pointerup="onFramePointerUp"
    @pointercancel="onFramePointerUp"
    @wheel="onFrameWheel"
  >
    <!-- Inner div sizes to image natural width; mx-auto centers it.
         Zoom/pan applied via translate + scale around origin (0,0). -->
    <div
      ref="mapContainer"
      class="relative w-fit max-w-full mx-auto"
      :style="{
        transform: `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`,
        transformOrigin: '0 0',
        transition: isGesturing ? 'none' : 'transform 0.2s ease-out',
      }"
      @click="emit('container-click')"
    >
      <!--
        Sizing comes from the shared constants, not literals: the Atlas zoom
        overlay renders this same image and must match exactly, or the handoff
        between the two visibly jumps.
      -->
      <img
        :src="mapUrl"
        class="rounded-lg pointer-events-none"
        :class="[MAP_IMAGE_SIZING, compact ? MAP_IMAGE_COMPACT_SIZING : '']"
        draggable="false"
        alt="Location map"
      />

      <!--
        Overlay content (pins, region shapes, click-to-place catchers, …)
        renders here, inside the transformed container, so it inherits zoom
        the same way the image does — a child positioned with `%` coordinates
        stays anchored to the picture at any scale without knowing `scale`
        itself.
      -->
      <slot />
    </div>

    <!-- Zoom controls overlay (always-reachable; keyboard-accessible) -->
    <div class="absolute bottom-2 right-2 z-30 flex flex-col gap-1">
      <AppButton
        variant="subtle"
        size="icon-sm"
        class="bg-card/90 shadow-lg backdrop-blur-sm"
        :disabled="scale >= MAX_SCALE - 0.01"
        title="Zoom in"
        label="+"
        @click.stop="zoomBy(1.5)"
      />
      <AppButton
        variant="subtle"
        size="icon-sm"
        class="bg-card/90 shadow-lg backdrop-blur-sm"
        :disabled="scale <= 1.01"
        title="Zoom out"
        label="−"
        @click.stop="zoomBy(1 / 1.5)"
      />
      <AppButton
        v-if="scale > 1.01"
        variant="subtle"
        size="icon-sm"
        class="bg-card/90 shadow-lg backdrop-blur-sm"
        title="Reset zoom"
        label="↺"
        @click.stop="resetZoom"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import { MAP_IMAGE_COMPACT_SIZING, MAP_IMAGE_SIZING } from "@/lib/locations/mapZoom";

const { mapUrl, compact, placing = false } = defineProps<{
  mapUrl: string;
  /** Cap map height at ~800px with scroll (useful for very tall portrait maps). */
  compact?: boolean;
  /**
   * An overlay (the pins layer's click-to-place catcher today) wants clicks
   * routed to itself rather than to pan/pinch. See `onFramePointerDown` for
   * why this has to skip pointer capture entirely rather than just being
   * "aware" of it.
   */
  placing?: boolean;
}>();

const emit = defineEmits<{
  /**
   * A clean tap — pan and pinch have both been ruled out — carrying the
   * original pointerdown target. The frame has no notion of what that target
   * *is*; a slotted layer (pins today) inspects it and decides what to do.
   */
  tap: [target: EventTarget | null];
  /**
   * The transformed container received a plain click. This is the frame's
   * side of "clicking empty map background closes whatever's pinned open" —
   * the frame doesn't know what "pinned" means, so it just relays the click
   * and a slotted layer reacts.
   */
  "container-click": [];
}>();

const mapContainer = ref<HTMLElement | null>(null);
const mapFrame = ref<HTMLElement | null>(null);

// ── Pinch-zoom + pan ──────────────────────────────────────────────────────────
// Transform state: mapContainer is translated then scaled around origin (0,0).
// The frame clips with overflow-hidden so zooming stays inside the card.
const scale = ref(1);
const tx = ref(0);
const ty = ref(0);
const MIN_SCALE = 1;
const MAX_SCALE = 4;

// Active pointers on the map frame. Pinch needs 2, pan-drag uses 1.
const activePointers = new Map<number, { x: number; y: number }>();

// Baseline captured at the moment a 2-finger gesture starts. Pinch math
// anchors the pinch midpoint to its original map-space position so zoom
// feels natural (doesn't drift toward a corner).
// layoutOffsetX/Y: the container's position in the layout flow within the
// frame (the mx-auto centering margin). Stable during a gesture but must
// be captured because the corrected anchor formula subtracts it.
let pinchStart: {
  dist: number;
  midX: number;
  midY: number;
  layoutOffsetX: number;
  layoutOffsetY: number;
  scale: number;
  tx: number;
  ty: number;
} | null = null;

// Baseline for 1-finger drag-to-pan (only allowed when zoomed in).
let dragStart: { x: number; y: number; tx: number; ty: number; moved: boolean } | null = null;

// True while the user is actively mid-gesture — suppresses the transform
// transition so the map tracks the finger 1:1 instead of lagging behind.
const isGesturing = ref(false);

// Set when a pinch happened during the current gesture; used to swallow the
// ensuing synthetic click so we don't toggle a pin or drop a placement pin.
let didMultiPointerGesture = false;

function clampTranslate(scaleV: number, txV: number, tyV: number) {
  const frame = mapFrame.value;
  const container = mapContainer.value;
  if (!frame || !container || scaleV <= 1) return { tx: 0, ty: 0 };
  const frameRect = frame.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  // Layout offset: the container's position in the CSS layout flow relative
  // to the frame. With mx-auto this is the centering margin and is NOT zero.
  // containerRect.left = frameRect.left + layoutX + tx (transformOrigin 0 0)
  const layoutX = containerRect.left - frameRect.left - tx.value;
  const layoutY = containerRect.top  - frameRect.top  - ty.value;
  const contentW = container.offsetWidth  * scaleV;
  const contentH = container.offsetHeight * scaleV;
  // Content left + tx must be ≤ 0 (frame left), right must be ≥ frameWidth.
  const clampAxis = (layoutOff: number, contentSize: number, frameSize: number, val: number) => {
    const minV = frameSize - layoutOff - contentSize;
    const maxV = -layoutOff;
    if (minV > maxV) return -layoutOff + (frameSize - contentSize) / 2; // center if content fits
    return Math.max(minV, Math.min(maxV, val));
  };
  return {
    tx: clampAxis(layoutX, contentW, frameRect.width,  txV),
    ty: clampAxis(layoutY, contentH, frameRect.height, tyV),
  };
}

function pointerMidpointInFrame(): { x: number; y: number } {
  const frameRect = mapFrame.value!.getBoundingClientRect();
  const [a, b] = [...activePointers.values()];
  return { x: (a.x + b.x) / 2 - frameRect.left, y: (a.y + b.y) / 2 - frameRect.top };
}

function pointerDistance(): number {
  const [a, b] = [...activePointers.values()];
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * The raw target a gesture started on, or null.
 *
 * A pin cannot act on its own `click`: the frame calls `setPointerCapture` on
 * pointerdown, and the browser then delivers the resulting click to the frame
 * instead of whatever was actually under the pointer — the same redirect the
 * placement overlay avoids by skipping capture (see `placing` above). Only
 * elements carrying `@pointerdown.stop` escape it.
 *
 * The frame doesn't know what a "pin" is — it just remembers this target and
 * hands it back in the `tap` event once a gesture resolves to a clean tap
 * (see `onFramePointerUp`). Whoever is slotted in decides what the target was.
 */
let pointerDownTarget: EventTarget | null = null;

function onFramePointerDown(e: PointerEvent) {
  pointerDownTarget = e.target;

  // Accept all pointer types (touch, pen, mouse). Desktop mouse drag pans
  // when zoomed in, and DevTools mobile emulation / touch-simulation can
  // report either "mouse" or "touch" depending on the toolbar setting.
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  // In pin-placement mode, skip pointer capture entirely. setPointerCapture
  // causes the browser to redirect the resulting click event to mapFrame
  // instead of the placement overlay, so its click handler would never fire.
  if (placing) return;

  mapFrame.value?.setPointerCapture?.(e.pointerId);

  if (activePointers.size === 2) {
    // Start of a pinch — capture baseline including the container's layout
    // offset within the frame (mx-auto centering margin).
    const mid = pointerMidpointInFrame();
    const frameRect = mapFrame.value!.getBoundingClientRect();
    const containerRect = mapContainer.value!.getBoundingClientRect();
    pinchStart = {
      dist: pointerDistance(),
      midX: mid.x,
      midY: mid.y,
      layoutOffsetX: containerRect.left - frameRect.left - tx.value,
      layoutOffsetY: containerRect.top  - frameRect.top  - ty.value,
      scale: scale.value,
      tx: tx.value,
      ty: ty.value,
    };
    dragStart = null;
    didMultiPointerGesture = true;
    isGesturing.value = true;
  } else if (activePointers.size === 1 && scale.value > 1.01) {
    // Single-finger pan only when zoomed in — otherwise a tap on empty map
    // would start a drag and eat the click that closes the pinned pin pill.
    dragStart = { x: e.clientX, y: e.clientY, tx: tx.value, ty: ty.value, moved: false };
  }
}

function onFramePointerMove(e: PointerEvent) {
  if (!activePointers.has(e.pointerId)) return;
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (activePointers.size === 2 && pinchStart) {
    const dist = pointerDistance();
    const mid = pointerMidpointInFrame();
    const newScale = Math.max(
      MIN_SCALE,
      Math.min(MAX_SCALE, (pinchStart.scale * dist) / pinchStart.dist),
    );
    // Keep the pinch midpoint's map-space position anchored under the current
    // finger midpoint. The formula accounts for layoutOffset (the mx-auto
    // margin that shifts the container away from the frame's top-left corner).
    // Without it the map drifts right when the container is centered.
    const lo = pinchStart.layoutOffsetX;
    const lt = pinchStart.layoutOffsetY;
    const ratio = newScale / pinchStart.scale;
    const newTx = mid.x - lo - (pinchStart.midX - lo - pinchStart.tx) * ratio;
    const newTy = mid.y - lt - (pinchStart.midY - lt - pinchStart.ty) * ratio;
    const clamped = clampTranslate(newScale, newTx, newTy);
    scale.value = newScale;
    tx.value = clamped.tx;
    ty.value = clamped.ty;
  } else if (activePointers.size === 1 && dragStart) {
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    if (!dragStart.moved && Math.hypot(dx, dy) > 6) {
      dragStart.moved = true;
      isGesturing.value = true;
    }
    if (dragStart.moved) {
      const clamped = clampTranslate(scale.value, dragStart.tx + dx, dragStart.ty + dy);
      tx.value = clamped.tx;
      ty.value = clamped.ty;
    }
  }
}

function onFramePointerUp(e: PointerEvent) {
  activePointers.delete(e.pointerId);
  if (activePointers.size < 2) pinchStart = null;

  // If this gesture moved the map (pinch or drag-pan), the browser MAY fire
  // a synthetic click on the release point. Swallow it so we don't
  // accidentally toggle a pin or drop a placement pin. Use a named handler
  // with a timeout cleanup — `{ once: true }` would persist forever if the
  // click never fires (common for multi-touch gestures), eating the user's
  // next tap hours later. 300ms is well past any plausible synthetic click.
  if ((didMultiPointerGesture || dragStart?.moved) && activePointers.size === 0) {
    installClickSwallow();
  }

  // A clean tap — no pan, no pinch. Hand the original pointerdown target to
  // whoever is slotted in; they decide whether it means anything (was it a
  // pin? are we even in a mode that reacts to taps?) and, if they act on it,
  // call `swallowClick()` below to protect that action from the redirected
  // click that pointer capture still sends to this frame afterwards.
  if (activePointers.size === 0 && !didMultiPointerGesture && !dragStart?.moved) {
    emit("tap", pointerDownTarget);
  }

  if (activePointers.size === 0) {
    pointerDownTarget = null;
    dragStart = null;
    didMultiPointerGesture = false;
    isGesturing.value = false;
    // Clamp once more in case release left us off-bounds.
    const clamped = clampTranslate(scale.value, tx.value, ty.value);
    tx.value = clamped.tx;
    ty.value = clamped.ty;
  }
}

function installClickSwallow() {
  const handler = (ce: Event) => {
    ce.stopImmediatePropagation();
    ce.preventDefault();
    window.removeEventListener("click", handler, true);
  };
  window.addEventListener("click", handler, true);
  // If no click arrives within 300ms, tear the listener down so it doesn't
  // persist and eat an unrelated later click.
  setTimeout(() => window.removeEventListener("click", handler, true), 300);
}

function zoomAt(factor: number, anchorX: number, anchorY: number) {
  const frame = mapFrame.value;
  const container = mapContainer.value;
  if (!frame || !container) return;
  const frameRect = frame.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const lo = containerRect.left - frameRect.left - tx.value; // layout offset X
  const lt = containerRect.top  - frameRect.top  - ty.value; // layout offset Y
  const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale.value * factor));
  // Same anchor math as pinch: keep the map-space point under (anchorX,anchorY) fixed.
  const newTx = anchorX - lo - (anchorX - lo - tx.value) * (newScale / scale.value);
  const newTy = anchorY - lt - (anchorY - lt - ty.value) * (newScale / scale.value);
  const clamped = clampTranslate(newScale, newTx, newTy);
  scale.value = newScale;
  tx.value = clamped.tx;
  ty.value = clamped.ty;
}

function zoomBy(factor: number) {
  const frame = mapFrame.value;
  if (!frame) return;
  // +/- buttons zoom toward the frame's visible centre.
  const rect = frame.getBoundingClientRect();
  zoomAt(factor, rect.width / 2, rect.height / 2);
}

function onFrameWheel(e: WheelEvent) {
  const frame = mapFrame.value;
  if (!frame) return;
  // Trackpad pinch-zoom arrives as a `wheel` event with `ctrlKey === true`
  // (a browser convention, fired even if no physical Ctrl is pressed).
  // Desktop users can also hold Ctrl/Cmd and scroll to zoom. Plain wheel is
  // ignored so normal page scrolling still works when the user's cursor
  // happens to be over the map.
  if (!e.ctrlKey && !e.metaKey) return;
  // CRITICAL: prevent the browser's default viewport-zoom for this gesture.
  // Without this, Mac Chrome zooms BOTH the map (via our handler) and the
  // page (via Chrome's built-in trackpad-pinch-to-zoom). Only prevent when
  // we're actually handling the event, so plain wheel scrolls still work.
  e.preventDefault();
  const rect = frame.getBoundingClientRect();
  const anchorX = e.clientX - rect.left;
  const anchorY = e.clientY - rect.top;
  // deltaY > 0 means scroll down (zoom out); negate and exponent-scale so
  // big deltas don't over-zoom on a single wheel tick.
  const factor = Math.exp(-e.deltaY * 0.01);
  zoomAt(factor, anchorX, anchorY);
}

function resetZoom() {
  scale.value = 1;
  tx.value = 0;
  ty.value = 0;
}

/**
 * Client coordinates → fraction (0..1, clamped) of the image, via the
 * transformed container's own on-screen box. `getBoundingClientRect()`
 * already reflects the current pan/zoom, so this needs no `scale` term of
 * its own.
 *
 * The single implementation both `onPlacePin` and pin-drag repositioning
 * need (previously duplicated), and what `SiteMapView`'s `cellFromEvent`
 * computes separately today for its own canvas — not wired to this frame
 * yet (#807).
 */
function toImageFraction(clientX: number, clientY: number): { x: number; y: number } | null {
  const container = mapContainer.value;
  if (!container) return null;
  const rect = container.getBoundingClientRect();
  const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
  return { x, y };
}

defineExpose({
  scale,
  toImageFraction,
  /** Exposed so a slotted layer can protect an action it just took (from a
   *  tap) against the synthetic click pointer capture still redirects here. */
  swallowClick: installClickSwallow,
});
</script>
