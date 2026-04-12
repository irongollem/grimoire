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
        <img
          :src="mapUrl"
          class="block max-w-full h-auto rounded-lg pointer-events-none"
          :class="compact ? 'max-h-200' : ''"
          draggable="false"
          alt="Location map"
        />

        <!-- Click-to-place overlay (sits above pins) -->
        <div
          v-if="mode === 'edit' && placingChildId"
          class="absolute inset-0 z-20 cursor-crosshair"
          @click="onPlacePin"
        />

        <!-- Pins -->
        <div
          v-for="pin in visiblePins"
          :key="pin.child_location_id"
          class="absolute"
          :class="[
            mode === 'edit' ? 'cursor-grab' : 'cursor-pointer',
            isHovered(pin.child_location_id) ? 'z-20' : 'z-10',
          ]"
          :style="pinStyle(pin, isHovered(pin.child_location_id), pinnedPinId === pin.child_location_id)"
          @pointerenter="onPinEnter($event, pin.child_location_id)"
          @pointerleave="onPinLeave($event)"
          @pointerdown="mode === 'edit' ? onPinPointerDown($event, pin.child_location_id) : undefined"
          @click.stop="mode !== 'edit' ? onPinClick(pin.child_location_id) : undefined"
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
                v-if="pin.child_image_url"
                :src="pin.child_image_url"
                class="w-full h-full object-cover pointer-events-none"
                draggable="false"
              />
              <span
                v-else
                class="font-cinzel font-bold text-white text-[10px] leading-none select-none pointer-events-none"
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
              <button
                type="button"
                class="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                :title="pin.visible_to_players ? 'Hide from players' : 'Show to players'"
                @click.stop="toggleVisibility(pin.child_location_id)"
                @pointerdown.stop
              >
                <Eye v-if="pin.visible_to_players" class="h-3 w-3" />
                <EyeOff v-else class="h-3 w-3 text-muted-foreground/50" />
              </button>
              <button
                type="button"
                class="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                title="Remove pin"
                @click.stop="removePin(pin.child_location_id)"
                @pointerdown.stop
              >
                <X class="h-3 w-3" />
              </button>
            </template>

            <!-- View actions (player view) -->
            <template v-if="mode === 'view'">
              <!-- Go there — only when the child location is shared/navigable -->
              <button
                v-if="sharedChildIds?.has(pin.child_location_id)"
                type="button"
                class="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                title="Go there"
                @click.stop="emit('pin-go', pin.child_location_id)"
                @pointerdown.stop
              >
                <Navigation class="h-3 w-3" />
              </button>
              <!-- Watch — always available; shows art + summary + notes -->
              <button
                type="button"
                class="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                title="Watch"
                @click.stop="emit('pin-watch', pin.child_location_id)"
                @pointerdown.stop
              >
                <ScanEye class="h-3 w-3" />
              </button>
            </template>
          </div>
        </div>
      </div>

      <!-- Zoom controls overlay (always-reachable; keyboard-accessible) -->
      <div class="absolute bottom-2 right-2 z-30 flex flex-col gap-1">
        <button
          type="button"
          class="w-8 h-8 rounded-md bg-card/90 backdrop-blur-sm border border-border text-muted-foreground hover:text-foreground transition-colors shadow-lg font-cinzel text-sm font-bold"
          :disabled="scale >= MAX_SCALE - 0.01"
          title="Zoom in"
          @click.stop="zoomBy(1.5)"
        >+</button>
        <button
          type="button"
          class="w-8 h-8 rounded-md bg-card/90 backdrop-blur-sm border border-border text-muted-foreground hover:text-foreground transition-colors shadow-lg font-cinzel text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"
          :disabled="scale <= 1.01"
          title="Zoom out"
          @click.stop="zoomBy(1 / 1.5)"
        >−</button>
        <button
          v-if="scale > 1.01"
          type="button"
          class="w-8 h-8 rounded-md bg-card/90 backdrop-blur-sm border border-border text-muted-foreground hover:text-foreground transition-colors shadow-lg"
          title="Reset zoom"
          @click.stop="resetZoom"
        >
          <span class="block text-xs leading-none">↺</span>
        </button>
      </div>
    </div>

    <!-- Edit mode: placing indicator or unplaced children -->
    <template v-if="mode === 'edit'">
      <div
        v-if="placingChildId"
        class="flex items-center gap-2 px-3 py-2 rounded-md bg-primary/10 border border-primary/30"
      >
        <MapPinIcon class="h-3.5 w-3.5 text-primary shrink-0" />
        <span class="font-cinzel text-xs text-primary flex-1">
          Click the map to place
          <strong>{{ placingChildName }}</strong>
        </span>
        <button
          type="button"
          class="font-cinzel text-xs text-muted-foreground hover:text-foreground transition-colors"
          @click="placingChildId = null"
        >
          Cancel
        </button>
      </div>

      <div v-else-if="unplacedChildren.length" class="flex flex-wrap items-center gap-1.5">
        <span class="font-cinzel text-xs text-muted-foreground tracking-wider shrink-0">Unplaced:</span>
        <button
          v-for="child in unplacedChildren"
          :key="child.id"
          type="button"
          class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-dashed border-border hover:border-primary/50 hover:bg-muted/50 transition-colors"
          @click="startPlacing(child.id)"
        >
          <span
            class="h-2 w-2 rounded-full shrink-0"
            :style="{ backgroundColor: LOCATION_TYPE_COLORS[child.location_type] }"
          />
          <span class="font-cinzel text-xs text-foreground">{{ child.name }}</span>
        </button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from "vue";
import { Eye, EyeOff, X, MapPin as MapPinIcon, Navigation, ScanEye } from "lucide-vue-next";
import { LOCATION_TYPE_COLORS } from "@/types/location.types";
import type { MapPin as MapPinType, LocationType } from "@/types/location.types";

const props = defineProps<{
  mapUrl: string;
  pins: MapPinType[];
  /** All direct children of this location (edit mode: unplaced list + pin data population). */
  children: Array<{ id: string; name: string; location_type: LocationType; image_url?: string | null }>;
  mode: "edit" | "view";
  /** DM sees all pins; players only see visible_to_players ones (caller filters before passing). */
  showHiddenPins?: boolean;
  /** Cap map height at ~800px with scroll (useful for very tall portrait maps). */
  compact?: boolean;
  /** Player view only: IDs of child locations that are shared (gates Go-there + Watch buttons). */
  sharedChildIds?: Set<string>;
}>();

const emit = defineEmits<{
  "update:pins": [pins: MapPinType[]];
  "pin-click": [childId: string];
  "pin-go": [childId: string];
  "pin-watch": [childId: string];
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
let pinchStart: {
  dist: number;
  midX: number;
  midY: number;
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
  const contentW = container.offsetWidth * scaleV;
  const contentH = container.offsetHeight * scaleV;
  // Don't let the map edges retreat past the opposite edge of the frame.
  const minX = frameRect.width - contentW;
  const minY = frameRect.height - contentH;
  return {
    tx: Math.max(minX, Math.min(0, txV)),
    ty: Math.max(minY, Math.min(0, tyV)),
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

function onFramePointerDown(e: PointerEvent) {
  // Accept all pointer types (touch, pen, mouse). Desktop mouse drag pans
  // when zoomed in, and DevTools mobile emulation / touch-simulation can
  // report either "mouse" or "touch" depending on the toolbar setting.
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  mapFrame.value?.setPointerCapture?.(e.pointerId);

  if (activePointers.size === 2) {
    // Start of a pinch — capture baseline.
    const mid = pointerMidpointInFrame();
    pinchStart = {
      dist: pointerDistance(),
      midX: mid.x,
      midY: mid.y,
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
    // Keep the initial pinch midpoint's *map-space* position anchored under
    // wherever the current midpoint has moved to. (midX/Y in frame coords.)
    const newTx = mid.x - (pinchStart.midX - pinchStart.tx) * (newScale / pinchStart.scale);
    const newTy = mid.y - (pinchStart.midY - pinchStart.ty) * (newScale / pinchStart.scale);
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

  // If this gesture moved the map (pinch or drag-pan), the browser will still
  // fire a synthetic click on the release point. Swallow it so we don't
  // accidentally toggle a pin or drop a placement pin.
  if ((didMultiPointerGesture || dragStart?.moved) && activePointers.size === 0) {
    window.addEventListener(
      "click",
      (ce) => { ce.stopImmediatePropagation(); ce.preventDefault(); },
      { once: true, capture: true },
    );
  }

  if (activePointers.size === 0) {
    dragStart = null;
    didMultiPointerGesture = false;
    isGesturing.value = false;
    // Clamp once more in case release left us off-bounds.
    const clamped = clampTranslate(scale.value, tx.value, ty.value);
    tx.value = clamped.tx;
    ty.value = clamped.ty;
  }
}

function zoomAt(factor: number, anchorX: number, anchorY: number) {
  const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale.value * factor));
  // Keep the point under (anchorX, anchorY) — in frame coords — fixed on
  // screen while the scale changes. Same math as the pinch-midpoint anchor.
  const newTx = anchorX - ((anchorX - tx.value) * newScale) / scale.value;
  const newTy = anchorY - ((anchorY - ty.value) * newScale) / scale.value;
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
  props.showHiddenPins === false
    ? props.pins.filter((p) => p.visible_to_players)
    : props.pins,
);

// ── Hover state with grace period (fixes gap between dot and popup) ────────────
const hoveredPinId = ref<string | null>(null);
// Touch/click-pinned pill — stays open until tapping elsewhere or same pin again.
const pinnedPinId = ref<string | null>(null);
let leaveTimer: ReturnType<typeof setTimeout> | null = null;

function isHovered(childId: string) {
  return hoveredPinId.value === childId || pinnedPinId.value === childId;
}

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
  const child = props.children.find((c) => c.id === pin.child_location_id);
  return child?.location_type ?? pin.child_type;
}

// ── Pin anchor style: position + edge-aware transform so pill never clips ─────
// When hovered (expanded pill): anchor at the dot position so the pill grows
// away from the cursor rather than centering on it. Near the right edge the
// pill grows left so it never clips.
// When collapsed (dot): center the dot on the pin coords as before.
// When pinned (tap-opened on touch): lift the pill above the pin so the action
// buttons don't land under the user's finger. Falls back to downward placement
// for pins near the top of the map.
function pinStyle(pin: MapPinType, hovered: boolean, pinned: boolean): Record<string, string> {
  let tx: string;
  if (hovered) {
    // Overlap the dot by 6px (half dot width) so the pill always covers the hover zone,
    // preventing flutter when the cursor entered from the far side of the dot.
    tx = pin.x > 0.5 ? "calc(-100% + 6px)" : "-6px";
  } else {
    tx = pin.x < 0.2 ? "0%" : pin.x > 0.8 ? "-100%" : "-50%";
  }
  let ty: string;
  if (pinned) {
    // Touch-opened: park the pill clearly above (or below) the finger so the
    // Go/Watch buttons aren't under the hand that just tapped. 6px was too
    // tight for real finger widths; 24px gives comfortable clearance for the
    // average fingertip (~18-20px) plus a small gap.
    ty = pin.y < 0.25 ? "calc(100% + 24px)" : "calc(-100% - 24px)";
  } else {
    ty = pin.y < 0.15 ? "0%" : pin.y > 0.85 ? "-100%" : "-50%";
  }
  return {
    left: `${pin.x * 100}%`,
    top: `${pin.y * 100}%`,
    transform: `translate(${tx}, ${ty})`,
  };
}

// ── Token style ────────────────────────────────────────────────────────────────
function tokenStyle(pin: MapPinType): Record<string, string> {
  if (pin.child_image_url) return {};
  return { backgroundColor: LOCATION_TYPE_COLORS[getChildType(pin)] };
}

// ── Unplaced children (edit mode) ─────────────────────────────────────────────
const placedIds = computed(() => new Set(props.pins.map((p) => p.child_location_id)));
const unplacedChildren = computed(() =>
  props.children.filter((c) => !placedIds.value.has(c.id)),
);

// ── Placing mode ──────────────────────────────────────────────────────────────
const placingChildId = ref<string | null>(null);
const placingChildName = computed(
  () => props.children.find((c) => c.id === placingChildId.value)?.name ?? "",
);

function startPlacing(childId: string) {
  placingChildId.value = childId;
}

function onPlacePin(e: MouseEvent) {
  if (!placingChildId.value || !mapContainer.value) return;
  const rect = mapContainer.value.getBoundingClientRect();
  const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
  const child = props.children.find((c) => c.id === placingChildId.value)!;
  const existing = props.pins.filter((p) => p.child_location_id !== placingChildId.value);
  emit("update:pins", [
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
  ]);
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
  emit(
    "update:pins",
    props.pins.map((p) =>
      p.child_location_id === draggingId ? { ...p, x, y } : p,
    ),
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

// ── View mode: click to navigate + toggle pinned state for touch ──────────────
function onPinClick(childId: string) {
  // Toggle pinned — keeps the pill open on touch until another tap dismisses it.
  // The mapContainer @click (with @click.stop on pins) clears pinnedPinId when
  // the player taps anywhere else on the map.
  pinnedPinId.value = pinnedPinId.value === childId ? null : childId;
  emit("pin-click", childId);
}

// ── Mutation helpers ──────────────────────────────────────────────────────────
function toggleVisibility(childId: string) {
  emit(
    "update:pins",
    props.pins.map((p) =>
      p.child_location_id === childId
        ? { ...p, visible_to_players: !p.visible_to_players }
        : p,
    ),
  );
}

function removePin(childId: string) {
  emit("update:pins", props.pins.filter((p) => p.child_location_id !== childId));
}
</script>
