<template>
  <div class="flex flex-col gap-2 rounded-md border border-dashed border-border bg-muted/40 px-3 py-2">
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
</template>

<script setup lang="ts">
/**
 * The "Prepared Here" add row (#788), split out of `LocationPlacements` so the
 * four pick lists it needs (traps, dungeon features, roll tables, loot
 * tables) are read when Build mounts it, not on every place the DM merely
 * selects (#972, story 11). The parent renders it in Build only.
 */
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";
import type { SegmentedOption } from "@/components/common/SegmentedControl.vue";
import { IconDungeon, IconLoot, IconTable, IconTrap } from "@/lib/icons";
import { useToast } from "@/composables/useToast";
import { useCreateLocationPlacement } from "@/composables/locations/useLocationPlacements";
import type { LocationPlacementWithEntity } from "@/composables/locations/useLocationPlacements";
import { useTraps } from "@/composables/dungeon-features/useTraps";
import { useDungeonFeatures } from "@/composables/dungeon-features/useDungeonFeatures";
import { useRollTables } from "@/composables/dungeon-features/useRollTables";
import { useLootTables } from "@/composables/dungeon-features/useLootTables";
import { LOCATION_PLACEMENT_KIND_LABELS, placementKind } from "@/types/locationPlacement.types";
import type { LocationPlacementInsert, LocationPlacementKind } from "@/types/locationPlacement.types";

const { locationId, placements } = defineProps<{
  locationId: string;
  /** What is already placed here, so the picker never offers a duplicate. */
  placements: readonly LocationPlacementWithEntity[];
}>();

const toast = useToast();

const KIND_OPTIONS: SegmentedOption<LocationPlacementKind>[] = [
  { value: "trap", label: "Trap", icon: IconTrap },
  { value: "dungeon_feature", label: "Feature", icon: IconDungeon },
  { value: "roll_table", label: "Roll Table", icon: IconTable },
  { value: "loot_table", label: "Loot Table", icon: IconLoot },
];

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
  for (const p of placements) {
    const kind = placementKind(p);
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
</script>
