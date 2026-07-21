<template>
  <details class="rounded-lg border border-border bg-card" open>
    <summary class="cursor-pointer px-5 py-4 flex items-center justify-between gap-3">
      <div>
        <h2 class="font-cinzel text-sm font-bold text-foreground tracking-wider uppercase">Battlefield Setup</h2>
        <p class="text-caption text-muted-foreground mt-1">
          Place enemy tokens on the battle map ahead of time. Their starting cells are saved with
          the encounter and seeded into the runner when combat starts.
        </p>
      </div>
      <span v-if="!isReady" class="font-fell text-[0.6875rem] text-amber-500/80 italic">
        {{ readinessHint }}
      </span>
    </summary>

    <div class="px-5 pb-5">
      <p v-if="!isReady" class="text-body text-muted-foreground italic">
        {{ readinessHint }}
      </p>

      <div v-else class="flex flex-col gap-2">
        <div class="flex items-center gap-2 text-caption text-muted-foreground">
          <span>{{ tokenCount }} token{{ tokenCount === 1 ? "" : "s" }}</span>
          <span class="text-muted-foreground/40">·</span>
          <button
            type="button"
            class="text-label text-muted-foreground hover:text-foreground transition-colors"
            @click="clearPositions"
          >
            Clear all placements
          </button>
        </div>

        <div
          ref="canvasHost"
          class="relative w-full bg-muted rounded-md overflow-hidden select-none"
          style="aspect-ratio: 16 / 9; min-height: 24rem;"
          @wheel.prevent="onWheel"
          @pointerdown="startPan"
          @pointermove="continuePan"
          @pointerup="endPan"
          @pointerleave="endPan"
        >
          <svg
            v-if="imageReady"
            class="map-svg absolute inset-0 w-full h-full"
            :viewBox="`0 0 ${hostW} ${hostH}`"
            preserveAspectRatio="none"
          >
            <image
              :href="location?.map_url ?? undefined"
              :x="panX"
              :y="panY"
              :width="imageNaturalW * scale"
              :height="imageNaturalH * scale"
            />
            <line
              v-for="(x, i) in gridVerticals"
              :key="`v-${i}`"
              :x1="x"
              :y1="0"
              :x2="x"
              :y2="hostH"
              stroke="#000"
              :stroke-opacity="gridStrokeOpacity"
              stroke-width="1"
            />
            <line
              v-for="(y, i) in gridHorizontals"
              :key="`h-${i}`"
              :x1="0"
              :y1="y"
              :x2="hostW"
              :y2="y"
              stroke="#000"
              :stroke-opacity="gridStrokeOpacity"
              stroke-width="1"
            />
          </svg>

          <BattleMapTokenLayer
            v-if="imageReady && cellPx > 0"
            :host-w="hostW"
            :host-h="hostH"
            :cell-px="cellPx"
            :origin-x="gridOrigin.x"
            :origin-y="gridOrigin.y"
            :combatants="previewCombatants"
            :factions="factions"
            :monsters="monsters"
            :npcs="npcs"
            :on-position-change="onTokenMoved"
          />

          <img
            v-if="location?.map_url && !imageReady"
            :src="location.map_url"
            class="hidden-loader"
            @load="onImageLoad"
          />
        </div>
      </div>
    </div>
  </details>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import { useLocation } from "@/composables/useLocations";
import { useMapCanvas } from "@/composables/useMapCanvas";
import { sizeToFootprint } from "@/lib/tokenFootprint";
import { DEFAULT_GRID_OPACITY } from "@/types/location.types";
import {
  cellSizeInDisplay,
  gridLinePositions,
  gridOriginInDisplay,
} from "@/lib/battleMapGeometry";
import BattleMapTokenLayer from "@/components/encounters/BattleMapTokenLayer.vue";
import type { CombatantDef, FactionDef, RunCombatant } from "@/types/encounter.types";
import type { Monster } from "@/types/monster.types";
import type { Npc } from "@/types/npc.types";

const props = defineProps<{
  locationId: string | null;
  combatants: CombatantDef[];
  factions: FactionDef[];
  monsters: Monster[];
  npcs: Npc[];
}>();

const emit = defineEmits<{
  "update:combatants": [combatants: CombatantDef[]];
}>();

const locationIdRef = computed(() => props.locationId ?? "");
const { data: location } = useLocation(locationIdRef);

const isReady = computed(
  () =>
    !!location.value?.is_battle_map &&
    !!location.value?.map_url &&
    !!location.value?.grid_calibration,
);
const readinessHint = computed(() => {
  if (!props.locationId) return "Pick a location with a calibrated battle map to enable placement.";
  if (!location.value) return "Loading location…";
  if (!location.value.map_url) return "The linked location has no map.";
  if (!location.value.is_battle_map) return "Tick \"Battle map\" on the location to enable placement.";
  if (!location.value.grid_calibration) return "Calibrate the location's map to enable placement.";
  return "";
});

// ── Synthetic combatants for the placement preview ────────────────────────

// Each CombatantDef × count produces one preview token. instance_id mirrors
// what the runner will use (`m-{def.id}-{i}` / `n-{def.id}-{i}`) so the
// position can be written back into the corresponding def slot on drop.
const previewCombatants = computed<RunCombatant[]>(() => {
  const out: RunCombatant[] = [];
  for (const def of props.combatants) {
    if (def.monster_id) {
      const monster = props.monsters.find((m) => m.id === def.monster_id);
      if (!monster) continue;
      for (let i = 0; i < def.count; i++) {
        const displayName =
          def.count > 1
            ? `${def.custom_name || monster.name} ${i + 1}`
            : def.custom_name || monster.name;
        out.push({
          instance_id: `m-${def.id}-${i}`,
          type: "monster",
          name: displayName,
          faction_id: def.faction_id,
          initiative: null,
          hp: 1,
          max_hp: 1,
          ac: "",
          conditions: [],
          curses: [],
          death_saves: { successes: 0, failures: 0 },
          monster_id: monster.id,
          def_id: def.id,
          dex_mod: 0,
          portrait_url: monster.image_url ?? null,
          portrait_focal_point: monster.portrait_focal_point ?? null,
          position: def.starting_positions?.[i] ?? null,
          footprint: sizeToFootprint(monster.size),
        });
      }
    } else if (def.npc_id) {
      const npc = props.npcs.find((n) => n.id === def.npc_id);
      if (!npc) continue;
      for (let i = 0; i < def.count; i++) {
        const displayName =
          def.count > 1
            ? `${def.custom_name || npc.name} ${i + 1}`
            : def.custom_name || npc.name;
        out.push({
          instance_id: `n-${def.id}-${i}`,
          type: "monster",
          name: displayName,
          faction_id: def.faction_id,
          initiative: null,
          hp: 1,
          max_hp: 1,
          ac: "",
          conditions: [],
          curses: [],
          death_saves: { successes: 0, failures: 0 },
          npc_id: npc.id,
          def_id: def.id,
          dex_mod: 0,
          portrait_url: npc.portrait_url ?? null,
          portrait_focal_point: npc.portrait_focal_point ?? null,
          position: def.starting_positions?.[i] ?? null,
          footprint: 1,
        });
      }
    }
  }
  return out;
});

const tokenCount = computed(() => previewCombatants.value.length);

function onTokenMoved(instanceId: string, position: { x: number; y: number }) {
  // instance_id is "{m|n}-{def.id}-{index}". Extract def_id + index and patch
  // the matching def's starting_positions array.
  const match = instanceId.match(/^[mn]-(.+)-(\d+)$/);
  if (!match) return;
  const [, defId, idxStr] = match;
  const idx = Number(idxStr);
  const next = props.combatants.map((def) => {
    if (def.id !== defId) return def;
    const positions = [...(def.starting_positions ?? [])];
    while (positions.length < def.count) positions.push(null);
    positions[idx] = position;
    return { ...def, starting_positions: positions };
  });
  emit("update:combatants", next);
}

function clearPositions() {
  emit(
    "update:combatants",
    props.combatants.map((def) =>
      def.starting_positions ? { ...def, starting_positions: undefined } : def,
    ),
  );
}

// ── Map canvas (pan/zoom/grid via shared composable) ─────────────────────

const {
  canvasHost,
  hostW,
  hostH,
  imageNaturalW,
  imageNaturalH,
  imageReady,
  panX,
  panY,
  scale,
  onImageLoad,
  onWheel,
  startPan,
  continuePan,
  endPan,
} = useMapCanvas();

const cellPx = computed(() =>
  location.value?.grid_calibration
    ? cellSizeInDisplay({
        imageNaturalWidth: imageNaturalW.value,
        cellsPerImageWidth: location.value.grid_calibration.cells_per_image_width,
        scale: scale.value,
      })
    : 0,
);
const gridOrigin = computed(() =>
  location.value?.grid_calibration
    ? gridOriginInDisplay({
        panX: panX.value,
        panY: panY.value,
        scale: scale.value,
        imageNaturalWidth: imageNaturalW.value,
        imageNaturalHeight: imageNaturalH.value,
        originXPct: location.value.grid_calibration.origin_x_pct,
        originYPct: location.value.grid_calibration.origin_y_pct,
      })
    : { x: 0, y: 0 },
);
const gridVerticals = computed(() =>
  cellPx.value > 0 ? gridLinePositions(gridOrigin.value.x, hostW.value, cellPx.value) : [],
);
const gridHorizontals = computed(() =>
  cellPx.value > 0 ? gridLinePositions(gridOrigin.value.y, hostH.value, cellPx.value) : [],
);
const gridStrokeOpacity = computed(
  () => location.value?.grid_calibration?.grid_opacity ?? DEFAULT_GRID_OPACITY,
);

// Reset imageReady when the location's map_url changes so a different map
// re-fits and re-renders cleanly.
watch(
  () => location.value?.map_url,
  () => {
    imageReady.value = false;
  },
);
</script>

<style scoped>
.map-svg {
  user-select: none;
}

.hidden-loader {
  position: absolute;
  width: 0.0625rem;
  height: 0.0625rem;
  opacity: 0;
  pointer-events: none;
}
</style>
