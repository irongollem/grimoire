<template>
  <section v-if="children.length" class="flex flex-col gap-3">
    <div class="flex items-center justify-between">
      <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">
        Sort Into {{ spaceHeadingText }}
        <span v-if="rows.length" class="font-fell font-normal text-muted-foreground">({{ rows.length }})</span>
      </h2>
    </div>

    <p v-if="rows.length && unsortedCount > 0" class="text-caption text-muted-foreground">
      {{ unsortedCount }} of {{ rows.length }} still on {{ ownName }}, waiting to be placed.
    </p>
    <p v-else-if="rows.length" class="text-caption text-muted-foreground">Everyone is placed.</p>
    <p v-else class="text-caption text-muted-foreground italic">
      Nothing homed here or in its {{ spacePlural }} yet.
    </p>

    <div v-if="rows.length" class="flex flex-col gap-1.5">
      <div
        v-for="row in rows"
        :key="`${row.kind}-${row.id}`"
        class="flex flex-col gap-1.5 rounded-md border border-border bg-card px-3 py-2"
      >
        <div class="flex items-center gap-2">
          <component
            :is="row.kind === 'npc' ? IconUser : IconEncounter"
            class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <RouterLink
            :to="hrefOf(row)"
            class="min-w-0 flex-1 truncate font-cinzel text-xs font-semibold text-foreground transition-colors hover:text-primary"
          >{{ row.name }}</RouterLink>
          <span v-if="row.kind === 'encounter' && row.is_finished" class="shrink-0 text-label text-muted-foreground">Done</span>
          <!-- The whole point of this panel: a row still homed on the parent
               itself is the backlog, so it earns the one coloured mark on an
               otherwise quiet list. -->
          <span
            v-if="row.location_id === locationId"
            class="shrink-0 rounded bg-tone-caution/15 px-1.5 py-0.5 text-2xs font-medium text-ink-caution"
          >{{ needsLabel }}</span>
        </div>

        <!-- Build only (same `authoring` reasoning as Ways out / Prepared Here
             — see LocationDetailSections). Browse shows where it already sits,
             read-only. -->
        <EntityCombobox
          v-if="building"
          :model-value="row.location_id"
          :options="targets"
          placeholder="Move to…"
          @update:model-value="(id) => move(row, id)"
        />
        <p v-else class="text-caption-sm text-muted-foreground italic">{{ targetNameOf(row.location_id) }}</p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * The re-homing backlog #879 asked for: NPCs and encounters get assigned to a
 * site while it is still one place, the rooms get built afterwards, and every
 * one of them then sits one level too coarse until a DM manually re-homes it.
 * Production measured 125 NPCs and 11 encounters stuck this way across 74
 * places, worst case a site with 8 rooms and 8 encounters still on it.
 *
 * This is the list, not the drag (#879 settles that the drag comes later, on
 * this same data) — sorting a dozen names into a handful of rooms is faster
 * as a picker per row than a shape you have to aim a name at, at every screen
 * size. Renders only when the place actually has children to sort into: an
 * empty place has nothing for this panel to offer.
 *
 * Scope is deliberately narrower than "People in the Area" / "Encounters
 * Here" above (which read the whole subtree, read-only, for browsing) — this
 * reads only this place plus its *direct* children, because a picker can only
 * ever move something one level, from the parent into a room, not arbitrarily
 * deep. The two pairs of sections coexist on purpose; this one is the editable
 * backlog, those stay the read-only "what's around here" view.
 *
 * Mirrors `SiteRoomsPanel` / `LocationPlacements`'s shape: self-contained,
 * keyed off a `locationId` prop rather than a route param, doing its own
 * queries, so `AtlasPlacePane` can reuse one mounted instance across
 * selections the same way those do.
 */
import { computed } from "vue";
import { RouterLink } from "vue-router";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import { IconEncounter, IconUser } from "@/lib/icons";
import { useToast } from "@/composables/useToast";
import { useLocation, useLocations } from "@/composables/locations/useLocations";
import { useNpcsByLocations, useUpdateNpc } from "@/composables/npcs/useNpcs";
import { useEncountersByLocations, useUpdateEncounter } from "@/composables/encounters/useEncounters";
import { childSpaceType, spaceHeading, spaceNoun } from "@/lib/locations/tiers";

const { locationId, building = false } = defineProps<{
  locationId: string;
  /** Build mode (#884) — same `authoring` predicate LocationDetailSections
   *  threads to Ways out and Prepared Here. Browse shows every row's current
   *  room, read-only, rather than the picker. */
  building?: boolean;
}>();

const toast = useToast();

// ── This place's own name (for the "still on X" line and as one of the
//    picker's own targets) and its direct children (the rest of the targets,
//    and the gate on whether this panel has anything to offer at all). ──────
const { data: locationData } = useLocation(computed(() => locationId));
const ownName = computed(() => locationData.value?.name ?? "this place");

const { data: childrenData } = useLocations(computed(() => locationId));
const children = computed(() => childrenData.value ?? []);

/**
 * The noun for a child place follows this place's own type — see
 * `childSpaceType`'s docstring for the rule (#886).
 *
 * This panel sits directly beneath `SiteRoomsPanel` on the page, so a heading
 * saying "Rooms" under one saying "Grounds" is visible in a single glance —
 * which is why this is worth a computed rather than being left to the wider
 * wording sweep in #887.
 */
const spaceHeadingText = computed(() => spaceHeading(locationData.value?.location_type));
const spaceNounPair = computed(() => spaceNoun(locationData.value?.location_type));
const spacePlural = computed(() => spaceNounPair.value.plural);
// "grounds" takes no article ("Needs grounds"); "room" does ("Needs a room") —
// the article itself isn't part of `spaceNoun`'s pair, so it stays a small
// branch here, keyed off the single source of truth rather than a fresh
// `location_type === "wilds"` check.
const needsLabel = computed(() =>
  childSpaceType(locationData.value?.location_type) === "grounds" ? "Needs grounds" : "Needs a room",
);

/** Where a row can be moved to: this place itself (the "still needs sorting"
 *  state) plus every direct child. `EntityCombobox` only needs {id, name},
 *  which every `Location` already satisfies. */
const targets = computed<{ id: string; name: string }[]>(() => {
  const self = locationData.value ? [{ id: locationData.value.id, name: locationData.value.name }] : [];
  return [...self, ...children.value];
});

function targetNameOf(id: string): string {
  return targets.value.find((t) => t.id === id)?.name ?? "???";
}

// ── The rows: NPCs and encounters homed at this place or one of its
//    children. `.in("location_id", ids)` never returns a null location_id, so
//    the type-guard filters below are defensive rather than load-bearing —
//    but they mean a row that somehow arrived without one is quietly excluded
//    from a sortable list instead of crashing it or lying about where it is. ─
const targetIds = computed(() => [locationId, ...children.value.map((c) => c.id)]);
const { data: npcsData } = useNpcsByLocations(targetIds);
const { data: encountersData } = useEncountersByLocations(targetIds);

interface NpcSortRow {
  kind: "npc";
  id: string;
  name: string;
  location_id: string;
}
interface EncounterSortRow {
  kind: "encounter";
  id: string;
  name: string;
  location_id: string;
  is_finished: boolean;
}
type SortRow = NpcSortRow | EncounterSortRow;

function hasLocation<T extends { location_id: string | null }>(row: T): row is T & { location_id: string } {
  return row.location_id !== null;
}

const rows = computed<SortRow[]>(() => {
  const npcRows: SortRow[] = (npcsData.value ?? [])
    .filter(hasLocation)
    .map((n) => ({ kind: "npc", id: n.id, name: n.name, location_id: n.location_id }));
  const encounterRows: SortRow[] = (encountersData.value ?? [])
    .filter(hasLocation)
    .map((e) => ({ kind: "encounter", id: e.id, name: e.name, location_id: e.location_id, is_finished: e.is_finished }));

  // The backlog first (still on the parent), each half alphabetical — this
  // panel exists to be cleared, so what needs attention leads the list.
  return [...npcRows, ...encounterRows].sort((a, b) => {
    const aUnsorted = a.location_id === locationId;
    const bUnsorted = b.location_id === locationId;
    if (aUnsorted !== bUnsorted) return aUnsorted ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
});

const unsortedCount = computed(() => rows.value.filter((r) => r.location_id === locationId).length);

function hrefOf(row: SortRow): string {
  return row.kind === "npc" ? `/npcs/${row.id}` : `/encounters/${row.id}`;
}

// ── Commit — immediate, per row, no save button (mirrors EncounterCombatants'
//    faction picker). An empty id is the combobox's own clear button; there is
//    no "unset" affordance here, so that is a no-op rather than a write. ──────
const { mutate: updateNpc } = useUpdateNpc();
const { mutate: updateEncounter } = useUpdateEncounter();

function move(row: SortRow, newLocationId: string) {
  if (!newLocationId || newLocationId === row.location_id) return;
  if (row.kind === "npc") {
    updateNpc(
      { id: row.id, update: { location_id: newLocationId } },
      { onError: (e) => toast.error(toast.fromError(e)) },
    );
  } else {
    updateEncounter(
      { id: row.id, update: { location_id: newLocationId } },
      { onError: (e) => toast.error(toast.fromError(e)) },
    );
  }
}
</script>
