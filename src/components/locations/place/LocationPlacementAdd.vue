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
 * five pick lists it needs (traps, dungeon features, roll tables, loot
 * tables, notice boards) are read when Build mounts it, not on every place the DM merely
 * selects (#972, story 11). The parent renders it in Build only.
 */
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import type { SegmentedOption } from "@/components/common/controls/SegmentedControl.vue";
import { IconDungeon, IconLoot, IconNoticeBoard, IconTable, IconTrap } from "@/lib/icons";
import { useToast } from "@/composables/useToast";
import { useCreateLocationPlacement } from "@/composables/locations/useLocationPlacements";
import type { LocationPlacementWithEntity } from "@/composables/locations/useLocationPlacements";
import { useTrapIndex } from "@/composables/dungeon-features/useTraps";
import { useDungeonFeatureIndex } from "@/composables/dungeon-features/useDungeonFeatures";
import { placementColumnFor, placementTargetId } from "@/lib/dungeon-features/library";
import { useRollTables } from "@/composables/dungeon-features/useRollTables";
import { useLootTables } from "@/composables/dungeon-features/useLootTables";
import { useNoticeBoards } from "@/composables/noticeBoards/useNoticeBoards";
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
  { value: "notice_board", label: "Notice Board", icon: IconNoticeBoard },
];

// Default (browsing) scope for the picker — general + active campaign, same
// as EncounterTraps' `pickableTraps`. Names are resolved for already-placed
// rows via the composable's own embed, which is unaffected by scope.
// The index offers library rows beside the DM's own (an own row of the same name
// hides the library one), so a library trap is placed by reference.
const { data: pickableTraps } = useTrapIndex();
const { data: dungeonFeatures } = useDungeonFeatureIndex();
const { data: pickableRollTables } = useRollTables();
const { data: pickableLootTables } = useLootTables();
// Boards are read for the active campaign only, which is the one place a board may hang (#1064).
const { data: pickableNoticeBoards } = useNoticeBoards();

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
    notice_board: new Set(),
  };
  for (const p of placements) {
    const kind = placementKind(p);
    const id = placementTargetId(p) ?? p.roll_table_id ?? p.loot_table_id ?? p.notice_board_id;
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
    case "notice_board": return (pickableNoticeBoards.value ?? []).filter((b) => !existing.has(b.id));
    default: return [];
  }
});

function buildInsert(kind: LocationPlacementKind, entityId: string): LocationPlacementInsert {
  const base = { location_id: locationId };
  switch (kind) {
    case "trap": return { ...base, [placementColumnFor("trap", entityId)]: entityId };
    case "dungeon_feature": return { ...base, [placementColumnFor("dungeon_feature", entityId)]: entityId };
    case "roll_table": return { ...base, roll_table_id: entityId };
    case "loot_table": return { ...base, loot_table_id: entityId };
    case "notice_board": return { ...base, notice_board_id: entityId };
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
