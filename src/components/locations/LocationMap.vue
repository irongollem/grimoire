<template>
  <div class="flex flex-col gap-3">
    <!-- Map image + pin overlay -->
    <div
      class="rounded-lg border border-border select-none bg-muted/30"
      :class="placingChildId ? 'cursor-crosshair' : ''"
    >
      <!-- Inner div sizes to image natural width; mx-auto centers it -->
      <div ref="mapContainer" class="relative w-fit max-w-full mx-auto">
        <img
          :src="mapUrl"
          class="block max-w-full h-auto rounded-lg pointer-events-none"
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
          class="absolute z-10"
          :style="pinStyle(pin)"
          :class="mode === 'edit' ? 'cursor-grab' : 'cursor-pointer'"
          @pointerenter="onPinEnter(pin.child_location_id)"
          @pointerleave="onPinLeave"
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
            <span class="font-cinzel text-xs font-semibold text-foreground max-w-32 truncate">
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
          </div>
        </div>
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
import { Eye, EyeOff, X, MapPin as MapPinIcon } from "lucide-vue-next";
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
}>();

const emit = defineEmits<{
  "update:pins": [pins: MapPinType[]];
  "pin-click": [childId: string];
}>();

const mapContainer = ref<HTMLElement | null>(null);

// ── Pin visibility ─────────────────────────────────────────────────────────────
const visiblePins = computed(() =>
  props.showHiddenPins === false
    ? props.pins.filter((p) => p.visible_to_players)
    : props.pins,
);

// ── Hover state with grace period (fixes gap between dot and popup) ────────────
const hoveredPinId = ref<string | null>(null);
let leaveTimer: ReturnType<typeof setTimeout> | null = null;

function isHovered(childId: string) {
  return hoveredPinId.value === childId;
}

function onPinEnter(childId: string) {
  if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
  hoveredPinId.value = childId;
}

function onPinLeave() {
  leaveTimer = setTimeout(() => { hoveredPinId.value = null; }, 80);
}

// ── Live child type (color updates when child type changes) ────────────────────
function getChildType(pin: MapPinType): LocationType {
  const child = props.children.find((c) => c.id === pin.child_location_id);
  return child?.location_type ?? pin.child_type;
}

// ── Pin anchor style: position + edge-aware transform so pill never clips ─────
function pinStyle(pin: MapPinType): Record<string, string> {
  const tx = pin.x < 0.2 ? "0%" : pin.x > 0.8 ? "-100%" : "-50%";
  const ty = pin.y < 0.15 ? "0%" : pin.y > 0.85 ? "-100%" : "-50%";
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
    emit("pin-click", draggingId);
  }
  draggingId = null;
}

onUnmounted(() => {
  window.removeEventListener("pointermove", onDragMove);
  window.removeEventListener("pointerup", onDragEnd);
  if (leaveTimer) clearTimeout(leaveTimer);
});

// ── View mode: click to navigate ──────────────────────────────────────────────
function onPinClick(childId: string) {
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
