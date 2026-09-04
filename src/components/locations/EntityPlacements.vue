<template>
  <div class="flex flex-col gap-3">
    <!-- Placed at -->
    <div v-if="placements?.length" class="flex flex-col gap-1.5">
      <div
        v-for="p in placements"
        :key="p.id"
        class="flex flex-col gap-1.5 rounded-md border border-border bg-card px-3 py-2"
      >
        <div class="flex items-center gap-2">
          <span
            v-if="p.location"
            class="inline-flex shrink-0 items-center rounded bg-muted/40 px-1.5 py-0.5 font-cinzel text-2xs font-bold uppercase tracking-wide text-muted-foreground"
          >{{ LOCATION_TYPE_LABELS[p.location.location_type] }}</span>
          <RouterLink
            :to="`/locations/${p.location_id}`"
            class="min-w-0 flex-1 truncate font-cinzel text-xs font-semibold text-foreground transition-colors hover:text-primary"
          >{{ p.location?.name ?? "???" }}</RouterLink>
          <AppButton
            variant="ghost"
            tone="danger"
            size="icon-xs"
            :icon="IconClose"
            tooltip="Remove from this location"
            class="shrink-0"
            @click="removePlacement(p.id)"
          />
        </div>
        <AppInput
          :model-value="p.note ?? ''"
          :model-modifiers="{ lazy: true }"
          type="text"
          tone="bare"
          size="xs"
          placeholder="Note — what it's doing in this room…"
          class="px-0 text-caption"
          @update:model-value="(value) => onNoteCommit(p, value as string)"
        />
      </div>
    </div>
    <p v-else class="text-caption text-muted-foreground italic">Not placed anywhere yet.</p>

    <!-- Inline add -->
    <div class="flex flex-col gap-2 rounded-md border border-dashed border-border bg-background px-3 py-2">
      <div class="flex items-center gap-2">
        <EntityCombobox
          v-model="newLocationId"
          :options="locationPickerOptions"
          placeholder="Pick a location…"
        >
          <template #option="{ opt }">
            <span :style="{ paddingLeft: `${(opt as LocationOption).depth * 12}px` }">{{ opt.name }}</span>
          </template>
        </EntityCombobox>
        <AppButton
          variant="primary"
          size="sm"
          label="Place here"
          class="shrink-0"
          :disabled="!newLocationId || isCreating"
          @click="addPlacement"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * "Placed In" — the reverse of `LocationPlacements` (#802, following #788).
 * Mounted on a trap / dungeon feature / roll table / loot table's own sheet
 * so a DM authoring the entity can see every room it's already in and drop
 * it into a new one without navigating to that room first.
 *
 * Self-contained and keyed off scalar props exactly like `LocationPlacements`
 * / `LocationDoors` — `kind` is fixed per call site (a trap sheet always
 * passes `"trap"`), `entityId` is the entity's own id.
 *
 * The insert policy on `location_placements` requires the entity to be the
 * caller's, not just the location (a security-audit fix, F9) — reading this
 * entity's own sheet at all already means the caller owns it, so nothing
 * here needs to re-check that; a rejection from the DB still surfaces as a
 * toast rather than being pre-validated client-side.
 */
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import { IconClose } from "@/lib/icons";
import { useToast } from "@/composables/useToast";
import {
  useEntityPlacements,
  useCreateLocationPlacement,
  useUpdateEntityPlacement,
  useDeleteEntityPlacement,
} from "@/composables/locations/useLocationPlacements";
import type { LocationPlacementWithLocation } from "@/composables/locations/useLocationPlacements";
import { useLocationTree } from "@/composables/locations/useLocations";
import type { LocationPlacementInsert, LocationPlacementKind } from "@/types/locationPlacement.types";
import { LOCATION_TYPE_LABELS } from "@/types/location.types";
import type { Location } from "@/types/location.types";

const { kind, entityId } = defineProps<{ kind: LocationPlacementKind; entityId: string }>();

const entityIdRef = computed(() => entityId);
const { data: placements } = useEntityPlacements(kind, entityIdRef);

const toast = useToast();

// ── Add ─────────────────────────────────────────────────────────────────────────
type LocationOption = Location & { depth: number };
const { locationOptions } = useLocationTree();

/** Locations this entity is already placed in — filtered out of the picker so
 *  the DM never hits the (location_id, <kind>_id) unique constraint from the UI. */
const existingLocationIds = computed(() => new Set((placements.value ?? []).map((p) => p.location_id)));

const locationPickerOptions = computed<LocationOption[]>(() =>
  locationOptions.value.filter((l) => !existingLocationIds.value.has(l.id)),
);

const newLocationId = ref("");

function buildInsert(locationId: string): LocationPlacementInsert {
  const base = { location_id: locationId };
  switch (kind) {
    case "trap": return { ...base, trap_id: entityId };
    case "dungeon_feature": return { ...base, dungeon_feature_id: entityId };
    case "roll_table": return { ...base, roll_table_id: entityId };
    case "loot_table": return { ...base, loot_table_id: entityId };
  }
}

const { mutate: createPlacement, isPending: isCreating } = useCreateLocationPlacement();

function addPlacement() {
  if (!newLocationId.value) return;
  createPlacement(buildInsert(newLocationId.value), {
    onSuccess: () => { newLocationId.value = ""; },
    onError: (e) => toast.error(toast.fromError(e)),
  });
}

// ── Note ────────────────────────────────────────────────────────────────────────
const { mutate: updatePlacement } = useUpdateEntityPlacement();

function onNoteCommit(p: LocationPlacementWithLocation, value: string) {
  const next = value.trim() || null;
  if (next !== p.note) {
    updatePlacement({ id: p.id, update: { note: next } }, { onError: (e) => toast.error(toast.fromError(e)) });
  }
}

// ── Remove ──────────────────────────────────────────────────────────────────────
const { mutate: deletePlacement } = useDeleteEntityPlacement();

function removePlacement(id: string) {
  deletePlacement(id, { onError: (e) => toast.error(toast.fromError(e)) });
}
</script>
