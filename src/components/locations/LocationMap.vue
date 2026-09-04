<template>
  <div class="flex flex-col gap-3">
    <MapFrame
      ref="frameRef"
      :map-url="mapUrl"
      :compact="compact"
      :placing="!!placingChildId"
      @tap="onTap"
      @container-click="pinsLayerRef?.clearPinned()"
    >
      <MapPinsLayer
        ref="pinsLayerRef"
        v-model:pins="pins"
        v-model:placing-child-id="placingChildId"
        :map-url="mapUrl"
        :children="children"
        :mode="mode"
        :show-hidden-pins="showHiddenPins"
        :offer-peek="offerPeek"
        :shared-child-ids="sharedChildIds"
        :scale="frameRef?.scale ?? 1"
        :to-image-fraction="toImageFraction"
        @pin-click="emit('pin-click', $event)"
        @pin-go="emit('pin-go', $event)"
        @pin-watch="emit('pin-watch', $event)"
      />
    </MapFrame>

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
          @click="placingChildId = child.id"
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
import { ref, computed } from "vue";
import { IconLocation } from '@/lib/icons';
import AppButton from "@/components/common/AppButton.vue";
import MapFrame from "@/components/locations/MapFrame.vue";
import MapPinsLayer from "@/components/locations/MapPinsLayer.vue";
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

const frameRef = ref<InstanceType<typeof MapFrame> | null>(null);
const pinsLayerRef = ref<InstanceType<typeof MapPinsLayer> | null>(null);

// Lifted here (rather than kept inside the pins layer) because it also drives
// the frame's `placing` prop (skip pointer capture, crosshair cursor) — see
// `MapFrame.vue` — and the "click the map to place…"/unplaced-children chrome
// below, which sits below the frame rather than inside its transformed slot.
const placingChildId = ref<string | null>(null);

/**
 * The frame recognises a clean tap (no pan, no pinch) and hands back the
 * pointerdown's original target without interpreting it — see
 * `MapFrame.vue`'s `tap` event. Only the pins layer knows what `data-pin-id`
 * means, so the lookup and the touch two-step (hover-vs-pinned) live there;
 * this just wires the two together and, when the layer reports it consumed
 * the tap, tells the frame to swallow the synthetic click pointer capture
 * still redirects here afterwards (fix for the pin-tap-undone-by-click bug).
 */
function onTap(target: EventTarget | null) {
  const handled = pinsLayerRef.value?.handleTap(target);
  if (handled) frameRef.value?.swallowClick();
}

/** Passed down to the pins layer so `onPlacePin` and pin-drag repositioning
 *  share the frame's one implementation of client-coords → image-fraction. */
function toImageFraction(clientX: number, clientY: number): { x: number; y: number } | null {
  return frameRef.value?.toImageFraction(clientX, clientY) ?? null;
}

// ── Unplaced children (edit mode) ─────────────────────────────────────────────
const placedIds = computed(() => new Set(pins.value.map((p) => p.child_location_id)));
const unplacedChildren = computed(() =>
  children.filter((c) => !placedIds.value.has(c.id)),
);
const placingChildName = computed(
  () => children.find((c) => c.id === placingChildId.value)?.name ?? "",
);
</script>
