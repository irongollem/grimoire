<template>
  <div class="flex flex-col gap-3">
    <!-- Map image + pin overlay -->
    <div
      ref="mapContainer"
      class="relative w-full rounded-lg overflow-hidden border border-border select-none bg-muted/30"
      :class="placingChildId ? 'cursor-crosshair' : ''"
    >
      <img
        :src="mapUrl"
        class="w-full block pointer-events-none"
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
        class="absolute z-10 -translate-x-1/2 -translate-y-1/2 group"
        :style="{ left: `${pin.x * 100}%`, top: `${pin.y * 100}%` }"
        :class="mode === 'edit' ? 'cursor-grab' : 'cursor-pointer'"
        @pointerdown="mode === 'edit' ? onPinPointerDown($event, pin.child_location_id) : undefined"
        @click.stop="mode !== 'edit' ? onPinClick(pin.child_location_id) : undefined"
      >
        <!-- Dot -->
        <div
          class="rounded-full shadow-md ring-1 ring-black/20 transition-all duration-150"
          :class="[
            mode === 'edit' ? 'w-3.5 h-3.5' : 'w-3 h-3 group-hover:w-4.5 group-hover:h-4.5',
            !pin.visible_to_players ? 'opacity-40 ring-dashed' : '',
          ]"
          :style="{ backgroundColor: LOCATION_TYPE_COLORS[pin.child_type] }"
        />

        <!-- Hover label (view mode) -->
        <div
          v-if="mode !== 'edit'"
          class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-100 pointer-events-none whitespace-nowrap z-30"
        >
          <span class="bg-card/95 backdrop-blur-sm border border-border text-foreground font-cinzel text-[10px] font-semibold tracking-wide px-2 py-0.5 rounded shadow-lg">
            {{ pin.child_name }}
          </span>
        </div>

        <!-- Edit controls (edit mode) — shown on hover, above placing overlay -->
        <div
          v-if="mode === 'edit'"
          class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-30 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto flex items-center gap-1 bg-card border border-border rounded-md shadow-lg px-1.5 py-1"
          @pointerdown.stop
        >
          <span class="font-cinzel text-[10px] font-semibold text-foreground whitespace-nowrap max-w-32 truncate">
            {{ pin.child_name }}
          </span>
          <button
            type="button"
            class="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            :title="pin.visible_to_players ? 'Hide from players' : 'Show to players'"
            @click.stop="toggleVisibility(pin.child_location_id)"
          >
            <Eye v-if="pin.visible_to_players" class="h-3 w-3" />
            <EyeOff v-else class="h-3 w-3 text-muted-foreground/50" />
          </button>
          <button
            type="button"
            class="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
            title="Remove pin"
            @click.stop="removePin(pin.child_location_id)"
          >
            <X class="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>

    <!-- Edit mode: placing indicator or unplaced children -->
    <template v-if="mode === 'edit'">
      <div
        v-if="placingChildId"
        class="flex items-center gap-2 px-3 py-2 rounded-md bg-primary/10 border border-primary/30"
      >
        <MapPin class="h-3.5 w-3.5 text-primary shrink-0" />
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
import { Eye, EyeOff, X, MapPin } from "lucide-vue-next";
import { LOCATION_TYPE_COLORS } from "@/types/location.types";
import type { MapPin as MapPinType, LocationType } from "@/types/location.types";

const props = defineProps<{
  mapUrl: string;
  pins: MapPinType[];
  /** All direct children of this location (used in edit mode for unplaced list). */
  children: Array<{ id: string; name: string; location_type: LocationType }>;
  mode: "edit" | "view";
  /** If false (player view), hide pins where visible_to_players=false. */
  showHiddenPins?: boolean;
}>();

const emit = defineEmits<{
  "update:pins": [pins: MapPinType[]];
  "pin-click": [childId: string];
}>();

const mapContainer = ref<HTMLElement | null>(null);

// ── Pin visibility ──────────────────────────────────────────────────────────────
const visiblePins = computed(() =>
  props.showHiddenPins === false
    ? props.pins.filter((p) => p.visible_to_players)
    : props.pins,
);

// ── Unplaced children (edit mode) ──────────────────────────────────────────────
const placedIds = computed(() => new Set(props.pins.map((p) => p.child_location_id)));
const unplacedChildren = computed(() =>
  props.children.filter((c) => !placedIds.value.has(c.id)),
);

// ── Placing mode ───────────────────────────────────────────────────────────────
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
      x,
      y,
      visible_to_players: true,
    },
  ]);
  placingChildId.value = null;
}

// ── Drag to reposition (edit mode) ─────────────────────────────────────────────
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
  // If it was a click (no movement) → emit so parent can navigate
  if (!hasMoved && draggingId) {
    emit("pin-click", draggingId);
  }
  draggingId = null;
}

onUnmounted(() => {
  window.removeEventListener("pointermove", onDragMove);
  window.removeEventListener("pointerup", onDragEnd);
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
