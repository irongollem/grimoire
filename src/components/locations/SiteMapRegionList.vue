<template>
  <!-- Spaces (#868, frame 03) — every addressable space of this site (a
       room, or a nested site with its own floor plan, #818), whether or not
       it has a region yet, so the site is usable before it is fully traced.
       Titled "Spaces" rather than "Space shapes" now that it sits beside
       `SiteMapZoneList` under the same layer-bar vocabulary.
       Deliberately NOT called "Rooms": `SiteRoomsPanel` owns rooms themselves
       (order, add, rename, delete) further down the same place's page. Two
       sections reading "Rooms" is the duplication #783 removed from the
       Atlas tree, re-created by accident. This list is about each space's
       *shape on the map*, which is a different thing, and naming it so
       makes the relationship informative instead of confusing.
       Read in Browse (the sheet, the Atlas pane); binding, naming and
       deleting a shape stay panel actions here in Build too (#884 S11), now
       mounted alongside `MapWorkbench`'s Plan palette — which owns HOW a
       trace gesture unfolds (paint/pen/template, its own switcher shown the
       moment `planTool` picks Space or Zone) so this panel doesn't need a
       second copy of that picker. -->
  <div class="flex flex-col gap-1.5">
    <!-- Frame 03 "Spaces panel header: icon + 'Spaces' + count chip + Trace
         button" — the same header treatment as `SiteMapZoneList`'s, with the
         one action a new region ever needs: start tracing an untitled shape
         (what "New shape" did below, before this moved up to be the panel's
         only creation control). -->
    <div class="flex flex-wrap items-center gap-2">
      <IconGridView class="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span class="text-label-lg font-semibold text-muted-foreground">Spaces</span>
      <span class="rounded-full bg-muted px-2 py-0.5 text-label font-semibold text-muted-foreground">{{ spaces.length }}</span>
      <!-- The door tool (#884) — a site-wide plan tool, not tied to a
           particular traced shape, so it lives beside "Trace" rather than in
           the region-scoped switcher below. Mutually exclusive with tracing
           is enforced by `LocationMap.vue`, which owns both booleans. -->
      <AppButton
        v-if="building"
        variant="ghost"
        size="inline-xs"
        class="ml-auto"
        :icon="IconDoor"
        label="Doors"
        :active="doorToolArmed"
        tooltip="Click an edge on the plan to place a door there"
        @click="emit('update:doorToolArmed', !doorToolArmed)"
      />
      <AppButton
        v-if="building"
        variant="ghost"
        size="inline-xs"
        :icon="IconAdd"
        label="Trace"
        @click="addUnboundRegion"
      />
    </div>
    <p v-if="!spaces.length" class="text-caption text-muted-foreground italic">No spaces yet — add a room below, or a nested site as a child location.</p>
    <div v-else class="flex flex-col gap-1.5">
      <div
        v-for="(space, i) in spaces"
        :key="space.id"
        class="flex flex-col gap-1.5 rounded-md border border-border bg-card px-3 py-2"
      >
        <div class="flex items-center gap-2">
          <div class="min-w-0 flex-1">
            <RouterLink
              :to="placeRoute(space.id)"
              class="block truncate font-cinzel text-xs font-semibold text-foreground transition-colors hover:text-primary"
            ><template v-if="boundRegionBySpace.get(space.id)">{{ i + 1 }}. </template>{{ space.name }}</RouterLink>
            <!-- Frame 03 "7. The Drowned Stair — Nested site · click to descend
                 [L2]" — a nested site's second line names what clicking it on
                 the map does, in place of the plain cell-count/provenance line
                 every other bound space shows. -->
            <p
              v-if="boundRegionBySpace.get(space.id) && space.location_type && isSiteType(space.location_type)"
              class="truncate text-caption-sm text-muted-foreground"
            >
              Nested site · click to descend
            </p>
            <p
              v-else-if="boundRegionBySpace.get(space.id)"
              class="flex items-center gap-1 truncate text-caption-sm text-muted-foreground"
            >
              <IconPen v-if="boundRegionBySpace.get(space.id)!.vertices" class="h-3 w-3 shrink-0" aria-hidden="true" />
              {{ regionProvenanceText(boundRegionBySpace.get(space.id)!) }}
            </p>
          </div>

          <template v-if="boundRegionBySpace.get(space.id)">
            <span
              v-if="nestedSiteIndexBySpace.get(space.id)"
              class="shrink-0 rounded bg-muted/40 px-1.5 py-0.5 font-cinzel text-2xs font-bold text-muted-foreground"
              :title="`Nested site — level ${nestedSiteIndexBySpace.get(space.id)}`"
            >
              L{{ nestedSiteIndexBySpace.get(space.id) }}
            </span>
            <!-- #878 S3 — a bound space (room or nested site) is the only
                 shape that can carry a #869 location-fact rule; a zone binds
                 to nothing and so has no identity for a quest rule to watch
                 (see `SiteMapRoomRules.vue`'s own docblock). -->
            <AppButton
              v-if="building"
              variant="ghost"
              size="inline-xs"
              :label="rulesForSpace(space.id).length ? `Rules (${rulesForSpace(space.id).length})` : 'Rules'"
              :active="expandedRulesSpaceId === space.id"
              tooltip="Hang a quest outcome on this room"
              @click="expandedRulesSpaceId = expandedRulesSpaceId === space.id ? null : space.id"
            />
            <AppButton
              v-if="building"
              variant="ghost"
              size="inline-xs"
              label="Trace"
              :active="activeRegionId === boundRegionBySpace.get(space.id)!.id"
              :disabled="!canTrace"
              :tooltip="canTrace ? undefined : 'Calibrate the grid before tracing'"
              @click="toggleActive(boundRegionBySpace.get(space.id)!.id)"
            />
            <AppButton
              v-if="building"
              variant="ghost"
              size="inline-xs"
              label="Unbind"
              @click="unbind(boundRegionBySpace.get(space.id)!)"
            />
            <AppButton
              v-if="building"
              variant="ghost"
              tone="danger"
              size="icon-xs"
              :icon="IconDelete"
              tooltip="Delete this space's shape"
              @click="removeRegion(boundRegionBySpace.get(space.id)!)"
            />
          </template>
          <AppButton v-else-if="building" variant="ghost" size="inline-xs" label="Add region" @click="addRegionForSpace(space)" />
          <span v-else class="shrink-0 text-caption text-muted-foreground italic">Not traced</span>
        </div>

        <SiteMapRoomRules
          v-if="building && boundRegionBySpace.get(space.id) && expandedRulesSpaceId === space.id"
          :location-id="space.id"
          :rules="rulesForSpace(space.id)"
        />
      </div>
    </div>
  </div>

  <!-- Untitled shapes — traced but not (yet) bound to a space. Creation moved
       to the Spaces header's own Trace button above; a fresh shape still
       lands here the moment it exists, unbound. -->
  <div class="flex flex-col gap-1.5">
    <span class="text-label-lg font-semibold text-muted-foreground">Untitled shapes</span>
    <p v-if="!unboundRegions.length" class="text-caption text-muted-foreground italic">Nothing traced yet.</p>
    <div v-else class="flex flex-col gap-1.5">
      <div
        v-for="region in unboundRegions"
        :key="region.id"
        class="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2"
      >
        <AppInput
          v-if="building"
          :model-value="region.label ?? ''"
          :model-modifiers="{ lazy: true }"
          type="text"
          tone="bare"
          size="xs"
          placeholder="Name this shape…"
          class="min-w-0 flex-1"
          @update:model-value="commitLabel(region, $event as string)"
        />
        <span v-else class="min-w-0 flex-1 truncate text-caption text-muted-foreground">{{ region.label || "Untitled shape" }}</span>
        <EntityCombobox
          v-if="building"
          :model-value="''"
          :options="unclaimedSpaces"
          placeholder="Bind to space…"
          class="w-40 shrink-0"
          @update:model-value="onBindSpace(region, $event)"
        />
        <span class="shrink-0 flex items-center gap-1 text-caption text-muted-foreground">
          <IconPen v-if="region.vertices" class="h-3 w-3" aria-hidden="true" />
          {{ regionProvenanceText(region) }}
        </span>
        <AppButton
          v-if="building"
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
 * drag-to-paint rewrite pushed it past the 600-line soft max. Mounted twice
 * as of #884 S11: read-only by `LocationMap.vue` in Browse (`building`
 * false, `activeRegionId` always null there — nothing sets it), and with
 * full CRUD by `MapWorkbench`'s embedded Plan branch in Build, where
 * `activeRegionId`/`building` are the workbench's own `usePlanPalette`
 * state — the canvas that actually paints cells into whichever region is
 * active is `MapWorkbench`'s, not this component's.
 *
 * `activeRegionId` is lifted to the caller either way, so it travels as a
 * prop + `update:activeRegionId` rather than living here.
 */
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import SiteMapRoomRules from "@/components/locations/SiteMapRoomRules.vue";
import { IconAdd, IconDelete, IconDoor, IconGridView, IconPen } from "@/lib/icons";
import { isSiteType } from "@/lib/locations/tiers";
import { placeRoute } from "@/lib/locations/placeRoute";
import {
  dmEdit,
  useCreateLocationMapRegion,
  useDeleteLocationMapRegion,
  useUpdateLocationMapRegion,
} from "@/composables/locations/useLocationMapRegions";
import { useQuestConsequencesByLocations } from "@/composables/quests/useQuestFlow";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import type { BindableSpace, LocationMapRegion } from "@/types/locationMapRegion.types";
import type { QuestConsequence } from "@/types/quest.types";

const { locationId, spaces, regions, activeRegionId, canTrace, building = false, doorToolArmed = false } = defineProps<{
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
  /** Build mode (#884): the rows, names and counts read in Browse too — a DM
   *  looking at a plan wants to see which spaces are traced and click one.
   *  Only the affordances that *change* the plan are Build-only. */
  building?: boolean;
  /** Whether the door tool (#884) is currently armed — `LocationMap.vue`
   *  owns the actual boolean (mutual exclusion with `activeRegionId` lives
   *  there); this panel only shows and toggles it. */
  doorToolArmed?: boolean;
}>();

const emit = defineEmits<{
  "update:activeRegionId": [id: string | null];
  "update:doorToolArmed": [armed: boolean];
}>();

const { confirm } = useConfirm();
const { error: toastError, fromError } = useToast();

// Regions carry a `region_role` now (#868) — a zone's `space_location_id` is
// always null by rule, which would otherwise land it in "Untitled shapes"
// below alongside genuinely unbound spaces. `SiteMapZoneList` owns zones.
const spaceRegions = computed(() => regions.filter((r) => r.region_role === "space"));

const boundRegionBySpace = computed(() => {
  const map = new Map<string, LocationMapRegion>();
  for (const r of spaceRegions.value) if (r.space_location_id) map.set(r.space_location_id, r);
  return map;
});
const unboundRegions = computed(() => spaceRegions.value.filter((r) => !r.space_location_id));
// A space already claimed by a bound region can't take a second one — the
// partial unique index would reject it — so it's left out of the picker
// entirely rather than surfacing that as a toast after the fact.
const unclaimedSpaces = computed(() => spaces.filter((s) => !boundRegionBySpace.value.has(s.id)));

// A nested site's own info chip (#868, frame 03: "[L2]") — 1-based among this
// site's nested-site spaces specifically, not the row's own position in the
// list above (which already counts every bound space, rooms included).
const nestedSiteIndexBySpace = computed(() => {
  const map = new Map<string, number>();
  let n = 0;
  for (const space of spaces) {
    if (space.location_type && isSiteType(space.location_type)) map.set(space.id, ++n);
  }
  return map;
});

// ── Quest rules on a room (#878 S3) ─────────────────────────────────────────
// Fetched once for every space on this site rather than per expanded row —
// `useQuestConsequencesByLocations` mirrors the site map's other
// plural-lookup composables (see its own docblock). Held to `[]` outside
// Build so a DM merely browsing a site never fires this query at all; the
// button and panel that read it are Build-only regardless.
const spaceIds = computed(() => (building ? spaces.map((s) => s.id) : []));
const { data: roomRules } = useQuestConsequencesByLocations(spaceIds);
const rulesBySpace = computed(() => {
  const map = new Map<string, QuestConsequence[]>();
  for (const rule of roomRules.value ?? []) {
    if (!rule.on_location_id) continue;
    const existing = map.get(rule.on_location_id);
    if (existing) existing.push(rule);
    else map.set(rule.on_location_id, [rule]);
  }
  return map;
});
function rulesForSpace(spaceId: string): QuestConsequence[] {
  return rulesBySpace.value.get(spaceId) ?? [];
}
// Which bound space's rule editor is open — at most one at a time, like the
// zone panel's own `expandedId`. Ephemeral UI state, not a list filter, so a
// local ref rather than `useUiStore` (Filter State Pattern governs filters
// over the list on screen, not a row's own disclosure toggle).
const expandedRulesSpaceId = ref<string | null>(null);

/** "18 cells · from flood fill" — the cell count every row earns once it has
 *  been traced, plus how it got there when a human didn't draw it by hand.
 *  `derived_from === "dm"` says nothing extra: every hand-traced shape reads
 *  that way, so naming it would just repeat what tracing already implies. */
function regionProvenanceText(region: LocationMapRegion): string {
  const cells = `${region.cells.length} cell${region.cells.length === 1 ? "" : "s"}`;
  const vertices = region.vertices ? `${region.vertices.length} ${region.vertices.length === 1 ? "vertex" : "vertices"}` : "";
  const provenance =
    region.derived_from === "floodfill" ? "from flood fill" : region.derived_from === "annotation" ? "from annotation" : "";
  return [cells, vertices, provenance].filter(Boolean).join(" · ");
}

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
    await updateRegion.mutateAsync({ id: region.id, update: dmEdit({ space_location_id: spaceId }) });
  } catch (e) {
    toastError(fromError(e));
  }
}

async function unbind(region: LocationMapRegion): Promise<void> {
  try {
    await updateRegion.mutateAsync({ id: region.id, update: dmEdit({ space_location_id: null }) });
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
  updateRegion.mutate({ id: region.id, update: dmEdit({ label: next === "" ? null : next }) });
}
</script>
