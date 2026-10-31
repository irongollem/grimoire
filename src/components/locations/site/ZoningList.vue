<template>
  <!-- The one list of Zoning (Map Table frames 18-19): "zones and spaces are the same thing". Rooms first, found
       from the walls or bound to a place, then every other kind of zone, each with its kind and a short state.
       The Zone tool in the rail decides how a click on the map traces; this list names, binds, reshapes and
       deletes. Found rooms are here the moment Zoning opens; a row is written only when the DM acts on one. -->
  <div class="flex flex-col gap-3">
    <div class="flex flex-col gap-1.5 rounded-md border border-border bg-muted/40 px-3 py-2">
      <template v-if="foundCount > 0">
        <div class="flex items-center gap-2">
          <p class="min-w-0 flex-1 text-caption font-semibold text-foreground">
            {{ foundCount }} {{ foundCount === 1 ? "room" : "rooms" }} found from the walls
          </p>
          <AppButton
            variant="ghost"
            size="inline-xs"
            label="Find again"
            tooltip="Redraw the rooms you have not touched from the walls as they are now"
            @click="emit('find-again')"
          />
        </div>
        <p class="text-caption-sm text-muted-foreground">
          Name a room, bind it to a place or reshape it and it is yours from then on. Find again leaves it alone.
        </p>
      </template>
      <template v-else>
        <p class="text-caption font-semibold text-foreground">
          {{ hasDrawing ? "No closed rooms found" : "Nothing to find from the walls yet" }}
        </p>
        <p class="text-caption-sm text-muted-foreground">
          {{ hasDrawing ? "Close a room's walls in the Drawing and it appears here." : "This map has no drawing, so rooms are drawn by hand." }}
        </p>
        <AppButton
          variant="ghost"
          size="inline-xs"
          label="Use the Zone tool"
          class="self-start"
          @click="emit('pick-zone-tool')"
        />
      </template>
    </div>

    <section class="flex flex-col gap-1.5" aria-label="Rooms">
      <h4 class="flex items-center gap-2 text-label-lg font-semibold text-muted-foreground">
        Rooms
        <span class="rounded-full bg-muted px-2 py-0.5 text-label font-semibold">{{ rooms.length }}</span>
      </h4>
      <p v-if="!rooms.length" class="text-caption text-muted-foreground italic">No rooms yet. Draw a zone of the Room kind.</p>
      <ul v-else class="flex flex-col gap-1.5">
        <li
          v-for="(entry, i) in rooms"
          :key="entryId(entry)"
          class="flex flex-col gap-1.5 rounded-md border bg-card px-3 py-2"
          :class="isFound(entry) ? 'border-dashed border-border' : 'border-border'"
          :data-entry="entryId(entry)"
        >
          <div class="flex items-center gap-2">
            <span class="h-2.5 w-2.5 shrink-0 rounded-sm bg-primary/70" aria-hidden="true" />
            <div class="min-w-0 flex-1">
              <RouterLink
                v-if="boundSpace(entry)"
                :to="placeRoute(boundSpace(entry)!.id)"
                class="block truncate text-caption font-semibold text-foreground transition-colors hover:text-primary"
              >{{ boundSpace(entry)!.name }}</RouterLink>
              <PlacementNoteInput
                v-else
                :model-value="ownLabel(entry)"
                :placeholder="roomTitle(entry, i + 1, null).text"
                @commit="(value) => emit('rename', entry, value.trim() === '' ? null : value.trim())"
              />
              <p class="flex items-center gap-1 truncate text-caption-sm text-muted-foreground">
                <IconPen v-if="entry.kind === 'region' && entry.region.vertices && entry.region.derived_from !== 'floodfill'" class="h-3 w-3 shrink-0" aria-hidden="true" />
                {{ zoningState(entry) }}
              </p>
            </div>
            <AppButton
              v-if="!boundSpace(entry) && !roomTitle(entry, i + 1, null).named"
              variant="ghost"
              size="inline-xs"
              label="Name it"
              @click="nameIt"
            />
            <AppButton
              variant="ghost"
              size="inline-xs"
              label="Reshape"
              :active="activeRegionId === entryId(entry)"
              tooltip="Then drag on the map to redraw this room"
              @click="emit('reshape', entry)"
            />
            <AppButton
              v-if="entry.kind === 'region'"
              variant="ghost"
              tone="danger"
              size="icon-xs"
              :icon="IconDelete"
              tooltip="Delete this room's shape"
              @click="removeRegion(entry.region)"
            />
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <EntityCombobox
              v-if="!boundSpace(entry)"
              :model-value="''"
              :options="unclaimedSpaces"
              placeholder="Bind to a place…"
              class="min-w-0 flex-1"
              @update:model-value="(id) => id && emit('bind', entry, id)"
            />
            <template v-else-if="entry.kind === 'region'">
              <p
                v-if="boundSpace(entry)!.location_type && isSiteType(boundSpace(entry)!.location_type!)"
                class="min-w-0 flex-1 truncate text-caption-sm text-muted-foreground"
              >
                Nested site, click it on the map to descend
              </p>
              <span v-else class="flex-1" />
              <!-- A bound room is the only shape that can carry a #869 location-fact rule; a zone binds to
                   nothing and so has no identity for a quest rule to watch (see `SiteMapRoomRules`). -->
              <AppButton
                variant="ghost"
                size="inline-xs"
                :label="rulesFor(boundSpace(entry)!.id).length ? `Rules (${rulesFor(boundSpace(entry)!.id).length})` : 'Rules'"
                :active="rulesOpenFor === boundSpace(entry)!.id"
                tooltip="Hang a quest outcome on this room"
                @click="rulesOpenFor = rulesOpenFor === boundSpace(entry)!.id ? null : boundSpace(entry)!.id"
              />
              <AppButton variant="ghost" size="inline-xs" label="Unbind" @click="emit('bind', entry, null)" />
            </template>
          </div>

          <SiteMapRoomRules
            v-if="boundSpace(entry) && rulesOpenFor === boundSpace(entry)!.id"
            :location-id="boundSpace(entry)!.id"
            :rules="rulesFor(boundSpace(entry)!.id)"
          />
        </li>
      </ul>
    </section>

    <section class="flex flex-col gap-1.5" aria-label="Other zones">
      <h4 class="flex items-center gap-2 text-label-lg font-semibold text-muted-foreground">
        Other zones
        <span class="rounded-full bg-muted px-2 py-0.5 text-label font-semibold">{{ others.length }}</span>
      </h4>
      <p v-if="!others.length" class="text-caption text-muted-foreground italic">
        None yet. Terrain, hazards, light, triggers, the entrance and markers all live here once drawn.
      </p>
      <ul v-else class="flex flex-col gap-1.5">
        <li
          v-for="entry in others"
          :key="entryId(entry)"
          class="flex flex-col gap-1.5 rounded-md border border-border bg-card px-3 py-2"
          :data-entry="entryId(entry)"
        >
          <template v-if="entry.kind === 'region' && entry.region.zone_kind">
            <div class="flex items-center gap-2">
              <span
                class="h-2.5 w-2.5 shrink-0 rounded-full"
                :style="{ backgroundColor: ZONE_KIND_FILL[entry.region.zone_kind].stroke }"
                aria-hidden="true"
              />
              <div class="min-w-0 flex-1">
                <PlacementNoteInput
                  :model-value="entry.region.label"
                  :placeholder="`Name this ${ZONE_KIND_LABELS[entry.region.zone_kind].toLowerCase()}…`"
                  @commit="(value) => emit('rename', entry, value.trim() === '' ? null : value.trim())"
                />
                <p class="truncate text-caption-sm text-muted-foreground">{{ zoningState(entry) }}</p>
              </div>
            </div>
            <div class="flex items-center justify-end gap-2">
              <AppButton
                variant="tinted"
                :tone="isPlayerVisible(entry.region) ? 'success' : 'neutral'"
                size="inline-xs"
                :label="isPlayerVisible(entry.region) ? 'Shown' : 'DM'"
                :tooltip="isPlayerVisible(entry.region) ? 'Visible to players' : 'DM only: click to show players'"
                @click="toggleVisible(entry.region)"
              />
              <AppButton
                variant="ghost"
                size="inline-xs"
                label="Reshape"
                :active="activeRegionId === entry.region.id"
                tooltip="Then drag on the map to redraw this zone"
                @click="emit('reshape', entry)"
              />
              <AppButton
                variant="ghost"
                size="icon-xs"
                :icon="detailsOpenFor === entry.region.id ? IconChevronUp : IconChevronDown"
                tooltip="Edit details"
                @click="detailsOpenFor = detailsOpenFor === entry.region.id ? null : entry.region.id"
              />
              <AppButton
                variant="ghost"
                tone="danger"
                size="icon-xs"
                :icon="IconDelete"
                tooltip="Delete this zone"
                @click="removeRegion(entry.region)"
              />
            </div>
            <ZoneDetailsEditor v-if="detailsOpenFor === entry.region.id" :zone="entry.region" />
          </template>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
/**
 * Zoning's one list (#1125, frames 18-19), replacing the old Spaces and Zones lists. It draws what
 * `zoningList` (lib/locations/foundRooms) decides; every write that has to know about found rooms (a rename, a
 * bind, a reshape, Find again) is the workbench's through `usePlanPalette`, so a found room and a written row go
 * through the same stamp (`derived_from: 'dm'`). Delete and the zone mechanics write straight to the row, as the
 * lists this replaced did.
 */
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import PlacementNoteInput from "@/components/locations/place/PlacementNoteInput.vue";
import SiteMapRoomRules from "@/components/locations/site/SiteMapRoomRules.vue";
import ZoneDetailsEditor from "@/components/locations/site/ZoneDetailsEditor.vue";
import { IconChevronDown, IconChevronUp, IconDelete, IconPen } from "@/lib/icons";
import { useDeleteLocationMapRegion, useUpdateLocationMapRegion, dmEdit } from "@/composables/locations/useLocationMapRegions";
import { useQuestConsequencesByLocations } from "@/composables/quests/useQuestFlow";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import type { ZoningEntry } from "@/lib/locations/foundRooms";
import { placeRoute } from "@/lib/locations/placeRoute";
import { isSiteType } from "@/lib/locations/tiers";
import { entryId, isRoomEntry, roomTitle, zoningState } from "@/lib/locations/zoningRows";
import { isPlayerVisible, ZONE_KIND_FILL } from "@/lib/locations/zones";
import { ZONE_KIND_LABELS, type BindableSpace, type LocationMapRegion } from "@/types/locationMapRegion.types";
import type { QuestConsequence } from "@/types/quest.types";

const { entries, spaces, activeRegionId, foundCount, hasDrawing } = defineProps<{
  entries: ZoningEntry[];
  /** Every child that can carry a shape on this map: a room, or a nested site (#818). */
  spaces: BindableSpace[];
  activeRegionId: string | null;
  /** How many rooms the walls make right now. */
  foundCount: number;
  /** The Drawing has anything painted; without it there is nothing to find, and the header says so. */
  hasDrawing: boolean;
}>();

const emit = defineEmits<{
  "find-again": [];
  "pick-zone-tool": [];
  rename: [entry: ZoningEntry, label: string | null];
  bind: [entry: ZoningEntry, spaceId: string | null];
  reshape: [entry: ZoningEntry];
  /** A row was deleted; the workbench lets go of it if it was the one being traced. */
  removed: [regionId: string];
}>();

const { confirm } = useConfirm();
const { error: toastError, fromError } = useToast();
const updateRegion = useUpdateLocationMapRegion();
const deleteRegion = useDeleteLocationMapRegion();

const rooms = computed(() => entries.filter(isRoomEntry));
const others = computed(() => entries.filter((e) => !isRoomEntry(e)));

const spaceById = computed(() => new Map(spaces.map((s) => [s.id, s])));
function boundSpace(entry: ZoningEntry): BindableSpace | null {
  if (entry.kind !== "region" || !entry.region.space_location_id) return null;
  return spaceById.value.get(entry.region.space_location_id) ?? null;
}
// A place already claimed by a room can't take a second one (the partial unique index would reject it), so it is
// left out of the picker rather than surfacing that as a toast after the fact.
const claimed = computed(() => new Set(entries.flatMap((e) => (e.kind === "region" && e.region.space_location_id ? [e.region.space_location_id] : []))));
const unclaimedSpaces = computed(() => spaces.filter((s) => !claimed.value.has(s.id)));

/** The room's own name as typed or found, never the "Room N" placeholder. */
function ownLabel(entry: ZoningEntry): string | null {
  return entry.kind === "found" ? entry.space.name : entry.region.label;
}
function isFound(entry: ZoningEntry): boolean {
  return entry.kind === "found" || entry.found;
}

/** Puts the cursor in the row's name field. */
function nameIt(event: MouseEvent): void {
  const row = (event.currentTarget as HTMLElement).closest("li");
  row?.querySelector("input")?.focus();
}

// ── Quest rules on a room (#878 S3): fetched once for every place on this site, not per expanded row ──
const placeIds = computed(() => spaces.map((s) => s.id));
const { data: roomRules } = useQuestConsequencesByLocations(placeIds);
function rulesFor(spaceId: string): QuestConsequence[] {
  return (roomRules.value ?? []).filter((rule) => rule.on_location_id === spaceId);
}
// Ephemeral disclosure state, not a list filter, so local refs rather than a UI store.
const rulesOpenFor = ref<string | null>(null);
const detailsOpenFor = ref<string | null>(null);

async function removeRegion(region: LocationMapRegion): Promise<void> {
  const name = boundSpace({ kind: "region", region, space: null, found: false, changed: false })?.name
    ?? region.label
    ?? (region.zone_kind ? ZONE_KIND_LABELS[region.zone_kind] : "this room's shape");
  const ok = await confirm(`Delete "${name}"? This cannot be undone.`, { danger: true });
  if (!ok) return;
  if (detailsOpenFor.value === region.id) detailsOpenFor.value = null;
  try {
    await deleteRegion.mutateAsync(region.id);
    emit("removed", region.id);
  } catch (e) {
    toastError(fromError(e));
  }
}

function toggleVisible(zone: LocationMapRegion): void {
  updateRegion.mutate({ id: zone.id, update: dmEdit({ zone_payload: { ...zone.zone_payload, visible_to_players: !isPlayerVisible(zone) } }) });
}
</script>
