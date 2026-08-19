<template>
  <div class="flex flex-col gap-3">
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
        placingChildId ? 'cursor-crosshair' : '',
        scale > 1.01 && !placingChildId ? (isGesturing ? 'cursor-grabbing' : 'cursor-grab') : '',
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
        @click="pinnedPinId = null"
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

        <!-- Click-to-place overlay (sits above pins) -->
        <div
          v-if="mode === 'edit' && placingChildId"
          class="absolute inset-0 z-30 cursor-crosshair"
          @click="onPlacePin"
        />

        <!-- Pins -->
        <div
          v-for="pin in visiblePins"
          :key="pin.child_location_id"
          :data-pin-id="pin.child_location_id"
          class="absolute"
          :class="[
            mode === 'edit' ? 'cursor-grab' : 'cursor-pointer',
            isHovered(pin.child_location_id) ? 'z-20' : 'z-10',
          ]"
          :style="pinStyle(pin, isHovered(pin.child_location_id), pinnedPinId === pin.child_location_id, scale)"
          @pointerenter="onPinEnter($event, pin.child_location_id)"
          @pointerleave="onPinLeave($event)"
          @pointerdown="mode === 'edit' ? onPinPointerDown($event, pin.child_location_id) : undefined"
          @click.stop
        >
          <!-- Collapsed: simple dot -->
          <div
            v-if="!isHovered(pin.child_location_id)"
            class="w-3 h-3 rounded-full shadow-md ring-1 ring-black/20"
            :style="{ backgroundColor: LOCATION_TYPE_COLORS[getChildType(pin)] }"
            :class="!pin.visible_to_players ? 'opacity-50' : ''"
          />

          <!-- Expanded: pill with token + name + actions — all in one element, no gap -->
          <div
            v-else
            class="flex items-center gap-1.5 pl-1 pr-2 py-1 rounded-full bg-card/95 backdrop-blur-sm border border-border shadow-xl whitespace-nowrap"
            :class="!pin.visible_to_players ? 'opacity-75' : ''"
          >
            <!-- Token circle -->
            <div
              class="w-6 h-6 rounded-full overflow-hidden shrink-0 ring-2 ring-white/20 flex items-center justify-center"
              :style="tokenStyle(pin)"
            >
              <img
                v-if="pin.child_image_url && !brokenImages.has(pin.child_image_url)"
                :src="pin.child_image_url"
                class="w-full h-full object-cover pointer-events-none"
                draggable="false"
                @error="onPinImageError(pin.child_image_url)"
              />
              <span
                v-else
                class="font-cinzel font-bold text-white text-2xs leading-none select-none pointer-events-none"
              >
                {{ pin.child_name.charAt(0).toUpperCase() }}
              </span>
            </div>

            <!-- Name -->
            <span class="font-cinzel text-xs font-semibold text-foreground max-w-48 truncate">
              {{ pin.child_name }}
            </span>

            <!-- Edit actions -->
            <template v-if="mode === 'edit'">
              <AppButton
                variant="ghost"
                size="icon-xs"
                class="shrink-0"
                :icon="pin.visible_to_players ? IconReveal : IconHide"
                :title="pin.visible_to_players ? 'Hide from players' : 'Show to players'"
                @click.stop="toggleVisibility(pin.child_location_id)"
                @pointerdown.stop
              />
              <AppButton
                variant="ghost"
                tone="danger"
                size="icon-xs"
                class="shrink-0"
                :icon="IconClose"
                title="Remove pin"
                @click.stop="removePin(pin.child_location_id)"
                @pointerdown.stop
              />
            </template>

            <!-- View actions (player view) -->
            <template v-if="mode === 'view'">
              <!-- Go there — only when the child location is shared/navigable -->
              <AppButton
                v-if="sharedChildIds?.has(pin.child_location_id)"
                variant="ghost"
                size="icon-xs"
                class="shrink-0"
                :icon="IconNavigate"
                title="Go there"
                @click.stop="emit('pin-go', pin.child_location_id)"
                @pointerdown.stop
              />
              <!--
                Peek — art + summary + notes without going there.

                Only worth offering where travelling is expensive. In the player
                atlas, following a pin loads a different panel and coming back is
                work, so a peek saves "ah, not this one". The Atlas explorer
                zooms between maps and never leaves the page, so there the peek
                is a second way to do what clicking the pill already does, and
                the extra control just makes the pill harder to hit.
              -->
              <AppButton
                v-if="offerPeek"
                variant="ghost"
                size="icon-xs"
                class="shrink-0"
                :icon="IconScan"
                title="Watch"
                @click.stop="emit('pin-watch', pin.child_location_id)"
                @pointerdown.stop
              />
            </template>
          </div>
        </div>
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

    <!-- Edit mode: placing indicator or unplaced children -->
    <template v-if="mode === 'edit'">
      <div
        v-if="placingChildId"
        class="flex items-center gap-2 px-3 py-2 rounded-md bg-primary/10 border border-primary/30"
      >
        <IconLocation class="h-3.5 w-3.5 text-primary shrink-0" />
        <span class="font-cinzel text-xs text-primary flex-1">
          Click the map to place
          <strong>{{ placingChildName }}</strong>
        </span>
        <AppButton
          variant="ghost"
          size="inline-xs"
          label="Cancel"
          @click="placingChildId = null"
        />
      </div>

      <div v-else-if="unplacedChildren.length" class="flex flex-wrap items-center gap-1.5">
        <span class="text-label-lg text-muted-foreground shrink-0">Unplaced:</span>
        <AppButton
          v-for="child in unplacedChildren"
          :key="child.id"
          variant="subtle"
          size="xs"
          class="gap-1.5 border-dashed"
          :title="child.parent_chain?.length ? `In ${child.parent_chain.join(' › ')}` : undefined"
          @click="startPlacing(child.id)"
        >
          <span
            class="h-2 w-2 rounded-full shrink-0"
            :style="{ backgroundColor: LOCATION_TYPE_COLORS[child.location_type] }"
          />
          <span class="font-cinzel text-xs text-foreground">{{ child.name }}</span>
          <span
            v-if="child.parent_chain?.length"
            class="text-caption-sm text-muted-foreground italic"
          >
            · {{ child.parent_chain.join(" › ") }}
          </span>
        </AppButton>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted, watch } from "vue";
import { IconClose, IconHide, IconLocation, IconNavigate, IconReveal, IconScan } from '@/lib/icons';
import AppButton from "@/components/common/AppButton.vue";
import { MAP_IMAGE_COMPACT_SIZING, MAP_IMAGE_SIZING } from "@/lib/locations/mapZoom";
import { LOCATION_TYPE_COLORS } from "@/types/location.types";
import type { MapPin as MapPinType, LocationType } from "@/types/location.types";

const pins = defineModel<MapPinType[]>("pins", { required: true });
const {
  mapUrl,
  children,
  mode,
  showHiddenPins = false,
  offerPeek = true,
} = defineProps<{
  mapUrl: string;
  /** Candidate pin targets (edit mode: unplaced list + pin data population).
   *  Usually direct children, but callers can also pass descendants that were
   *  surfaced through vague container types (regions / continents / …) — in
   *  that case `parent_chain` names the intermediate containers for the
   *  unplaced-list breadcrumb. */
  children: Array<{
    id: string;
    name: string;
    location_type: LocationType;
    image_url?: string | null;
    parent_chain?: string[];
  }>;
  mode: "edit" | "view";
  /** DM sees all pins; players only see visible_to_players ones (caller filters before passing). */
  showHiddenPins?: boolean;
  /** Cap map height at ~800px with scroll (useful for very tall portrait maps). */
  compact?: boolean;
  /** Player view only: IDs of child locations that are shared (gates the Go-there button). */
  sharedChildIds?: Set<string>;
  /**
   * Offer the peek (Watch) action on a pin. Default true.
   *
   * Turn it off where travelling is already cheap — the Atlas explorer zooms
   * between maps without leaving the page, so a peek there duplicates what
   * clicking the pill does and only makes the pill harder to hit.
   */
  offerPeek?: boolean;
}>();

const emit = defineEmits<{
  "pin-click": [childId: string];
  "pin-go": [childId: string];
  "pin-watch": [childId: string];
}>();

const mapContainer = ref<HTMLElement | null>(null);
const mapFrame = ref<HTMLElement | null>(null);

// Pin token images can point at a since-deleted/replaced storage URL (the
// denormalised child_image_url snapshot goes stale). Track URLs that 404 so we
// fall back to the child's initial letter instead of a broken-image icon.
const brokenImages = ref<Set<string>>(new Set());
function onPinImageError(url: string | null) {
  if (url) brokenImages.value = new Set(brokenImages.value).add(url);
}

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
 * The pin a gesture started on, or null.
 *
 * A pin cannot act on its own `click`: the frame calls `setPointerCapture` on
 * pointerdown, and the browser then delivers the resulting click to the frame
 * instead of the pin — the same redirect the placement overlay avoids by
 * skipping capture. Only the pill's inner buttons escaped it, because they
 * carry `@pointerdown.stop`; the pill body and the bare dot did not, so
 * clicking a pin silently did nothing.
 *
 * Recognising the tap here keeps pan and pinch intact (both need the frame to
 * capture) while making the whole pin actionable.
 */
let pointerDownPinId: string | null = null;

function onFramePointerDown(e: PointerEvent) {
  const pinEl = (e.target as HTMLElement | null)?.closest?.("[data-pin-id]") ?? null;
  pointerDownPinId = pinEl?.getAttribute("data-pin-id") ?? null;

  // Accept all pointer types (touch, pen, mouse). Desktop mouse drag pans
  // when zoomed in, and DevTools mobile emulation / touch-simulation can
  // report either "mouse" or "touch" depending on the toolbar setting.
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  // In pin-placement mode, skip pointer capture entirely. setPointerCapture
  // causes the browser to redirect the resulting click event to mapFrame
  // instead of the placement overlay, so onPlacePin would never fire.
  if (placingChildId.value) return;

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

  // A clean tap on a pin — no pan, no pinch. Same two-step rule as edit mode:
  // act only once the pill is already showing. On a mouse, hover has shown it
  // by then, so a click travels immediately. On touch there is no hover, so the
  // first tap opens the pill (and reaches its buttons) and the second travels.
  if (
    activePointers.size === 0 &&
    mode !== "edit" &&
    pointerDownPinId &&
    !didMultiPointerGesture &&
    !dragStart?.moved
  ) {
    const tappedId = pointerDownPinId;
    if (isHovered(tappedId)) emit("pin-click", tappedId);
    else pinnedPinId.value = tappedId;
    // The redirected click still arrives at the frame afterwards; swallow it so
    // the container's clear-pinned handler cannot undo what the tap just did.
    installClickSwallow();
  }

  if (activePointers.size === 0) {
    pointerDownPinId = null;
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
  const lo = containerRect.left - frameRect.left - tx.value; // layout offset IconClose
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

// ── Pin visibility ─────────────────────────────────────────────────────────────
const visiblePins = computed(() =>
  showHiddenPins === false
    ? pins.value.filter((p) => p.visible_to_players)
    : pins.value,
);

// ── Hover state with grace period (fixes gap between dot and popup) ────────────
const hoveredPinId = ref<string | null>(null);
// Touch/click-pinned pill — stays open until tapping elsewhere or same pin again.
const pinnedPinId = ref<string | null>(null);
let leaveTimer: ReturnType<typeof setTimeout> | null = null;

function isHovered(childId: string) {
  return hoveredPinId.value === childId || pinnedPinId.value === childId;
}

// Hover and pinned state describe pins on *this* map. The Atlas keeps one
// LocationMap instance and swaps `mapUrl` as you travel, so without this the
// pin you clicked to leave stays pinned open when you come back — its pill
// floating with no pointer anywhere near it.
watch(
  () => mapUrl,
  () => {
    hoveredPinId.value = null;
    pinnedPinId.value = null;
  },
);

function onPinEnter(e: PointerEvent, childId: string) {
  // Hover-to-expand is a mouse-only UX. On touch the pointerenter fires at
  // touchstart, which used to snap the pill open *under* the finger before
  // the tap-handler could lift it. We now route touch entirely through
  // pointer-/click → onPinClick → pinnedPinId, which positions above the
  // finger.
  if (e.pointerType !== "mouse") return;
  if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
  hoveredPinId.value = childId;
  // Dismiss any pinned pill from a different pin when hovering with a cursor.
  if (pinnedPinId.value && pinnedPinId.value !== childId) {
    pinnedPinId.value = null;
  }
}

function onPinLeave(e: PointerEvent) {
  if (e.pointerType !== "mouse") return;
  leaveTimer = setTimeout(() => { hoveredPinId.value = null; }, 80);
}

// ── Live child type (color updates when child type changes) ────────────────────
function getChildType(pin: MapPinType): LocationType {
  const child = children.find((c) => c.id === pin.child_location_id);
  return child?.location_type ?? pin.child_type;
}

// ── Pin anchor style: position + edge-aware transform so pill never clips ─────
// When hovered (expanded pill): anchor at the dot position so the pill grows
// away from the cursor rather than centering on it. Near the right edge the
// pill grows left so it never clips.
// When collapsed (dot): center the dot on the pin coords.
// When pinned (tap-opened on touch): lift the pill above the pin so the action
// buttons don't land under the user's finger. Falls back to downward placement
// for pins near the top of the map.
//
// The `scale` argument is the map's current zoom. We counter-scale the pin
// box (scale(1/S)) so pins visually stay at their natural size + natural
// offset from the pin point regardless of how far the user has zoomed in.
// transform-origin is aligned to the pin-anchor edge so scaling doesn't
// drift the attachment point.
//
// Math:
//   transform: scale(1/S) translate(tx, ty)   with origin at the anchor.
// Parent (mapContainer) has scale(S). The composition (parent * child) is
// scale(1) translate(tx, ty) — a pure natural-unit translation. So percent
// and px translates behave the same as if the map weren't zoomed.
function pinStyle(pin: MapPinType, hovered: boolean, pinned: boolean, mapScale: number): Record<string, string> {
  let tx: string;
  let originX: string;
  if (hovered) {
    // Overlap the dot by 6px (half dot width) so the pill covers the hover
    // zone, preventing flutter when the cursor entered from the far side.
    if (pin.x > 0.5) {
      tx = "calc(-100% + 6px)";
      originX = "right";
    } else {
      tx = "-6px";
      originX = "left";
    }
  } else {
    if (pin.x < 0.2) { tx = "0%"; originX = "left"; }
    else if (pin.x > 0.8) { tx = "-100%"; originX = "right"; }
    else { tx = "-50%"; originX = "center"; }
  }

  let ty: string;
  let originY: string;
  if (pinned) {
    // Touch-opened: park the pill clearly above (or below) the finger so the
    // Go/Watch buttons aren't under the hand that just tapped.
    if (pin.y < 0.25) {
      ty = "calc(100% + 24px)";
      originY = "top";
    } else {
      ty = "calc(-100% - 24px)";
      originY = "bottom";
    }
  } else {
    if (pin.y < 0.15) { ty = "0%"; originY = "top"; }
    else if (pin.y > 0.85) { ty = "-100%"; originY = "bottom"; }
    else { ty = "-50%"; originY = "center"; }
  }

  return {
    left: `${pin.x * 100}%`,
    top: `${pin.y * 100}%`,
    transform: `scale(${1 / mapScale}) translate(${tx}, ${ty})`,
    transformOrigin: `${originX} ${originY}`,
  };
}

// ── Token style ────────────────────────────────────────────────────────────────
function tokenStyle(pin: MapPinType): Record<string, string> {
  if (pin.child_image_url) return {};
  return { backgroundColor: LOCATION_TYPE_COLORS[getChildType(pin)] };
}

// ── Unplaced children (edit mode) ─────────────────────────────────────────────
const placedIds = computed(() => new Set(pins.value.map((p) => p.child_location_id)));
const unplacedChildren = computed(() =>
  children.filter((c) => !placedIds.value.has(c.id)),
);

// ── Placing mode ──────────────────────────────────────────────────────────────
const placingChildId = ref<string | null>(null);
const placingChildName = computed(
  () => children.find((c) => c.id === placingChildId.value)?.name ?? "",
);

function startPlacing(childId: string) {
  placingChildId.value = childId;
}

function onPlacePin(e: MouseEvent) {
  if (!placingChildId.value || !mapContainer.value) return;
  const rect = mapContainer.value.getBoundingClientRect();
  const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
  const child = children.find((c) => c.id === placingChildId.value)!;
  const existing = pins.value.filter((p) => p.child_location_id !== placingChildId.value);
  pins.value = [
    ...existing,
    {
      child_location_id: child.id,
      child_name: child.name,
      child_type: child.location_type,
      child_image_url: child.image_url ?? null,
      x,
      y,
      visible_to_players: true,
    },
  ];
  placingChildId.value = null;
}

// ── Drag to reposition (edit mode) ────────────────────────────────────────────
let draggingId: string | null = null;
let hasMoved = false;
let dragStartX = 0;
let dragStartY = 0;

function onPinPointerDown(e: PointerEvent, childId: string) {
  if (placingChildId.value) return;
  e.preventDefault();
  draggingId = childId;
  hasMoved = false;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  window.addEventListener("pointermove", onDragMove);
  window.addEventListener("pointerup", onDragEnd, { once: true });
}

function onDragMove(e: PointerEvent) {
  if (!draggingId || !mapContainer.value) return;
  if (Math.abs(e.clientX - dragStartX) > 4 || Math.abs(e.clientY - dragStartY) > 4) {
    hasMoved = true;
  }
  if (!hasMoved) return;
  const rect = mapContainer.value.getBoundingClientRect();
  const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
  pins.value = pins.value.map((p) =>
    p.child_location_id === draggingId ? { ...p, x, y } : p,
  );
}

function onDragEnd() {
  window.removeEventListener("pointermove", onDragMove);
  if (!hasMoved && draggingId) {
    // On mouse, the pill was already visible via hover (hoveredPinId is set
    // on pointerenter for pointerType === "mouse" only). A click with the
    // pill visible is an intent to "accept" → emit pin-click so the parent
    // (LocationEditor) can navigate. On touch there's no hover step, so the
    // first tap promotes the pin to pinnedPinId — the pill shows with its
    // action buttons (visibility toggle, remove). A second tap on the same
    // pin closes the pill again.
    if (hoveredPinId.value === draggingId) {
      emit("pin-click", draggingId);
    } else {
      pinnedPinId.value = pinnedPinId.value === draggingId ? null : draggingId;
    }
  }
  draggingId = null;
}

onUnmounted(() => {
  window.removeEventListener("pointermove", onDragMove);
  window.removeEventListener("pointerup", onDragEnd);
  if (leaveTimer) clearTimeout(leaveTimer);
  pinnedPinId.value = null;
});

// View-mode taps are recognised in `onFramePointerUp`, not here: pointer
// capture on the frame redirects a pin's own click away from it, so there is no
// click handler left to hang this on.

// ── Mutation helpers ──────────────────────────────────────────────────────────
function toggleVisibility(childId: string) {
  pins.value = pins.value.map((p) =>
    p.child_location_id === childId
      ? { ...p, visible_to_players: !p.visible_to_players }
      : p,
  );
}

function removePin(childId: string) {
  pins.value = pins.value.filter((p) => p.child_location_id !== childId);
}
</script>
