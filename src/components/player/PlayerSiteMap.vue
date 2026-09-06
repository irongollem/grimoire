<template>
  <section v-if="canShow" class="rounded-lg border border-border bg-card overflow-hidden">
    <div class="px-3 py-2 border-b border-border bg-muted/20">
      <span class="text-label-lg font-semibold text-muted-foreground">Map</span>
    </div>
    <div class="p-3 flex flex-col gap-3">
      <MapFrame ref="frameRef" :map-url="renderableSite!.mapUrl" compact>
        <canvas
          v-if="renderableSite!.calibration && !mapFailed"
          ref="canvasEl"
          class="pointer-events-none absolute inset-0 h-full w-full"
        />
      </MapFrame>
      <!--
        Deliberately a sibling of `MapFrame`, not slotted content — it is the
        fallback #828 asked for. `MapFrame` withholds its slot entirely when
        the map image fails to load (nothing left to anchor the room-cell
        overlay above to), but a player who explored three rooms should still
        see their names, so this list renders from `exploredRooms` alone and
        never depends on the picture having loaded.
      -->
      <ul class="flex flex-col gap-1">
        <li
          v-for="room in exploredRooms"
          :key="room.spaceLocationId"
          class="flex items-center gap-2 px-1 py-1"
        >
          <span class="min-w-0 flex-1 truncate text-body text-foreground">{{ room.name }}</span>
          <IconShieldCheck
            v-if="room.isCleared"
            class="h-3.5 w-3.5 shrink-0 text-tone-success"
            aria-label="Cleared"
            title="Cleared"
          />
          <IconLoot
            v-if="room.isLooted"
            class="h-3.5 w-3.5 shrink-0 text-tone-caution"
            aria-label="Looted"
            title="Looted"
          />
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * The player's own record of a site: the DM's shared map, with only the
 * rooms the party has explored overlaid on it (#798, epic #780). Renders
 * nothing when the site has no shared map, or nothing has been explored yet
 * — a heading over an empty box would announce "there is more here" before
 * the party found it, which is exactly the spoiler the RPC behind this
 * component (`get_player_visible_site_state`) was written to avoid.
 *
 * Deliberately reuses `MapFrame` (pan/zoom) and `cellRectInImageFractions`
 * (the same image-space cell maths the DM's `MapRegionsLayer` draws with),
 * rather than `MapRegionsLayer` itself: that component paints from the DM's
 * own `LocationMapRegion` rows and exists to trace/bind/run-move them, none
 * of which applies to a read-only player view — and the projection behind
 * this widget returns a narrower row shape (no `id`/`user_id`/
 * `site_location_id`) that only happens to match by field name, not by type.
 */
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import MapFrame from "@/components/locations/MapFrame.vue";
import { usePlayerVisibleLocation } from "@/composables/locations/useLocations";
import {
  groupExploredRooms,
  usePlayerVisibleSiteState,
  type PlayerVisibleSiteRoom,
} from "@/composables/locations/usePlayerVisibleSiteState";
import { cellRectInImageFractions } from "@/lib/gridCalibration";
import { IconLoot, IconShieldCheck } from "@/lib/icons";
import type { GridCalibration } from "@/types/location.types";

const { siteLocationId } = defineProps<{ siteLocationId: string }>();
const siteIdRef = computed(() => siteLocationId);

const { data: site } = usePlayerVisibleLocation(siteIdRef);
const { data: rooms } = usePlayerVisibleSiteState(siteIdRef);

const exploredRooms = computed(() => groupExploredRooms(rooms.value ?? []));

/** Null unless the site actually has something shareable to draw — a map
 *  image the DM has shared. `calibration` may still be null inside this: a
 *  shared map with no grid matched to it yet shows with no cell overlay,
 *  which is a normal state, not a broken one. */
const renderableSite = computed<{ mapUrl: string; calibration: GridCalibration | null } | null>(() => {
  const s = site.value;
  if (!s?.map_url || !s.is_map_shared) return null;
  return { mapUrl: s.map_url, calibration: s.grid_calibration };
});

const canShow = computed(() => !!renderableSite.value && exploredRooms.value.length > 0);

const frameRef = ref<InstanceType<typeof MapFrame> | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);
const imageNaturalWidth = computed(() => frameRef.value?.imageNaturalWidth ?? 0);
const imageNaturalHeight = computed(() => frameRef.value?.imageNaturalHeight ?? 0);
/** #828: true once the frame's map image has failed to load. Gates the
 *  room-cell canvas above — `imageNaturalWidth`/`imageNaturalHeight` stay 0
 *  in that state so `renderOverlay` already draws nothing, but skipping the
 *  mount keeps a ResizeObserver from ever being attached to a canvas that
 *  has no image to size itself against. */
const mapFailed = computed(() => frameRef.value?.imageFailed ?? false);

// Same resize-and-redraw idiom as `MapRegionsLayer`'s canvas: the canvas is
// sized in CSS to exactly cover the rendered image box, so observing the
// canvas itself catches every resize that would move it out of alignment.
let resizeObserver: ResizeObserver | null = null;
onMounted(() => {
  resizeObserver = new ResizeObserver(() => renderOverlay());
});
onUnmounted(() => resizeObserver?.disconnect());
watch(canvasEl, (el, oldEl) => {
  if (oldEl) resizeObserver?.unobserve(oldEl);
  if (el) resizeObserver?.observe(el);
});

/** Cleared and looted (violet) reads as "fully resolved"; cleared-only
 *  (green) or looted-only (amber) each still owe the party something; a
 *  merely-explored room (slate) is the base case — seen, nothing more known.
 *  The room list beside the map spells the same facts out in words for
 *  anyone who can't tell the fill colours apart. */
function roomFillColor(room: PlayerVisibleSiteRoom): string {
  if (room.is_cleared && room.is_looted) return "rgba(167, 139, 250, 0.34)";
  if (room.is_cleared) return "rgba(74, 222, 128, 0.32)";
  if (room.is_looted) return "rgba(217, 158, 44, 0.32)";
  return "rgba(148, 163, 184, 0.28)";
}

function renderOverlay(): void {
  const canvas = canvasEl.value;
  const cal = renderableSite.value?.calibration;
  if (!canvas || !cal) return;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
  canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const w = imageNaturalWidth.value;
  const h = imageNaturalHeight.value;
  if (w <= 0 || h <= 0) return;

  for (const room of rooms.value ?? []) {
    ctx.fillStyle = roomFillColor(room);
    for (const key of room.cells) {
      const rect = cellRectInImageFractions(key, cal, w, h);
      ctx.fillRect(rect.x * canvas.width, rect.y * canvas.height, rect.w * canvas.width, rect.h * canvas.height);
    }
  }
}

watch(
  [rooms, () => renderableSite.value?.calibration, imageNaturalWidth, imageNaturalHeight],
  () => renderOverlay(),
  { flush: "post", immediate: true },
);
</script>
