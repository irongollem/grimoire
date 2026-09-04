<template>
  <div class="flex flex-col gap-3">
    <!-- Placed entries -->
    <div v-if="placements?.length" class="flex flex-col gap-1.5">
      <div
        v-for="p in placements"
        :key="p.id"
        class="flex flex-col gap-1.5 rounded-md border border-border bg-card px-3 py-2"
      >
        <div class="flex items-center gap-2">
          <span
            class="inline-flex shrink-0 items-center gap-1 rounded bg-muted/40 px-1.5 py-0.5 font-cinzel text-2xs font-bold uppercase tracking-wide text-muted-foreground"
          >
            <component :is="KIND_ICON[kindOf(p)]" class="h-3 w-3" />
            {{ LOCATION_PLACEMENT_KIND_LABELS[kindOf(p)] }}
          </span>
          <RouterLink
            :to="hrefOf(p)"
            class="min-w-0 flex-1 truncate font-cinzel text-xs font-semibold text-foreground transition-colors hover:text-primary"
          >{{ nameOf(p) }}</RouterLink>
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
    <p v-else class="text-caption text-muted-foreground italic">Nothing prepared here yet.</p>

    <!-- Inline add -->
    <div class="flex flex-col gap-2 rounded-md border border-dashed border-border bg-background px-3 py-2">
      <SegmentedControl v-model="newKind" :options="KIND_OPTIONS" size="xs" block />
      <div class="flex items-center gap-2">
        <EntityCombobox
          v-model="newEntityId"
          :options="pickerOptions"
          :placeholder="`Pick a ${LOCATION_PLACEMENT_KIND_LABELS[newKind].toLowerCase()}…`"
        />
        <AppButton
          variant="primary"
          size="sm"
          label="Add"
          class="shrink-0"
          :disabled="!newEntityId || isCreating"
          @click="addPlacement"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * "Prepared Here" — reusable prep material (traps, dungeon features, roll
 * tables, loot tables) anchored to this location via `location_placements`
 * (#788, epic #780). Unlike Store/Rooms there is no location-type gate: a
 * trap in a tavern's back room is exactly as valid as one in a dungeon
 * corridor, so `LocationDetailSections` mounts this for every location.
 *
 * Mirrors `StoreInventory` / `SiteRoomsPanel`'s shape — self-contained,
 * always-editable, keyed off a `locationId` prop rather than a route param
 * so `AtlasPlacePane` can reuse one mounted instance across selections.
 *
 * The kind (trap / dungeon_feature / roll_table / loot_table) is never
 * stored — it's derived from which of the four exclusive-arc FK columns is
 * set, via `placementKind`. Deleting a row here unlinks the entity from this
 * room; it does not delete the trap/feature/table itself.
 */
import { computed, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";
import type { SegmentedOption } from "@/components/common/SegmentedControl.vue";
import { IconClose, IconDungeon, IconLoot, IconTable, IconTrap } from "@/lib/icons";
import { useToast } from "@/composables/useToast";
import {
  useLocationPlacements,
  useCreateLocationPlacement,
  useUpdateLocationPlacement,
  useDeleteLocationPlacement,
} from "@/composables/locations/useLocationPlacements";
import type { LocationPlacementWithEntity } from "@/composables/locations/useLocationPlacements";
import { useTraps } from "@/composables/dungeon-features/useTraps";
import { useDungeonFeatures } from "@/composables/dungeon-features/useDungeonFeatures";
import { useRollTables } from "@/composables/dungeon-features/useRollTables";
import { useLootTables } from "@/composables/dungeon-features/useLootTables";
import { LOCATION_PLACEMENT_KIND_LABELS, placementKind } from "@/types/locationPlacement.types";
import type { LocationPlacementInsert, LocationPlacementKind } from "@/types/locationPlacement.types";

const { locationId } = defineProps<{ locationId: string }>();

const locationIdRef = computed(() => locationId);
const { data: placements } = useLocationPlacements(locationIdRef);

const toast = useToast();

// ── Display ─────────────────────────────────────────────────────────────────────
const KIND_ICON = {
  trap: IconTrap,
  dungeon_feature: IconDungeon,
  roll_table: IconTable,
  loot_table: IconLoot,
} as const;

const KIND_OPTIONS: SegmentedOption<LocationPlacementKind>[] = [
  { value: "trap", label: "Trap", icon: IconTrap },
  { value: "dungeon_feature", label: "Feature", icon: IconDungeon },
  { value: "roll_table", label: "Roll Table", icon: IconTable },
  { value: "loot_table", label: "Loot Table", icon: IconLoot },
];

function kindOf(p: LocationPlacementWithEntity): LocationPlacementKind {
  return placementKind(p);
}

function nameOf(p: LocationPlacementWithEntity): string {
  switch (kindOf(p)) {
    case "trap": return p.trap?.name ?? "???";
    case "dungeon_feature": return p.dungeon_feature?.name ?? "???";
    case "roll_table": return p.roll_table?.name ?? "???";
    case "loot_table": return p.loot_table?.name ?? "???";
  }
}

// Roll tables have no dedicated detail route today — `/roll-tables/:id`
// redirects into the Dungeon Craft hub's Roll Tables tab, same as the
// generator panel's own post-create navigation (RollTableGeneratorPanel).
function hrefOf(p: LocationPlacementWithEntity): string {
  switch (kindOf(p)) {
    case "trap": return `/traps/${p.trap_id}`;
    case "dungeon_feature": return `/dungeon-features/${p.dungeon_feature_id}`;
    case "roll_table": return `/roll-tables/${p.roll_table_id}`;
    case "loot_table": return `/loot-tables/${p.loot_table_id}`;
  }
}

// ── Add ─────────────────────────────────────────────────────────────────────────
// Default (browsing) scope for the picker — general + active campaign, same
// as EncounterTraps' `pickableTraps`. Names are resolved for already-placed
// rows via the composable's own embed, which is unaffected by scope.
const { data: pickableTraps } = useTraps();
const { data: dungeonFeatures } = useDungeonFeatures();
const { data: pickableRollTables } = useRollTables();
const { data: pickableLootTables } = useLootTables();

const newKind = ref<LocationPlacementKind>("trap");
const newEntityId = ref("");

watch(newKind, () => { newEntityId.value = ""; });

/** Ids already placed here, per kind — filtered out of the picker so the DM
 *  never hits the (location_id, <kind>_id) unique constraint from the UI. */
const existingIdsByKind = computed(() => {
  const sets: Record<LocationPlacementKind, Set<string>> = {
    trap: new Set(),
    dungeon_feature: new Set(),
    roll_table: new Set(),
    loot_table: new Set(),
  };
  for (const p of placements.value ?? []) {
    const kind = kindOf(p);
    const id = p.trap_id ?? p.dungeon_feature_id ?? p.roll_table_id ?? p.loot_table_id;
    if (id) sets[kind].add(id);
  }
  return sets;
});

// Typed as the shape EntityCombobox actually needs, not the four concrete
// entity types — a bare union of those (Trap[] | DungeonFeature[] | ...)
// isn't assignable to a single generic T, since TS infers T from whichever
// branch it happens to look at first rather than unioning across cases.
const pickerOptions = computed<Array<{ id: string; name: string }>>(() => {
  const existing = existingIdsByKind.value[newKind.value];
  switch (newKind.value) {
    case "trap": return (pickableTraps.value ?? []).filter((t) => !existing.has(t.id));
    case "dungeon_feature": return (dungeonFeatures.value ?? []).filter((f) => !existing.has(f.id));
    case "roll_table": return (pickableRollTables.value ?? []).filter((t) => !existing.has(t.id));
    case "loot_table": return (pickableLootTables.value ?? []).filter((t) => !existing.has(t.id));
    default: return [];
  }
});

function buildInsert(kind: LocationPlacementKind, entityId: string): LocationPlacementInsert {
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
  if (!newEntityId.value) return;
  createPlacement(buildInsert(newKind.value, newEntityId.value), {
    onSuccess: () => { newEntityId.value = ""; },
    onError: (e) => toast.error(toast.fromError(e)),
  });
}

// ── Note ────────────────────────────────────────────────────────────────────────
const { mutate: updatePlacement } = useUpdateLocationPlacement(locationIdRef);

function onNoteCommit(p: LocationPlacementWithEntity, value: string) {
  const next = value.trim() || null;
  if (next !== p.note) {
    updatePlacement({ id: p.id, update: { note: next } }, { onError: (e) => toast.error(toast.fromError(e)) });
  }
}

// ── Remove ──────────────────────────────────────────────────────────────────────
const { mutate: deletePlacement } = useDeleteLocationPlacement(locationIdRef);

function removePlacement(id: string) {
  deletePlacement(id, { onError: (e) => toast.error(toast.fromError(e)) });
}
</script>
