<template>
  <div class="flex flex-col gap-3">
    <!-- No internal heading: `LocationDetailSections` already titles this
         section — "Rooms" for most sites, "Grounds" for a `wilds` site
         (#886) — and repeating the word a line apart is noise.
         `StoreInventory` avoids the same collision by calling its own list
         "Inventory" under a "Store" heading; here there is no second word
         worth inventing, so the row simply goes. -->

    <!-- Site-default ambience (#868) — the floor every themeless space here
         falls back to. Build only (#884): the cell mixes display with its own
         edit control (`RoomAmbienceCell`), and assigning a theme is a prep
         decision, not something read off mid-session. -->
    <div
      v-if="site && building"
      class="flex items-center gap-2 rounded-md border border-dashed border-border bg-background px-3 py-2"
    >
      <span class="min-w-0 shrink-0 truncate font-cinzel text-xs font-semibold text-foreground">{{ site.name }}</span>
      <RoomAmbienceCell
        :location-id="site.id"
        :own-theme="site.audio_theme"
        :resolved="siteAmbience"
        :theme-options="themeOptions"
        @save="saveAmbience"
      />
    </div>

    <!-- Space list. Draggable only in Build (#884) — the static <div> fallback
         never receives drag attributes, same idiom `PlayerJournalMyTab` uses
         for its own manual-sort/static split. -->
    <component
      :is="building ? VueDraggable : 'div'"
      v-if="dragList.length"
      v-bind="dragBindings"
      class="flex flex-col gap-1.5"
    >
      <div
        v-for="(space, idx) in dragList"
        :key="space.id"
        class="flex flex-col gap-1 rounded-md border border-border bg-card px-3 py-2"
      >
        <div class="flex items-center gap-2">
          <div
            v-if="building"
            class="space-drag-handle shrink-0 cursor-grab text-muted-foreground/40 transition-colors hover:text-muted-foreground/80 active:cursor-grabbing"
            title="Drag to reorder"
          >
            <IconDrag class="h-3.5 w-3.5" />
          </div>

          <span class="w-5 shrink-0 text-caption-sm tabular-nums text-muted-foreground">{{ idx + 1 }}.</span>

          <AppInput
            v-if="building && editingId === space.id"
            ref="renameInput"
            v-model="nameDraft"
            size="xs"
            class="flex-1"
            @keydown.enter="saveRename(space.id)"
            @keydown.escape="cancelRename"
            @blur="saveRename(space.id)"
          />
          <span
            v-else
            class="min-w-0 flex-1 truncate font-cinzel text-xs font-semibold text-foreground"
          >{{ space.name }}</span>

          <!-- Read-only cleared/looted markers (#787, epic #780) — a play
               fact, so it stays visible in Browse. The toggles themselves
               live on the space's own detail page (LocationStateControls);
               this is a glance-only indicator, so it shows only a positive
               assertion — an "unknown" or explicit-false space renders no
               marker at all, keeping the row exactly as dense as before this
               feature. -->
          <IconShieldCheck
            v-if="siteStateOf(space.id, 'cleared')?.value"
            class="h-3.5 w-3.5 shrink-0 text-tone-success"
            aria-label="Cleared"
            title="Cleared"
          />
          <IconLoot
            v-if="siteStateOf(space.id, 'looted')?.value"
            class="h-3.5 w-3.5 shrink-0 text-tone-caution"
            aria-label="Looted"
            title="Looted"
          />

          <template v-if="building">
            <AppButton
              v-if="editingId !== space.id"
              variant="ghost"
              size="icon-xs"
              :icon="IconEdit"
              :tooltip="`Rename ${spaceWord(space)}`"
              class="shrink-0"
              @click="startRename(space)"
            />
            <AppButton
              variant="ghost"
              tone="danger"
              size="icon-xs"
              :icon="IconClose"
              :tooltip="`Delete ${spaceWord(space)}`"
              class="shrink-0"
              @click="removeSpace(space)"
            />
          </template>
        </div>

        <!-- Ambience (#868) — Build only, same reasoning as the site-default
             row above. Indented under the drag handle + index so it reads as
             this space's own second line, not a sibling row. -->
        <div v-if="building" class="pl-7">
          <RoomAmbienceCell
            :location-id="space.id"
            :own-theme="space.audio_theme"
            :resolved="spaceAmbience(space.id)"
            :theme-options="themeOptions"
            @save="saveAmbience"
          />
        </div>
      </div>
    </component>

    <p v-else class="text-caption text-muted-foreground italic">
      {{
        building
          ? `No ${childTypePlural} yet — add the first one below.`
          : `No ${childTypePlural} yet. Build the site to add them.`
      }}
    </p>

    <!-- Inline add — Build only. -->
    <div
      v-if="building"
      class="flex items-center gap-2 rounded-md border border-dashed border-border bg-background px-3 py-2"
    >
      <IconAdd class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <AppInput
        v-model="newSpaceName"
        type="text"
        tone="bare"
        size="xs"
        :block="false"
        :placeholder="`Add ${childTypeArticled}…`"
        class="flex-1 px-0 text-caption"
        @keydown.enter="addSpace"
      />
      <AppButton
        variant="ghost"
        size="inline-xs"
        label="Add"
        :disabled="!newSpaceName.trim() || isCreating"
        @click="addSpace"
      />
    </div>

    <PaywallModal v-model="showPaywall" resource="locations" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { VueDraggable } from "vue-draggable-plus";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import PaywallModal from "@/components/common/PaywallModal.vue";
import { IconAdd, IconClose, IconDrag, IconEdit, IconLoot, IconShieldCheck } from "@/lib/icons";
import { useToast } from "@/composables/useToast";
import { useConfirm } from "@/composables/useConfirm";
import { isQuotaExceeded } from "@/lib/quotaError";
import {
  useLocations,
  useAllLocations,
  useCreateLocation,
  useUpdateLocation,
  useDeleteLocation,
  useReorderLocations,
} from "@/composables/locations/useLocations";
import { useLocationStateForRooms } from "@/composables/locations/useLocationState";
import { buildAtlasIndex } from "@/lib/locations/tree";
import { childSpaceType, isInteriorType, spaceNoun } from "@/lib/locations/tiers";
import { resolveInheritedTheme } from "@/lib/locations/ambience";
import { collectThemes } from "@/lib/audio/audioThemes";
import { usePlaylists } from "@/composables/soundboard/useSoundboardPlaylists";
import { useSounds } from "@/composables/soundboard/useSounds";
import RoomAmbienceCell from "@/components/locations/RoomAmbienceCell.vue";
import type { Location, LocationInsert, LocationType } from "@/types/location.types";

/**
 * A site's numbered interior spaces — the panel #783 gives a dungeon (or any
 * site-tier place). A space is an ordinary interior-typed (`room`, or #886's
 * `grounds`) direct child; there is no membership table, because `parent_id`
 * already owns that fact. What this panel adds is the missing *order*
 * (`sort_order`, reordered via drag) and a dedicated surface to add/rename/
 * remove them without opening full edit.
 *
 * Which type gets created follows the parent (#886): a `wilds` site — a
 * wood, a marsh, a graveyard — creates `grounds` when the DM adds one, so its
 * parts arrive named for what they are instead of all being called rooms.
 * Every other site type still creates `room`. The type stays editable on the
 * child's own Details form afterward; this panel only picks the default.
 *
 * Mirrors `StoreInventory`'s shape: a self-contained view-mode component keyed
 * off a `locationId` prop rather than a route param, because `AtlasPlacePane`
 * reuses one mounted instance across every selected location instead of
 * remounting per id.
 *
 * Structural (add, reorder, rename, delete, ambience) only in Build mode
 * (#884, `building` prop) — Browse renders the numbered list read-only, plus
 * the cleared/looted markers, which are play facts and stay live everywhere.
 */
const { locationId, building = false } = defineProps<{
  locationId: string;
  building?: boolean;
}>();

const locationIdRef = computed(() => locationId);
const { data: children } = useLocations(locationIdRef);
const spaces = computed(() => (children.value ?? []).filter((l) => isInteriorType(l.location_type)));

// Batched rather than one query per row — the reason `useLocationStateForRooms`
// exists at all. Read-only here: the toggles that actually assert a fact live
// on the space's own detail page (LocationStateControls), keyed by locationId.
const spaceIds = computed(() => spaces.value.map((s) => s.id));
const { stateOf: siteStateOf } = useLocationStateForRooms(spaceIds);

const toast = useToast();
const { confirm } = useConfirm();

// ── Ambience (#868) ───────────────────────────────────────────────────────
// Full campaign list (shared query key — the Atlas already pays for this
// fetch) rather than just this site's own children: a site itself can
// inherit from an ancestor further up, and the walk needs the whole chain.
const { data: allLocations } = useAllLocations();
const ambienceById = computed(() => buildAtlasIndex(allLocations.value ?? []).byId);
const site = computed(() => ambienceById.value.get(locationId) ?? null);
const siteAmbience = computed(() => resolveInheritedTheme(locationId, ambienceById.value));
function spaceAmbience(spaceId: string) {
  return resolveInheritedTheme(spaceId, ambienceById.value);
}

const { data: playlists } = usePlaylists();
const { data: sounds } = useSounds();
const themeOptions = computed(() =>
  collectThemes(playlists.value === undefined ? [] : playlists.value, sounds.value === undefined ? [] : sounds.value),
);

function saveAmbience(id: string, theme: string | null): void {
  updateLocation({ id, update: { audio_theme: theme } }, { onError: (e) => toast.error(toast.fromError(e)) });
}

// ── Drag-to-reorder ─────────────────────────────────────────────────────────────
// Local mutable copy for VueDraggable (it reorders this in place); kept in
// sync with the server-derived list, persisted to the RPC on drag end.
const dragList = ref<Location[]>([]);
watch(spaces, (list) => { dragList.value = [...list]; }, { immediate: true });

const { mutate: reorder } = useReorderLocations();

function persistOrder() {
  reorder(dragList.value.map((s) => s.id));
}

// VueDraggable props are only bound in Build — the static <div> fallback
// never receives stray drag attributes. Same idiom as `PlayerJournalMyTab`'s
// manual-sort/static split.
const dragBindings = computed(() =>
  building
    ? {
        modelValue: dragList.value,
        "onUpdate:modelValue": (v: Location[]) => { dragList.value = v; },
        handle: ".space-drag-handle",
        animation: 150,
        ghostClass: "opacity-40",
        onEnd: persistOrder,
      }
    : {},
);

// ── Add ─────────────────────────────────────────────────────────────────────────
// The type a new space gets follows the parent — see `childSpaceType`'s
// docstring for the rule. `site` is this panel's own location (looked up
// above for the ambience row), so its `location_type` is already in scope —
// no second query.
const childType = computed(() => childSpaceType(site.value?.location_type));
const childTypePlural = computed(() => spaceNoun(site.value?.location_type).plural);
// "grounds" reads fine bare ("Add grounds…", like "Add supplies…"); "room"
// needs its article back once it's no longer the fixed word in a template
// literal.
const childTypeArticled = computed(() => (childType.value === "grounds" ? "grounds" : "a room"));

/** Per-row rename/delete tooltip word — the row's own type, not the panel's
 *  default, so a site that changed shape after some spaces were already
 *  added still reads correctly for each of them individually. */
function spaceWord(space: Location): string {
  return space.location_type === "grounds" ? "grounds" : "room";
}

const newSpaceName = ref("");
const { mutate: createLocation, isPending: isCreating } = useCreateLocation();
const showPaywall = ref(false);

function buildSpaceInsert(name: string, type: LocationType): Omit<LocationInsert, "campaign_id"> {
  return {
    name,
    location_type: type,
    parent_id: locationId,
    description: null,
    notes: null,
    tags: [],
    image_url: null,
    map_url: null,
    map_pins: [],
    is_map_shared: false,
    player_visible_to: [],
    player_summary: null,
    is_description_shared: false,
    is_npcs_shared: false,
    is_inventory_shared: false,
    npc_owner_id: null,
    related_location_ids: [],
    source_map_id: null,
    is_battle_map: false,
    grid_calibration: null,
    era_start: null,
    era_end: null,
  };
}

function addSpace() {
  const trimmed = newSpaceName.value.trim();
  if (!trimmed) return;
  // The DB trigger (guard_location_room_parent) is the actual authority on
  // which types may hold an interior space — this panel only ever inserts
  // under the site it is mounted on, so it never duplicates that check
  // client-side. A rejection still surfaces here rather than vanishing
  // silently.
  createLocation(buildSpaceInsert(trimmed, childType.value), {
    onSuccess: () => { newSpaceName.value = ""; },
    onError: (e) => {
      if (isQuotaExceeded(e)) { showPaywall.value = true; return; }
      toast.error(toast.fromError(e));
    },
  });
}

// ── Rename ──────────────────────────────────────────────────────────────────────
const editingId = ref<string | null>(null);
const nameDraft = ref("");
// AppInput exposes { el, focus, select } rather than the raw element, since a
// bare component ref resolves to the public instance, not the DOM node.
const renameInput = ref<{ focus: () => void; select: () => void } | null>(null);
const { mutate: updateLocation } = useUpdateLocation();

function startRename(space: Location) {
  editingId.value = space.id;
  nameDraft.value = space.name;
  nextTick(() => {
    const el = Array.isArray(renameInput.value) ? renameInput.value[0] : renameInput.value;
    el?.focus();
    el?.select();
  });
}

function saveRename(id: string) {
  const trimmed = nameDraft.value.trim();
  editingId.value = null;
  if (!trimmed) return;
  updateLocation(
    { id, update: { name: trimmed } },
    { onError: (e) => toast.error(toast.fromError(e)) },
  );
}

function cancelRename() {
  editingId.value = null;
}

// ── Delete ──────────────────────────────────────────────────────────────────────
const { mutate: deleteLocation } = useDeleteLocation(); // already toasts onError

async function removeSpace(space: Location) {
  const ok = await confirm(`Delete "${space.name}"? This cannot be undone.`, {
    confirmLabel: "Delete",
    danger: true,
  });
  if (!ok) return;
  deleteLocation(space.id);
}
</script>
