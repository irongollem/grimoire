<template>
  <!-- A place's roads, as a book writes them in its entry: where each leads and how far. -->
  <div class="flex flex-col gap-2" data-testid="location-roads">
    <p v-if="roads.isError.value" role="alert" class="text-body text-destructive">The roads could not be read. Reload to try again.</p>
    <ListSkeleton v-else-if="roads.isLoading.value" variant="text" :count="2" />
    <template v-else>
      <ul v-if="fromHere.length" class="flex flex-col divide-y divide-border border border-border bg-card">
        <li v-for="entry in fromHere" :key="entry.road.id" class="flex items-center gap-2 px-3 py-2" data-testid="location-road">
          <div class="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
            <AppButton :to="placeRoute(entry.otherId)" variant="link" size="inline" :label="nameOf(entry.otherId)" />
            <span class="text-body text-muted-foreground">{{ roadText(entry.road, terrainName) }}</span>
            <span v-if="tableName(entry.road.roll_table_id)" class="text-caption text-muted-foreground" data-testid="location-road-table">
              Encounters: {{ tableName(entry.road.roll_table_id) }}
            </span>
          </div>
          <AppButton
            variant="ghost"
            size="icon-sm"
            :icon="IconDelete"
            :aria-label="`Remove the road to ${nameOf(entry.otherId)}`"
            :tooltip="`Remove the road to ${nameOf(entry.otherId)}`"
            :loading="remove.isPending.value && remove.variables.value === entry.road.id"
            @click="removeRoad(entry.road.id, entry.otherId)"
          />
        </li>
      </ul>
      <p v-else-if="!adding" class="text-body italic text-muted-foreground">No roads lead from here yet.</p>

      <div v-if="adding" class="flex flex-col gap-2 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2" data-testid="location-road-form">
        <EntityCombobox v-model="otherId" :options="places" placeholder="Where does it lead?" />
        <div class="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[7rem_6rem_1fr]">
          <label class="text-caption text-muted-foreground">How far <AppInput v-model.number="distance" type="number" min="0" step="any" /></label>
          <label class="text-caption text-muted-foreground">
            Unit
            <AppSelect v-model="unit" block aria-label="Unit">
              <option value="mi">miles</option>
              <option value="km">km</option>
            </AppSelect>
          </label>
          <label class="col-span-2 text-caption text-muted-foreground sm:col-span-1">Its name <AppInput v-model="name" placeholder="the coast road (optional)" /></label>
        </div>
        <!-- Two places pinned on one scaled map: its measure is offered as a distance to start from, never filled in
             unasked, because a road winds and the book's figure is the truer one. -->
        <p v-if="measured" class="flex flex-wrap items-center gap-x-2 text-caption text-muted-foreground" data-testid="location-road-measured">
          On the map of {{ measured.mapName }} it is {{ formatDistance(measured.distance, measured.unit) }} in a straight line.
          <AppButton variant="link" size="inline" label="Use it" @click="useMeasured" />
        </p>
        <label class="text-caption text-muted-foreground">
          The going
          <AppSelect v-model="going" block aria-label="The going">
            <option v-for="g in GOINGS" :key="g.value" :value="g.value">{{ g.label }}</option>
          </AppSelect>
        </label>
        <label class="text-caption text-muted-foreground">
          The ground
          <AppSelect v-model="terrain" block aria-label="The ground">
            <option v-for="t in terrains" :key="t.key" :value="t.key">{{ t.name }}</option>
          </AppSelect>
        </label>
        <!-- Only when the campaign keeps roll tables: an empty picker would be a dead control. -->
        <label v-if="tables.length" class="text-caption text-muted-foreground">
          Its encounter table
          <EntityCombobox v-model="rollTableId" :options="tables" placeholder="None (optional)" />
        </label>
        <p v-if="error" role="alert" class="text-caption text-destructive">{{ error }}</p>
        <div class="flex justify-end gap-2">
          <AppButton variant="subtle" size="sm" label="Cancel" @click="cancel" />
          <AppButton size="sm" label="Add road" :disabled="!canAdd" :loading="add.isPending.value" @click="addRoad" />
        </div>
      </div>
      <div v-else>
        <AppButton variant="outline" size="sm" :icon="IconAdd" label="Add a road" data-testid="location-road-add" @click="adding = true" />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import ListSkeleton from "@/components/common/feedback/ListSkeleton.vue";
import { useAllLocations, useLocation } from "@/composables/locations/useLocations";
import { useMapPictureSize } from "@/composables/locations/useMapPictureSize";
import { useRollTables } from "@/composables/dungeon-features/useRollTables";
import { useAddLocationRoad, useDeleteLocationRoad, useLocationRoads } from "@/composables/locations/useLocationRoads";
import { useTravel } from "@/composables/locations/useTravel";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { IconAdd, IconDelete } from "@/lib/icons";
import { placeRoute } from "@/lib/locations/placeRoute";
import { isInteriorType } from "@/lib/locations/tiers";
import { formatDistance } from "@/lib/locations/mapScale";
import { journeyByMap, sharedMapOf } from "@/lib/travel/mapLine";
import { roadsFrom, roadText, type DistanceUnit, type Going } from "@/lib/travel/roads";
import { DEFAULT_ROAD_TERRAIN, WAY_PRESETS } from "@/rules/travelSpeed";
import { DEFAULT_TRAVEL_PACE } from "@/rules/travelPace";

/**
 * "Roads from here" on a place's entry (#1222): the places this one is joined to by a road and how far each is,
 * the way a book lists them in a town's entry. A road reads from both ends, so one added here shows on the other
 * place too. It needs no map.
 */
const { locationId } = defineProps<{ locationId: string }>();

const roads = useLocationRoads();
const { data: locations } = useAllLocations();
const add = useAddLocationRoad();
const remove = useDeleteLocationRoad();
const { confirm } = useConfirm();
const toast = useToast();

const fromHere = computed(() => roadsFrom(locationId, roads.data.value ?? []));
const names = computed(() => new Map((locations.value ?? []).map((l) => [l.id, l.name])));
const nameOf = (id: string): string => names.value.get(id) ?? "A place that is gone";
// A road leads to a place on the map of the world, not to a room: rooms are joined by doors.
const places = computed(() => (locations.value ?? []).filter((l) => l.id !== locationId && !isInteriorType(l.location_type)).map((l) => ({ id: l.id, name: l.name })));

// A road's own encounter table (Dungeon Craft): what may be met on it, wherever between its two ends.
// The ground a road goes over, in the campaign's own words.
const { terrains, companionSpeed } = useTravel();
const terrainName = (key: string): string | null => terrains.value.find((t) => t.key === key)?.name ?? null;

const { data: rollTables } = useRollTables();
const tables = computed(() => (rollTables.value ?? []).map((t) => ({ id: t.id, name: t.name })));
const tableName = (id: string | null): string | null => (id === null ? null : (tables.value.find((t) => t.id === id)?.name ?? null));

const GOINGS: { value: Going; label: string }[] = [
  { value: "road", label: "A road" },
  { value: "track", label: "A track" },
  { value: "river", label: "A river" },
  { value: "sea", label: "The sea" },
];

const adding = ref(false);
const otherId = ref("");
const distance = ref<number | null>(null);
const unit = ref<DistanceUnit>("mi");
const name = ref("");
const going = ref<Going>("road");
const terrain = ref(DEFAULT_ROAD_TERRAIN);
const rollTableId = ref("");
const error = ref<string | null>(null);
const canAdd = computed(() => otherId.value !== "" && typeof distance.value === "number" && distance.value > 0);

function cancel(): void {
  adding.value = false;
  otherId.value = "";
  distance.value = null;
  name.value = "";
  going.value = "road";
  terrain.value = DEFAULT_ROAD_TERRAIN;
  rollTableId.value = "";
  error.value = null;
}

// ── The map's measure, offered (#1222, story 10) ─────────────────────────────
// The two places' shared map (the nearest place both lie inside) is read only once the far end is chosen.
const parentOf = (id: string): string | null => (locations.value ?? []).find((l) => l.id === id)?.parent_id ?? null;
const shared = computed(() => (otherId.value === "" || !locations.value ? null : sharedMapOf(locationId, otherId.value, parentOf)));
const { data: mapPlace } = useLocation(() => (shared.value ? shared.value.mapId : null));
const pictureSize = useMapPictureSize(() => (mapPlace.value ? (mapPlace.value.map_url ?? mapPlace.value.map_layer_url) : null));
const measured = computed(() => {
  const place = mapPlace.value;
  if (!shared.value || !place || place.id !== shared.value.mapId) return null;
  // The straight line as measured: the "Off the Road" winding is for a journey with no road, not for a road.
  const line = journeyByMap({ shared: shared.value, pins: place.map_pins, scale: place.map_scale, size: pictureSize.value, travel: { paceId: DEFAULT_TRAVEL_PACE, way: WAY_PRESETS[0], terrains: terrains.value, companionSpeed }, openLand: { terrain: DEFAULT_ROAD_TERRAIN, winding: 1 } });
  if (line === null) return null;
  return { mapName: place.name, distance: Math.round(line.summary.distance * 10) / 10, unit: line.summary.unit };
});
function useMeasured(): void {
  if (!measured.value) return;
  distance.value = measured.value.distance;
  unit.value = measured.value.unit;
}

async function addRoad(): Promise<void> {
  if (!canAdd.value || typeof distance.value !== "number") return;
  error.value = null;
  try {
    await add.mutateAsync({ fromLocationId: locationId, toLocationId: otherId.value, distance: distance.value, unit: unit.value, name: name.value, going: going.value, terrain: terrain.value, rollTableId: rollTableId.value === "" ? null : rollTableId.value });
    cancel();
  } catch (e) {
    error.value = toast.fromError(e, "Couldn't add the road.");
  }
}

async function removeRoad(roadId: string, other: string): Promise<void> {
  if (!(await confirm(`The road to ${nameOf(other)} is removed from both places.`, { title: "Remove this road?", confirmLabel: "Remove", danger: true }))) return;
  try {
    await remove.mutateAsync(roadId);
  } catch (e) {
    toast.error(toast.fromError(e, "Couldn't remove the road."));
  }
}
</script>
