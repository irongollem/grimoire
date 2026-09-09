<template>
  <div class="flex flex-col gap-3 rounded-xl border border-tone-info bg-card p-4">
    <div class="flex flex-wrap items-center gap-1.5">
      <span class="inline-flex items-center gap-1.5 rounded bg-tone-info/15 px-1.5 py-0.5 text-label uppercase text-ink-info">
        <span class="relative flex h-1.5 w-1.5">
          <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-tone-info opacity-75" />
          <span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-tone-info" />
        </span>
        Party here
      </span>
    </div>
    <h2 class="font-cinzel text-base font-bold text-foreground">{{ room.name }}</h2>

    <section v-if="hasDescription" class="rounded-lg border border-primary/30 bg-primary/5 p-4">
      <h3 class="mb-2 font-cinzel text-sm font-bold text-primary">Read aloud</h3>
      <RichTextViewer :content="room.description" />
    </section>
    <p v-else class="text-caption italic text-muted-foreground">Nothing written for this room yet.</p>

    <div v-if="promptRows.length" class="flex flex-col gap-1.5">
      <PlacementRow v-for="row in promptRows" :key="row.id" :to="linkFor(row)" :name="row.label">
        <template #badge>
          <component :is="iconFor(row)" class="h-3.5 w-3.5 shrink-0" :class="colourFor(row)" aria-hidden="true" />
        </template>
        <template #actions>
          <AppButton v-if="row.kind === 'trap'" size="xs" variant="tinted" tone="danger" :icon="IconTrap" label="Trigger" :to="row.target" />
          <AppButton v-else-if="row.kind === 'encounter'" size="xs" variant="tinted" tone="caution" :icon="IconEncounter" label="Run" :to="row.target" />
          <AppButton
            v-else-if="row.kind === 'hidden'"
            size="xs"
            variant="tinted"
            tone="arcane"
            :icon="IconHide"
            label="Reveal"
            :loading="revealingDoorIds.has(row.target)"
            @click="reveal(row)"
          />
          <AppButton v-else size="xs" variant="tinted" tone="info" :icon="IconDice" label="Roll" @click="roll(row)" />
        </template>
        <p class="text-caption text-muted-foreground">{{ row.subtitle }}</p>
        <RollTableResult v-if="row.kind === 'roll_table' && lastRoll[row.id]" :result="lastRoll[row.id]!" />
      </PlacementRow>
    </div>

    <LocationLootPanel v-if="campaignId" :location-id="room.id" :campaign-id="campaignId" :loot="loot" />

    <p class="text-caption text-muted-foreground">Prompts, not automation — Trigger, Run, Reveal, Roll and Drop are all buttons. Nothing on this surface fires because a token moved.</p>
  </div>
</template>

<script setup lang="ts">
/**
 * Frame 11 "What the DM reads when the party enters a room" — the room's own
 * stack, reusing the beat's presentation pieces per the maintainer's framing
 * for this story: the room's description IS its read-aloud, its placements
 * ARE its attachments (`buildRoomStack`, `lib/locations/roomStack.ts`), and
 * its payoff uses the same `LootPlacementList` a beat's payoff panel does —
 * via `LocationLootPanel`, which also keeps the loot-prepare form reachable
 * (rolling a chest into a room is something only a room can do).
 *
 * Every row here already exists somewhere else in the app — a trap's own
 * page, an encounter's run route, a door's found/unlocked fact, a roll
 * table's entries. This component doesn't own any of that data twice; it
 * only decides which of it belongs to THIS room and lays it out as one
 * stack, per the frame's own note: "the room is what finally puts them in
 * one stack."
 *
 * Loot rows from `buildRoomStack` are deliberately not rendered here even
 * though the pure module produces them: dropping loot needs the full
 * `LootPlacement` object (delivery state, claims, chat link) that a generic
 * row can't carry, and `LocationLootPanel` already owns that interaction —
 * so the loot kind exists in the pure module for completeness and testing,
 * and is filtered out of `promptRows` in favour of mounting the real thing.
 */
import { computed, reactive } from "vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import AppButton from "@/components/common/AppButton.vue";
import PlacementRow from "@/components/locations/PlacementRow.vue";
import LocationLootPanel from "@/components/locations/LocationLootPanel.vue";
import RollTableResult from "@/components/dungeon-features/RollTableResult.vue";
import { IconDice, IconEncounter, IconHide, IconTrap } from "@/lib/icons";
import { useLocationPlacements } from "@/composables/locations/useLocationPlacements";
import { useTraps } from "@/composables/dungeon-features/useTraps";
import { useDungeonFeatures } from "@/composables/dungeon-features/useDungeonFeatures";
import { useEncounters } from "@/composables/encounters/useEncounters";
import { useRollTables } from "@/composables/dungeon-features/useRollTables";
import { useAssertDoorState } from "@/composables/locations/useLocationState";
import { useToast } from "@/composables/useToast";
import { rollOnTable, type RollTableRollResult } from "@/lib/dungeon-features/rollTableRoll";
import { buildRoomStack } from "@/lib/locations/roomStack";
import type { RoomStackRow } from "@/lib/locations/roomStack";
import { doorsOfSpace } from "@/lib/locations/doors";
import { extractTiptapText } from "@/lib/utils";
import type { SiteDoorWithSpaces } from "@/composables/locations/useSiteDoors";
import type { DoorStateFact, LocationState } from "@/types/locationState.types";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";
import type { LootPlacement } from "@/types/quest.types";
import type { Location } from "@/types/location.types";

const { siteId, room, regions, doors, doorState, loot, campaignId } = defineProps<{
  siteId: string;
  room: Location;
  /** The whole site's regions — space + zone — same set `LocationMap.vue`
   *  already holds for `MapRegionsLayer`. */
  regions: LocationMapRegion[];
  /** The whole site's doors, from `useSiteDoors` — `SiteRunSurface` already
   *  fetches this once for the map and `SiteRunWaysOut`. */
  doors: SiteDoorWithSpaces[];
  doorState: (doorId: string, fact: DoorStateFact) => LocationState | undefined;
  /** This room's own loot. */
  loot: LootPlacement[];
  campaignId: string | null;
}>();

const roomIdRef = computed(() => room.id);
const { data: roomPlacements } = useLocationPlacements(roomIdRef);
const { data: traps } = useTraps();
const { data: features } = useDungeonFeatures();
const { data: encounters } = useEncounters();
const { data: rollTables } = useRollTables();

const roomRegion = computed(() => regions.find((r) => r.region_role === "space" && r.space_location_id === room.id));
const zones = computed(() => regions.filter((r) => r.region_role === "zone"));
const roomDoors = computed(() => doorsOfSpace(doors, room.id).map((view) => view.door));

const rows = computed<RoomStackRow[]>(() =>
  buildRoomStack({
    roomId: room.id,
    placements: roomPlacements.value ?? [],
    traps: traps.value ?? [],
    features: features.value ?? [],
    encounters: encounters.value ?? [],
    zones: zones.value,
    roomRegion: roomRegion.value,
    doors: roomDoors.value,
    doorFound: (doorId) => doorState(doorId, "found")?.value === true,
    loot,
  }),
);
// Loot has its own richer surface (`LocationLootPanel`, below) — see the
// docstring for why the pure module's loot rows aren't rendered as generic
// prompts here.
const promptRows = computed(() => rows.value.filter((row) => row.kind !== "loot"));

const hasDescription = computed(() => extractTiptapText(room.description, 1).length > 0);

function iconFor(row: RoomStackRow) {
  return { trap: IconTrap, encounter: IconEncounter, hidden: IconHide, roll_table: IconDice, loot: IconDice }[row.kind];
}
function colourFor(row: RoomStackRow): string {
  return {
    trap: "text-tone-danger",
    encounter: "text-tone-caution",
    hidden: "text-tone-arcane",
    roll_table: "text-tone-info",
    loot: "text-tone-info",
  }[row.kind];
}
function linkFor(row: RoomStackRow): string {
  // Trap and encounter rows point at a real entity page; a hidden thing has
  // no page of its own (a secret door isn't a first-class route) and a roll
  // table's own route just redirects into Dungeon Craft — for both, the
  // room's own sheet is a safe, always-valid fallback rather than a link to
  // nowhere.
  if (row.kind === "trap" || row.kind === "encounter") return row.target;
  if (row.kind === "roll_table") return `/roll-tables/${row.target}`;
  return `/locations/${room.id}`;
}

// ── Reveal — asserts the door's `found` fact; nothing about the door's
//    authored `is_secret`/prep changes. ─────────────────────────────────────
const toast = useToast();
const { mutate: assertDoor } = useAssertDoorState();
// A `Set` rather than one shared ref — two hidden doors can be revealed in
// the same room at once, and clearing a single shared id on settle would
// clear whichever door happened to resolve first, not the one that just did
// (the same guard `SiteRunWaysOut`'s `pendingDoorIds` and `MapRegionsLayer`'s
// `pendingStroke` use).
const revealingDoorIds = reactive(new Set<string>());

function reveal(row: RoomStackRow): void {
  revealingDoorIds.add(row.target);
  assertDoor(
    { location_id: siteId, door_id: row.target, fact: "found", value: true },
    {
      onSuccess: () => { revealingDoorIds.delete(row.target); },
      onError: (e) => { revealingDoorIds.delete(row.target); toast.error(toast.fromError(e)); },
    },
  );
}

// ── Roll — client-side, same `rollOnTable` the roll-table widget uses; the
//    result is local UI state, not persisted, same reasoning as that
//    widget's own docstring. ────────────────────────────────────────────────
const lastRoll = reactive<Record<string, RollTableRollResult | undefined>>({});
function roll(row: RoomStackRow): void {
  const table = (rollTables.value ?? []).find((t) => t.id === row.target);
  if (!table) return;
  lastRoll[row.id] = rollOnTable(table);
}
</script>
