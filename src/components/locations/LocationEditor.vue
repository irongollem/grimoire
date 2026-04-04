<template>
  <div class="flex flex-col gap-4">
    <!-- Breadcrumb: full ancestor chain -->
    <div v-if="ancestors.length || isNew" class="flex flex-wrap items-center gap-1 text-xs font-fell text-muted-foreground">
      <RouterLink to="/locations" class="hover:text-foreground transition-colors">Locations</RouterLink>
      <template v-for="anc in ancestors" :key="anc.id">
        <span class="opacity-40">/</span>
        <RouterLink :to="`/locations/${anc.id}`" class="hover:text-foreground transition-colors">
          {{ anc.name }}
        </RouterLink>
      </template>
      <span class="opacity-40">/</span>
      <span class="text-foreground">{{ isNew ? "New Location" : props.location?.name }}</span>
    </div>

    <!-- Action row: type + visibility + save + delete -->
    <div class="flex flex-wrap items-center gap-2 justify-end">
      <select
        v-model="locationType"
        class="bg-card border border-border rounded-md px-3 py-2 font-cinzel text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option v-for="(label, value) in LOCATION_TYPE_LABELS" :key="value" :value="value">
          {{ label }}
        </option>
      </select>
      <PlayerVisibilityToggle
        v-if="!isNew"
        :shared-with-all="sharedWithPlayers"
        :visible-to="playerVisibleTo"
        @update:shared-with-all="sharedWithPlayers = $event"
        @update:visible-to="playerVisibleTo = $event"
      />
      <button
        type="button"
        :disabled="saving || !name.trim()"
        class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
        @click="save"
      >
        <Save class="h-3.5 w-3.5" />
        {{ saving ? "Saving…" : isNew ? "Create" : "Save" }}
      </button>
      <button
        v-if="!isNew"
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md border border-destructive px-3 py-2 font-cinzel text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors"
        @click="remove"
      >
        <Trash2 class="h-3.5 w-3.5" />
        Delete
      </button>
    </div>

    <!-- Sigil + identity fields -->
    <div class="flex gap-5">
      <!-- Sigil -->
      <div class="shrink-0 w-48">
        <ImageUpload
          :model-value="imageUrl"
          aspect="auto"
          placeholder="Sigil / Emblem"
          bucket="location-images"
          @update:model-value="imageUrl = $event"
        />
      </div>

      <!-- Name, parent, tags, sub-locations, calendar pins -->
      <div class="flex-1 flex flex-col gap-3 min-w-0">
        <input
          v-model="name"
          placeholder="Location name…"
          class="w-full bg-card border border-border rounded-md px-3 py-2 font-cinzel text-lg font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />

        <div class="flex items-center gap-2">
          <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider shrink-0 w-16 flex items-center gap-1">
            <ChevronUp class="h-3.5 w-3.5" />Parent
          </span>
          <EntityCombobox
            v-model="parentIdStr"
            :options="parentOptions"
            placeholder="— None (top-level) —"
          >
            <template #option="{ opt }">
              <span
                class="inline-block h-2 w-2 rounded-full shrink-0"
                :style="{ backgroundColor: LOCATION_TYPE_COLORS[opt.location_type] }"
              />
              <span class="flex-1 truncate">{{ opt.name }}</span>
              <span class="text-xs text-muted-foreground shrink-0 font-cinzel">{{ LOCATION_TYPE_LABELS[opt.location_type] }}</span>
            </template>
          </EntityCombobox>
        </div>

        <!-- Compact sub-locations -->
        <div v-if="!isNew" class="flex items-start gap-2">
          <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider shrink-0 w-16 flex items-center gap-1 pt-1.5">
            <MapPin class="h-3.5 w-3.5" />Child
          </span>
          <div class="flex-1 flex flex-wrap items-center gap-1.5 border border-border rounded-md px-3 py-1.5 min-h-8.5 bg-background relative">
            <span v-if="childrenLoading" class="font-fell text-xs text-muted-foreground italic">Loading…</span>
            <RouterLink
              v-for="child in children"
              :key="child.id"
              :to="`/locations/${child.id}`"
              class="inline-flex items-center gap-1.5 rounded border border-border bg-muted/50 hover:border-primary/50 hover:bg-muted transition-colors px-2 py-0.5"
            >
              <span class="h-1.5 w-1.5 rounded-full shrink-0" :style="{ backgroundColor: LOCATION_TYPE_COLORS[child.location_type] }" />
              <span class="font-cinzel text-xs font-semibold text-foreground">{{ child.name }}</span>
            </RouterLink>
            <!-- Inline child search -->
            <div class="relative ml-auto">
              <input
                v-model="childSearch"
                type="text"
                placeholder="Add child…"
                class="font-cinzel text-xs text-foreground placeholder:text-muted-foreground/50 bg-transparent focus:outline-none w-24 focus:w-36 transition-all"
                @focus="childDropdownOpen = true"
                @blur="onChildBlur"
                @keydown.escape="childDropdownOpen = false"
              />
              <div
                v-if="childDropdownOpen && (childOptions.length || childSearch.trim())"
                class="absolute right-0 top-full mt-1 z-50 w-56 rounded-md border border-border bg-popover shadow-lg overflow-hidden"
              >
                <button
                  v-for="opt in childOptions"
                  :key="opt.id"
                  type="button"
                  class="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted transition-colors"
                  @mousedown.prevent="addChild(opt)"
                >
                  <span class="h-1.5 w-1.5 rounded-full shrink-0" :style="{ backgroundColor: LOCATION_TYPE_COLORS[opt.location_type] }" />
                  <span class="font-cinzel text-xs text-foreground truncate flex-1">{{ opt.name }}</span>
                  <span class="font-fell text-[10px] text-muted-foreground shrink-0">{{ LOCATION_TYPE_LABELS[opt.location_type] }}</span>
                </button>
                <button
                  type="button"
                  class="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted transition-colors border-t border-border text-primary"
                  @mousedown.prevent="createChild"
                >
                  <Plus class="h-3 w-3 shrink-0" />
                  <span class="font-cinzel text-xs truncate flex-1">
                    {{ childSearch.trim() ? `Create "${childSearch.trim()}"` : 'Create new child location' }}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="flex items-start gap-2">
          <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider shrink-0 w-16 flex items-center gap-1 pt-1.5">
            <Tag class="h-3.5 w-3.5" />Tags
          </span>
          <div class="flex-1"><TagInput v-model="tags" /></div>
        </div>

        <!-- Compact calendar pins -->
        <EntityCalendarSection
          compact
          entity-type="location"
          :entity-id="props.location?.id ?? null"
          :entity-name="name || 'Untitled Location'"
        />
      </div>
    </div>

    <p v-if="saveError" class="text-destructive font-fell text-sm">{{ saveError }}</p>

    <!-- Description editor -->
    <div class="flex flex-col gap-1">
      <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Description</span>
      <RichTextEditor
        v-model="description"
        placeholder="Describe this location…"
        min-height="320px"
      />
    </div>

    <!-- Map section -->
    <div class="flex flex-col gap-2">
      <div class="flex items-center justify-between">
        <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Map</span>
        <label
          v-if="mapUrl && !isNew"
          class="inline-flex items-center gap-2 cursor-pointer"
          title="Share map with players"
        >
          <span class="font-cinzel text-xs text-muted-foreground tracking-wider">Share with players</span>
          <button
            type="button"
            class="relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors focus:outline-none"
            :class="isMapShared ? 'bg-primary' : 'bg-muted-foreground/30'"
            @click="isMapShared = !isMapShared"
          >
            <span
              class="inline-block h-3 w-3 rounded-full bg-white shadow transition-transform"
              :class="isMapShared ? 'translate-x-3.5' : 'translate-x-0.5'"
            />
          </button>
        </label>
      </div>

      <!-- No map: full drop zone -->
      <ImageUpload
        v-if="!mapUrl"
        :model-value="null"
        aspect="landscape"
        placeholder="Upload a map…"
        bucket="location-images"
        @update:model-value="mapUrl = $event"
      />

      <!-- Has map: interactive map + compact controls -->
      <template v-else>
        <LocationMap
          v-if="!isNew && children"
          :map-url="mapUrl"
          :pins="mapPins"
          :children="(children as Location[])"
          mode="edit"
          :show-hidden-pins="true"
          :compact="mapCompact"
          @update:pins="mapPins = $event"
          @pin-click="router.push(`/locations/${$event}`)"
        />
        <div class="flex items-center gap-2">
          <button
            type="button"
            :disabled="isMapUploading"
            class="font-cinzel text-[10px] tracking-wider text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            @click="mapFileInput?.click()"
          >
            {{ isMapUploading ? "Uploading…" : "Change map" }}
          </button>
          <span class="text-muted-foreground/40 text-xs">·</span>
          <button
            type="button"
            class="font-cinzel text-[10px] tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            :title="mapCompact ? 'Show full size' : 'Compact map'"
            @click="mapCompact = !mapCompact"
          >
            {{ mapCompact ? "Full size" : "Compact" }}
          </button>
          <span class="text-muted-foreground/40 text-xs">·</span>
          <button
            type="button"
            class="font-cinzel text-[10px] tracking-wider text-destructive hover:opacity-80 transition-opacity"
            @click="clearMap"
          >
            Remove
          </button>
          <input
            ref="mapFileInput"
            type="file"
            accept="image/*"
            class="hidden"
            @change="onMapFileChange"
          />
        </div>
      </template>
    </div>

    <!-- Player sharing options -->
    <div v-if="!isNew" class="flex flex-col gap-3 rounded-lg border border-border bg-card/50 px-4 py-3">
      <span class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider">Player Sharing</span>

      <!-- Player summary (always shown to players who can see this location) -->
      <div class="flex flex-col gap-1">
        <label class="font-cinzel text-[10px] text-muted-foreground tracking-wider">Summary (always visible)</label>
        <input
          v-model="playerSummary"
          placeholder="A short description players always see when they discover this location…"
          class="w-full bg-background border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <!-- Share description -->
      <label class="inline-flex items-center justify-between gap-3 cursor-pointer">
        <span class="font-cinzel text-xs text-foreground">Share full description</span>
        <button
          type="button"
          class="relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors focus:outline-none"
          :class="isDescriptionShared ? 'bg-primary' : 'bg-muted-foreground/30'"
          @click="isDescriptionShared = !isDescriptionShared"
        >
          <span
            class="inline-block h-3 w-3 rounded-full bg-white shadow transition-transform"
            :class="isDescriptionShared ? 'translate-x-3.5' : 'translate-x-0.5'"
          />
        </button>
      </label>

      <!-- Share linked NPCs -->
      <label class="inline-flex items-center justify-between gap-3 cursor-pointer">
        <span class="font-cinzel text-xs text-foreground">Share linked NPCs</span>
        <button
          type="button"
          class="relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors focus:outline-none"
          :class="isNpcsShared ? 'bg-primary' : 'bg-muted-foreground/30'"
          @click="isNpcsShared = !isNpcsShared"
        >
          <span
            class="inline-block h-3 w-3 rounded-full bg-white shadow transition-transform"
            :class="isNpcsShared ? 'translate-x-3.5' : 'translate-x-0.5'"
          />
        </button>
      </label>
    </div>

    <!-- NPCs at this location -->
    <template v-if="!isNew && locationNpcs?.length">
      <div class="flex items-center justify-between mt-2">
        <h2 class="font-cinzel text-sm font-bold text-foreground tracking-wide">
          People in the Area
          <span class="font-fell font-normal text-muted-foreground">({{ locationNpcs.length }})</span>
        </h2>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <RouterLink
          v-for="npc in locationNpcs"
          :key="npc.id"
          :to="`/npcs/${npc.id}`"
          class="group flex items-center gap-3 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors p-3 overflow-hidden"
        >
          <div class="flex-1 min-w-0">
            <p class="font-cinzel text-sm font-semibold text-foreground truncate">{{ npc.name }}</p>
            <p v-if="npc.occupation || npc.race" class="font-fell text-xs text-muted-foreground italic truncate">
              {{ [npc.race, npc.occupation].filter(Boolean).join(" · ") }}
            </p>
            <p v-if="npc.location_id && npc.location_id !== props.location?.id" class="font-cinzel text-[10px] text-muted-foreground/60 tracking-wide truncate mt-0.5">
              {{ allLocations?.find(l => l.id === npc.location_id)?.name ?? "" }}
            </p>
          </div>
          <ChevronRight class="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
        </RouterLink>
      </div>
    </template>

    <!-- Encounters at this location -->
    <template v-if="!isNew && locationEncounters?.length">
      <div class="flex items-center justify-between mt-2">
        <h2 class="font-cinzel text-sm font-bold text-foreground tracking-wide">
          Encounters Here
          <span class="font-fell font-normal text-muted-foreground">({{ locationEncounters.length }})</span>
        </h2>
      </div>
      <div class="flex flex-col gap-2">
        <RouterLink
          v-for="enc in locationEncounters"
          :key="enc.id"
          :to="`/encounters/${enc.id}`"
          class="group flex items-center gap-3 rounded-lg border border-border bg-card hover:border-primary/50 transition-colors px-4 py-3"
        >
          <span class="flex-1 font-cinzel text-sm font-semibold text-foreground truncate">{{ enc.name }}</span>
          <span v-if="enc.is_finished" class="font-cinzel text-[10px] text-muted-foreground tracking-wider">Done</span>
          <ChevronRight class="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
        </RouterLink>
      </div>
    </template>

  </div>
</template>

<script setup lang="ts">
import { useConfirm } from "@/composables/useConfirm";
const { confirm } = useConfirm();
import { ref, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { Save, Trash2, ChevronRight, MapPin, ChevronUp, Tag, Plus } from "lucide-vue-next";
import ImageUpload from "@/components/common/ImageUpload.vue";
import { useImageUpload } from "@/composables/useImageUpload";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import PlayerVisibilityToggle from "@/components/common/PlayerVisibilityToggle.vue";
import TagInput from "@/components/common/TagInput.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import LocationMap from "@/components/locations/LocationMap.vue";
import { useNpcsByLocations } from "@/composables/useNpcs";
import { useEncountersByLocation } from "@/composables/useEncounters";
import EntityCalendarSection from "@/components/calendar/EntityCalendarSection.vue";
import {
  useLocations,
  useAllLocations,
  useCreateLocation,
  useUpdateLocation,
  useDeleteLocation,
} from "@/composables/useLocations";
import { LOCATION_TYPE_LABELS, LOCATION_TYPE_COLORS } from "@/types/location.types";
import type { Location, LocationType, MapPin as MapPinType } from "@/types/location.types";

const props = defineProps<{
  location: Location | null;
  parentId?: string | null;
  initialName?: string;
}>();

const router = useRouter();
const isNew = computed(() => !props.location);

// ── All locations (for parent picker) ─────────────────────────────────────────
const { data: allLocations } = useAllLocations();

// ── Parent picker state ────────────────────────────────────────────────────────
const selectedParentId = ref<string | null>(
  props.location?.parent_id ?? props.parentId ?? null,
);

// Full ancestor chain for breadcrumb (root → … → direct parent)
const ancestors = computed(() => {
  if (!selectedParentId.value || !allLocations.value?.length) return [];
  const chain: Location[] = [];
  let current = allLocations.value.find((l) => l.id === selectedParentId.value);
  while (current && chain.length < 10) {
    chain.unshift(current);
    current = current.parent_id ? allLocations.value!.find((l) => l.id === current!.parent_id) : undefined;
  }
  return chain;
});

// EntityCombobox uses "" for "none"; selectedParentId uses null
const parentIdStr = computed({
  get: () => selectedParentId.value ?? "",
  set: (v: string) => { selectedParentId.value = v || null; },
});

const parentOptions = computed(() =>
  (allLocations.value ?? []).filter((l) => l.id !== props.location?.id),
);

// ── Fetch children (only when editing existing) ────────────────────────────────
const { data: children, isLoading: childrenLoading } = props.location
  ? useLocations(props.location.id)
  : { data: ref([]), isLoading: ref(false) };

// ── Child combobox ─────────────────────────────────────────────────────────────
const { mutateAsync: reparent } = useUpdateLocation();
const childSearch = ref("");
const childDropdownOpen = ref(false);

const childOptions = computed(() => {
  const q = childSearch.value.toLowerCase().trim();
  const childIds = new Set((children.value ?? []).map((c: Location) => c.id));
  return (allLocations.value ?? []).filter((l) =>
    l.id !== props.location?.id &&
    !childIds.has(l.id) &&
    (q === "" || l.name.toLowerCase().includes(q)),
  ).slice(0, 8);
});

async function addChild(loc: Location) {
  childSearch.value = "";
  childDropdownOpen.value = false;
  await reparent({ id: loc.id, update: { parent_id: props.location!.id } });
}

function onChildBlur() {
  setTimeout(() => { childDropdownOpen.value = false; }, 150);
}

function createChild() {
  const query: Record<string, string> = { parent: props.location!.id };
  if (childSearch.value.trim()) query.name = childSearch.value.trim();
  childSearch.value = "";
  childDropdownOpen.value = false;
  router.push({ path: "/locations/new", query });
}

// ── NPCs + Encounters at this location (includes descendants) ──────────────────
function collectDescendantIds(id: string, allLocs: Location[]): string[] {
  const result: string[] = [id];
  for (const loc of allLocs) {
    if (loc.parent_id === id) result.push(...collectDescendantIds(loc.id, allLocs));
  }
  return result;
}

const npcLocationIds = computed(() => {
  if (!props.location || !allLocations.value?.length) return [];
  return collectDescendantIds(props.location.id, allLocations.value);
});

const { data: locationNpcs } = props.location
  ? useNpcsByLocations(npcLocationIds)
  : { data: ref([]) };
const { data: locationEncounters } = props.location
  ? useEncountersByLocation(props.location.id)
  : { data: ref([]) };

// ── Form state ─────────────────────────────────────────────────────────────────
const name         = ref(props.location?.name ?? props.initialName ?? "");
const locationType = ref<LocationType>(props.location?.location_type ?? "other");
const tags         = ref<string[]>(props.location?.tags ? [...props.location.tags] : []);
const imageUrl     = ref<string | null>(props.location?.image_url ?? null);
const saving       = ref(false);
const saveError    = ref("");


// ── Description ────────────────────────────────────────────────────────────────
const description = ref<string>(props.location?.description ?? "");

// ── Player sharing ─────────────────────────────────────────────────────────────
const sharedWithPlayers   = ref<boolean>(props.location?.shared_with_players ?? false);
const playerVisibleTo     = ref<string[] | null>(props.location?.player_visible_to ?? null);
const playerSummary       = ref<string>(props.location?.player_summary ?? "");
const isDescriptionShared = ref<boolean>(props.location?.is_description_shared ?? false);
const isNpcsShared        = ref<boolean>(props.location?.is_npcs_shared ?? false);

// ── Map ────────────────────────────────────────────────────────────────────────
const mapUrl      = ref<string | null>(props.location?.map_url ?? null);
const mapPins     = ref<MapPinType[]>(props.location?.map_pins ? [...props.location.map_pins] : []);
const isMapShared = ref<boolean>(props.location?.is_map_shared ?? false);
const mapCompact  = ref(true);

// Keep denormalized pin metadata (type/name/image) in sync with live children data
// so saved maps always reflect the current child state (fixes player view colors).
watch(
  children,
  (currentChildren) => {
    if (!currentChildren?.length || !mapPins.value.length) return;
    mapPins.value = mapPins.value.map((pin) => {
      const child = (currentChildren as Location[]).find((c) => c.id === pin.child_location_id);
      return child
        ? { ...pin, child_type: child.location_type, child_name: child.name, child_image_url: child.image_url ?? null }
        : pin;
    });
  },
  { immediate: true },
);

const mapFileInput = ref<HTMLInputElement | null>(null);
const { isUploading: isMapUploading, upload: uploadMapFile, remove: removeMapFile } = useImageUpload("location-images");

async function onMapFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const oldUrl = mapUrl.value;
  const url = await uploadMapFile(file);
  if (url) {
    mapUrl.value = url;
    if (oldUrl) await removeMapFile(oldUrl);
  }
  (e.target as HTMLInputElement).value = "";
}

async function clearMap() {
  if (mapUrl.value) await removeMapFile(mapUrl.value);
  mapUrl.value = null;
  mapPins.value = [];
}

// ── CRUD ───────────────────────────────────────────────────────────────────────
const { mutateAsync: create } = useCreateLocation();
const { mutateAsync: update } = useUpdateLocation();
const { mutateAsync: del }    = useDeleteLocation();

function buildPayload() {
  return {
    name:          name.value.trim() || "Unnamed Location",
    location_type: locationType.value,
    description:   description.value,
    notes:         null,
    tags:          tags.value,
    parent_id:     selectedParentId.value,
    image_url:     imageUrl.value,
    map_url:               mapUrl.value,
    map_pins:              mapPins.value,
    is_map_shared:         isMapShared.value,
    shared_with_players:   sharedWithPlayers.value,
    player_visible_to:     playerVisibleTo.value,
    player_summary:        playerSummary.value || null,
    is_description_shared: isDescriptionShared.value,
    is_npcs_shared:        isNpcsShared.value,
  };
}

async function save() {
  if (!name.value.trim()) return;
  saving.value = true;
  saveError.value = "";
  try {
    if (props.location) {
      await update({ id: props.location.id, update: buildPayload() });
      router.push(`/locations/${props.location.id}`);
    } else {
      const created = await create(buildPayload());
      router.push(`/locations/${created.id}`);
    }
  } catch (e: unknown) {
    saveError.value = e instanceof Error ? e.message : "Failed to save";
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!props.location) return;
  if (!await confirm(`Delete "${props.location.name}"? Sub-locations will also be deleted.`)) return;
  const parentId = props.location.parent_id;
  await del(props.location.id);
  router.push(parentId ? `/locations/${parentId}` : "/locations");
}
</script>

