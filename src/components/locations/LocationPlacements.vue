<template>
  <div class="flex flex-col gap-3">
    <!-- Placed entries -->
    <div v-if="placements?.length" class="flex flex-col gap-1.5">
      <PlacementRow v-for="p in placements" :key="p.id" :to="hrefOf(p)" :name="nameOf(p)">
        <template #badge>
          <span
            class="inline-flex shrink-0 items-center gap-1 rounded bg-muted/40 px-1.5 py-0.5 text-eyebrow font-bold text-muted-foreground"
          >
            <component :is="KIND_ICON[kindOf(p)]" class="h-3 w-3" />
            {{ LOCATION_PLACEMENT_KIND_LABELS[kindOf(p)] }}
          </span>
          <!-- #868 S8, frame 10: the only addition a cell-anchored placement
               needs — `source_cell_key` being non-null IS "from map". -->
          <span
            v-if="p.source_cell_key"
            class="inline-flex shrink-0 items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-2xs font-medium text-primary"
            :title="`Placed on the map at cell ${p.source_cell_key}`"
          >
            <IconMap class="h-3 w-3" />
            from map
          </span>
          <!-- #868, frame 10: the honest counterpart to "from map" — this
               entry is prepared for the room, with no position on the plan. -->
          <span
            v-else
            class="inline-flex shrink-0 items-center gap-1 rounded bg-muted/40 px-1.5 py-0.5 text-2xs font-medium text-muted-foreground"
            title="Prepared for this room, with no position on the map"
          >
            room
          </span>
        </template>
        <template #actions>
          <AppButton
            v-if="building"
            variant="ghost"
            tone="danger"
            size="icon-xs"
            :icon="IconClose"
            tooltip="Remove from this location"
            class="shrink-0"
            @click="removePlacement(p.id)"
          />
        </template>
        <p v-if="p.source_cell_key" class="text-caption-sm text-muted-foreground italic">
          cell {{ p.source_cell_key }}
        </p>
        <PlacementNoteInput
          v-if="building"
          :model-value="p.note"
          placeholder="Note: what it's doing in this room…"
          @commit="(value) => onNoteCommit(p, value)"
        />
        <p v-else-if="p.note" class="text-caption-sm text-muted-foreground italic">{{ p.note }}</p>
      </PlacementRow>
    </div>
    <p v-else class="text-caption text-muted-foreground italic">
      {{ building ? "Nothing prepared here yet." : "Nothing prepared here yet. Build the site to add something." }}
    </p>

    <!-- Inline add — Build only, and its own component so the four pick lists
         it reads (traps, features, roll tables, loot tables) are fetched when
         Build opens it, not whenever a place is merely browsed (#972). -->
    <LocationPlacementAdd v-if="building" :location-id="locationId" :placements="placements ?? []" />
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
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import PlacementNoteInput from "@/components/locations/PlacementNoteInput.vue";
import PlacementRow from "@/components/locations/PlacementRow.vue";
import LocationPlacementAdd from "@/components/locations/LocationPlacementAdd.vue";
import { IconClose, IconDungeon, IconLoot, IconMap, IconTable, IconTrap } from "@/lib/icons";
import { useToast } from "@/composables/useToast";
import {
  useLocationPlacements,
  useUpdateLocationPlacement,
  useDeleteLocationPlacement,
} from "@/composables/locations/useLocationPlacements";
import type { LocationPlacementWithEntity } from "@/composables/locations/useLocationPlacements";
import { LOCATION_PLACEMENT_KIND_LABELS, placementKind } from "@/types/locationPlacement.types";
import type { LocationPlacementKind } from "@/types/locationPlacement.types";

const { locationId, building = false } = defineProps<{
  locationId: string;
  /** Build mode (#884) — gates the add picker, note editing, and remove.
   *  Browse still shows every placed entry (it links out regardless) plus
   *  any already-written note, read-only. */
  building?: boolean;
}>();

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
