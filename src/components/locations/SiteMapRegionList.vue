<template>
  <!-- Space shapes — every addressable space of this site (a room, or a
       nested site with its own floor plan, #818), whether or not it has a
       region yet, so the site is usable before it is fully traced.
       Deliberately NOT called "Rooms": `SiteRoomsPanel` owns rooms themselves
       (order, add, rename, delete) further down the same place's page. Two
       sections reading "Rooms" is the duplication #783 removed from the
       Atlas tree, re-created by accident. This list is about each space's
       *shape on the map*, which is a different thing, and naming it so
       makes the relationship informative instead of confusing.
       Only mounted in browse mode — see the `v-if` at the call site in
       `LocationMap.vue` (#807) — run mode renders its own click-to-move
       room list instead. -->
  <div class="flex flex-col gap-1.5">
    <span class="text-label-lg font-semibold text-muted-foreground">Space shapes</span>
    <p v-if="!spaces.length" class="text-caption text-muted-foreground italic">No spaces yet — add a room below, or a nested site as a child location.</p>
    <div v-else class="flex flex-col gap-1.5">
      <div
        v-for="space in spaces"
        :key="space.id"
        class="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2"
      >
        <RouterLink
          :to="`/locations/${space.id}`"
          class="min-w-0 flex-1 truncate font-cinzel text-xs font-semibold text-foreground transition-colors hover:text-primary"
        >{{ space.name }}</RouterLink>

        <template v-if="boundRegionBySpace.get(space.id)">
          <AppButton
            variant="ghost"
            size="inline-xs"
            label="Trace"
            :active="activeRegionId === boundRegionBySpace.get(space.id)!.id"
            :disabled="!canTrace"
            :tooltip="canTrace ? undefined : 'Calibrate the grid before tracing'"
            @click="toggleActive(boundRegionBySpace.get(space.id)!.id)"
          />
          <AppButton
            variant="ghost"
            size="inline-xs"
            label="Unbind"
            @click="unbind(boundRegionBySpace.get(space.id)!)"
          />
          <AppButton
            variant="ghost"
            tone="danger"
            size="icon-xs"
            :icon="IconDelete"
            tooltip="Delete this space's shape"
            @click="removeRegion(boundRegionBySpace.get(space.id)!)"
          />
        </template>
        <AppButton v-else variant="ghost" size="inline-xs" label="Add region" @click="addRegionForSpace(space)" />
      </div>
    </div>
  </div>

  <!-- Untitled shapes — traced but not (yet) bound to a space. -->
  <div class="flex flex-col gap-1.5">
    <div class="flex items-center justify-between">
      <span class="text-label-lg font-semibold text-muted-foreground">Untitled shapes</span>
      <AppButton variant="ghost" size="inline-xs" :icon="IconAdd" label="New shape" @click="addUnboundRegion" />
    </div>
    <p v-if="!unboundRegions.length" class="text-caption text-muted-foreground italic">Nothing traced yet.</p>
    <div v-else class="flex flex-col gap-1.5">
      <div
        v-for="region in unboundRegions"
        :key="region.id"
        class="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2"
      >
        <AppInput
          :model-value="region.label ?? ''"
          :model-modifiers="{ lazy: true }"
          type="text"
          tone="bare"
          size="xs"
          placeholder="Name this shape…"
          class="min-w-0 flex-1"
          @update:model-value="commitLabel(region, $event as string)"
        />
        <EntityCombobox
          :model-value="''"
          :options="unclaimedSpaces"
          placeholder="Bind to space…"
          class="w-40 shrink-0"
          @update:model-value="onBindSpace(region, $event)"
        />
        <AppButton
          variant="ghost"
          size="inline-xs"
          label="Trace"
          :active="activeRegionId === region.id"
          :disabled="!canTrace"
          :tooltip="canTrace ? undefined : 'Calibrate the grid before tracing'"
          @click="toggleActive(region.id)"
        />
        <AppButton
          variant="ghost"
          tone="danger"
          size="icon-xs"
          :icon="IconDelete"
          tooltip="Delete this shape"
          @click="removeRegion(region)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The region-CRUD half of the site map apparatus — split out of
 * `SiteMapView.vue` (#805 slice 2) once that file's canvas/calibration/
 * drag-to-paint rewrite pushed it past the 600-line soft max, and now
 * mounted by `LocationMap.vue` (#807, once `SiteMapView` itself was
 * deleted). This owns creating, binding, labelling and deleting regions;
 * the canvas (`MapRegionsLayer.vue`) keeps everything about painting cells
 * into whichever region is active.
 *
 * `activeRegionId` is lifted to the parent — it also drives the map canvas's
 * highlight and the "Tracing X" banner above it, neither of which this
 * component renders — so it travels as a prop + `update:activeRegionId`
 * rather than living here.
 */
import { computed } from "vue";
import { RouterLink } from "vue-router";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import { IconAdd, IconDelete } from "@/lib/icons";
import {
  useCreateLocationMapRegion,
  useDeleteLocationMapRegion,
  useUpdateLocationMapRegion,
} from "@/composables/locations/useLocationMapRegions";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import type { BindableSpace, LocationMapRegion } from "@/types/locationMapRegion.types";

const { locationId, spaces, regions, activeRegionId, canTrace } = defineProps<{
  /** The site these regions belong to — `createRegion` needs it as
   *  `site_location_id`. */
  locationId: string;
  /** Every child that can carry a shape on this map: a room, or a nested site
   *  (#818). The caller derives it, because deciding what counts is a tier
   *  question and this component only needs an id to bind and a name to show. */
  spaces: BindableSpace[];
  regions: LocationMapRegion[];
  activeRegionId: string | null;
  /** Whether the map has a grid to trace onto at all (`grid_calibration` is
   *  set) — the caller disables "Trace" rather than opening a tracing UI
   *  with nothing calibrated to paint on. */
  canTrace: boolean;
}>();

const emit = defineEmits<{ "update:activeRegionId": [id: string | null] }>();

const { confirm } = useConfirm();
const { error: toastError, fromError } = useToast();

const boundRegionBySpace = computed(() => {
  const map = new Map<string, LocationMapRegion>();
  for (const r of regions) if (r.space_location_id) map.set(r.space_location_id, r);
  return map;
});
const unboundRegions = computed(() => regions.filter((r) => !r.space_location_id));
// A space already claimed by a bound region can't take a second one — the
// partial unique index would reject it — so it's left out of the picker
// entirely rather than surfacing that as a toast after the fact.
const unclaimedSpaces = computed(() => spaces.filter((s) => !boundRegionBySpace.value.has(s.id)));

function toggleActive(id: string): void {
  emit("update:activeRegionId", activeRegionId === id ? null : id);
}

const createRegion = useCreateLocationMapRegion();
const updateRegion = useUpdateLocationMapRegion();
const deleteRegion = useDeleteLocationMapRegion();

async function addRegionForSpace(space: BindableSpace): Promise<void> {
  try {
    const created = await createRegion.mutateAsync({ site_location_id: locationId, space_location_id: space.id });
    emit("update:activeRegionId", created.id);
  } catch (e) {
    toastError(fromError(e));
  }
}

async function addUnboundRegion(): Promise<void> {
  try {
    const created = await createRegion.mutateAsync({ site_location_id: locationId });
    emit("update:activeRegionId", created.id);
  } catch (e) {
    toastError(fromError(e));
  }
}

async function onBindSpace(region: LocationMapRegion, spaceId: string): Promise<void> {
  if (!spaceId) return;
  try {
    await updateRegion.mutateAsync({ id: region.id, update: { space_location_id: spaceId } });
  } catch (e) {
    toastError(fromError(e));
  }
}

async function unbind(region: LocationMapRegion): Promise<void> {
  try {
    await updateRegion.mutateAsync({ id: region.id, update: { space_location_id: null } });
  } catch (e) {
    toastError(fromError(e));
  }
}

async function removeRegion(region: LocationMapRegion): Promise<void> {
  const label = region.space_location_id
    ? (spaces.find((sp) => sp.id === region.space_location_id)?.name ?? "this space's shape")
    : (region.label || "this shape");
  const ok = await confirm(`Delete "${label}"? This cannot be undone.`, { danger: true });
  if (!ok) return;
  if (activeRegionId === region.id) emit("update:activeRegionId", null);
  try {
    await deleteRegion.mutateAsync(region.id);
  } catch (e) {
    toastError(fromError(e));
  }
}

function commitLabel(region: LocationMapRegion, value: string): void {
  const next = value.trim();
  if (next === (region.label ?? "")) return;
  updateRegion.mutate({ id: region.id, update: { label: next === "" ? null : next } });
}
</script>
