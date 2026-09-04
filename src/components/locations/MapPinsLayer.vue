<template>
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
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted, watch } from "vue";
import { IconClose, IconHide, IconNavigate, IconReveal, IconScan } from '@/lib/icons';
import AppButton from "@/components/common/AppButton.vue";
import { LOCATION_TYPE_COLORS } from "@/types/location.types";
import type { MapPin as MapPinType, LocationType } from "@/types/location.types";

const pins = defineModel<MapPinType[]>("pins", { required: true });
/** The child currently being placed (edit mode), or null. Lifted to a model
 *  so the composite can read it too — for the frame's `placing` prop (skip
 *  pointer capture, crosshair cursor) and for the "click the map to
 *  place…"/unplaced-children chrome, which sits below the frame rather than
 *  inside its transformed slot and so can't be rendered from here. */
const placingChildId = defineModel<string | null>("placingChildId", { default: null });
const {
  mapUrl,
  children,
  mode,
  showHiddenPins = false,
  offerPeek = true,
  scale,
  toImageFraction,
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
  /** The frame's current zoom, for counter-scaling pins (see `pinStyle`). */
  scale: number;
  /** The frame's client-coordinates → image-fraction conversion. Shared with
   *  `onPlacePin` and pin-drag repositioning below — see `MapFrame.vue`. */
  toImageFraction: (clientX: number, clientY: number) => { x: number; y: number } | null;
}>();

const emit = defineEmits<{
  "pin-click": [childId: string];
  "pin-go": [childId: string];
  "pin-watch": [childId: string];
}>();

// Pin token images can point at a since-deleted/replaced storage URL (the
// denormalised child_image_url snapshot goes stale). Track URLs that 404 so we
// fall back to the child's initial letter instead of a broken-image icon.
const brokenImages = ref<Set<string>>(new Set());
function onPinImageError(url: string | null) {
  if (url) brokenImages.value = new Set(brokenImages.value).add(url);
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

/** Clears the pinned pill. Called by the composite when the frame reports a
 *  plain click on its transformed container — the frame's side of "clicking
 *  empty map background closes whatever's pinned open" (see `MapFrame.vue`'s
 *  `container-click`). */
function clearPinned() {
  pinnedPinId.value = null;
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
  // pointer-/click → handleTap → pinnedPinId, which positions above the
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

/**
 * Called by the composite when the frame recognises a clean tap (no pan, no
 * pinch) and hands back the pointerdown's original target. The frame doesn't
 * know what `data-pin-id` means — only this layer does, so the lookup happens
 * here.
 *
 * Same two-step rule as edit mode's drag handling below: act only once the
 * pill is already showing. On a mouse, hover has shown it by then, so a tap
 * travels immediately. On touch there is no hover, so the first tap opens the
 * pill (and reaches its buttons) and the second travels.
 *
 * Returns true when a pin consumed the tap, so the composite knows to call
 * the frame's `swallowClick()` — the redirected click pointer capture still
 * sends to the frame afterwards must not be allowed to undo what the tap just
 * did (e.g. via `clearPinned` above).
 */
function handleTap(target: EventTarget | null): boolean {
  if (mode === "edit") return false;
  const pinEl = (target as HTMLElement | null)?.closest?.("[data-pin-id]") ?? null;
  const tappedId = pinEl?.getAttribute("data-pin-id") ?? null;
  if (!tappedId) return false;
  if (isHovered(tappedId)) emit("pin-click", tappedId);
  else pinnedPinId.value = tappedId;
  return true;
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
// The `mapScale` argument is the map's current zoom. We counter-scale the pin
// box (scale(1/S)) so pins visually stay at their natural size + natural
// offset from the pin point regardless of how far the user has zoomed in.
// transform-origin is aligned to the pin-anchor edge so scaling doesn't
// drift the attachment point.
//
// Math:
//   transform: scale(1/S) translate(tx, ty)   with origin at the anchor.
// Parent (the frame's transformed container) has scale(S). The composition
// (parent * child) is scale(1) translate(tx, ty) — a pure natural-unit
// translation. So percent and px translates behave the same as if the map
// weren't zoomed.
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

// ── Placing mode ──────────────────────────────────────────────────────────────
function onPlacePin(e: MouseEvent) {
  if (!placingChildId.value) return;
  const frac = toImageFraction(e.clientX, e.clientY);
  if (!frac) return;
  const child = children.find((c) => c.id === placingChildId.value)!;
  const existing = pins.value.filter((p) => p.child_location_id !== placingChildId.value);
  pins.value = [
    ...existing,
    {
      child_location_id: child.id,
      child_name: child.name,
      child_type: child.location_type,
      child_image_url: child.image_url ?? null,
      x: frac.x,
      y: frac.y,
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
  if (!draggingId) return;
  const frac = toImageFraction(e.clientX, e.clientY);
  if (!frac) return;
  if (Math.abs(e.clientX - dragStartX) > 4 || Math.abs(e.clientY - dragStartY) > 4) {
    hasMoved = true;
  }
  if (!hasMoved) return;
  pins.value = pins.value.map((p) =>
    p.child_location_id === draggingId ? { ...p, x: frac.x, y: frac.y } : p,
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

// View-mode taps are recognised via `handleTap`, not a click handler here:
// pointer capture on the frame redirects a pin's own click away from it, so
// there is no click handler left to hang this on.

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

defineExpose({ handleTap, clearPinned });
</script>
