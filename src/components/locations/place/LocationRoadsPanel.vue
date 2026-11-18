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
            <span class="text-body text-muted-foreground">{{ roadText(entry.road) }}</span>
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
        <label class="text-caption text-muted-foreground">
          The going
          <AppSelect v-model="going" block aria-label="The going">
            <option v-for="g in GOINGS" :key="g.value" :value="g.value">{{ g.label }}</option>
          </AppSelect>
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
import { useAllLocations } from "@/composables/locations/useLocations";
import { useAddLocationRoad, useDeleteLocationRoad, useLocationRoads } from "@/composables/locations/useLocationRoads";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { IconAdd, IconDelete } from "@/lib/icons";
import { placeRoute } from "@/lib/locations/placeRoute";
import { isInteriorType } from "@/lib/locations/tiers";
import { roadsFrom, roadText, type DistanceUnit, type Going } from "@/lib/travel/roads";

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
const error = ref<string | null>(null);
const canAdd = computed(() => otherId.value !== "" && typeof distance.value === "number" && distance.value > 0);

function cancel(): void {
  adding.value = false;
  otherId.value = "";
  distance.value = null;
  name.value = "";
  going.value = "road";
  error.value = null;
}

async function addRoad(): Promise<void> {
  if (!canAdd.value || typeof distance.value !== "number") return;
  error.value = null;
  try {
    await add.mutateAsync({ fromLocationId: locationId, toLocationId: otherId.value, distance: distance.value, unit: unit.value, name: name.value, going: going.value });
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
