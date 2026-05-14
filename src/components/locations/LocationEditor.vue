<template>
  <div class="flex flex-col gap-4">
    <!-- Breadcrumb: full ancestor chain -->
    <div
      v-if="ancestors.length || isNew"
      class="flex flex-wrap items-center gap-1 text-xs font-fell text-muted-foreground"
    >
      <RouterLink
        to="/locations"
        class="hover:text-foreground transition-colors"
        >Locations</RouterLink
      >
      <template v-for="anc in ancestors" :key="anc.id">
        <span class="opacity-40">/</span>
        <RouterLink
          :to="`/locations/${anc.id}`"
          class="hover:text-foreground transition-colors"
        >
          {{ anc.name }}
        </RouterLink>
      </template>
      <span class="opacity-40">/</span>
      <span class="text-foreground">{{
        isNew ? "New Location" : props.location?.name
      }}</span>
    </div>

    <!-- Action row: type + visibility + save + delete -->
    <EntityEditorActionBar
      :title="name"
      title-placeholder="Location name…"
      :exists="!isNew"
      :can-save="!!name.trim()"
      :saving="saving"
      :error="saveError"
      :visible-to="!isNew ? playerVisibleTo : undefined"
      @update:title="name = $event"
      @update:visible-to="playerVisibleTo = $event"
      @save="save"
      @cancel="onCancel"
      @delete="remove"
    >
      <template #controls>
        <select
          v-model="locationType"
          class="bg-card border border-border rounded-md px-3 py-2 font-cinzel text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option
            v-for="(label, value) in LOCATION_TYPE_LABELS"
            :key="value"
            :value="value"
          >
            {{ label }}
          </option>
        </select>
      </template>
    </EntityEditorActionBar>

    <!--
      Sigil + identity fields.
      Mobile: stack vertically — sigil on top (capped to avoid eating the
      viewport), then Parent / Child / Tags / Calendar pins below at full
      viewport width. Gives the children list + comboboxes the whole screen
      to wrap in.
      Desktop (md+): original side-by-side layout, 12rem sigil on the left.
    -->
    <div class="flex flex-col gap-3 md:flex-row md:gap-5">
      <!-- Sigil -->
      <div class="w-full max-w-48 mx-auto md:mx-0 md:w-48 md:shrink-0">
        <EntityImageBlock
          :model-value="imageUrl"
          bucket="location-images"
          @update:model-value="imageUrl = $event"
        />
      </div>

      <!-- Parent, tags, sub-locations, calendar pins -->
      <div class="flex-1 flex flex-col gap-3 min-w-0">
        <LocationHierarchyPanel
          :location-id="props.location?.id ?? null"
          :parent-id="selectedParentId"
          :parent-options="parentOptions"
          :all-locations="allLocations ?? []"
          :related-location-ids="relatedLocationIds"
          :is-new="isNew"
          @update:parent-id="selectedParentId = $event"
          @update:related-location-ids="relatedLocationIds = $event"
          @create-child="createChild"
        />

        <div class="flex items-start gap-2">
          <span
            class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider shrink-0 w-16 flex items-center gap-1 pt-1.5"
          >
            <IconTag class="h-3.5 w-3.5" />Tags
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

    <!-- Description editor -->
    <div class="flex flex-col gap-1">
      <span
        class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider"
        >Description</span
      >
      <RichTextEditor
        v-model="description"
        placeholder="Describe this location…"
        min-height="120px"
        :ai-context="`location description — ${name || 'unnamed location'}`"
      />
    </div>

    <!-- Player sharing options -->
    <LocationSharingPanel
      v-if="!isNew"
      :player-summary="playerSummary"
      :is-description-shared="isDescriptionShared"
      :is-npcs-shared="isNpcsShared"
      :is-inventory-shared="isInventoryShared"
      :show-inventory-toggle="STORE_LOCATION_TYPES.has(locationType)"
      @update:player-summary="playerSummary = $event"
      @update:is-description-shared="isDescriptionShared = $event"
      @update:is-npcs-shared="isNpcsShared = $event"
      @update:is-inventory-shared="isInventoryShared = $event"
    />

    <!-- Store inventory (store / tavern / inn only) -->
    <template v-if="!isNew && STORE_LOCATION_TYPES.has(locationType)">
      <!-- Owner NPC — used as the sender name on vendor offer messages -->
      <div class="flex items-center gap-3">
        <span class="font-cinzel text-xs text-foreground shrink-0"
          >Proprietor</span
        >
        <EntityCombobox
          :model-value="npcOwnerId"
          :options="npcOptions"
          placeholder="No proprietor set…"
          class="flex-1"
          @update:model-value="npcOwnerId = $event"
        />
      </div>
      <StoreInventory
        :location-id="props.location!.id"
        :owner-npc-name="ownerNpcName"
      />
    </template>

    <!-- NPCs, encounters, and party members at this location -->
    <LocationResidents
      v-if="!isNew"
      :location-id="props.location!.id"
      :npc-location-ids="npcLocationIds"
      :all-locations="allLocations ?? []"
    />

    <!-- Map section -->
    <LocationMapEditor
      :location-id="props.location?.id ?? null"
      :map-url="mapUrl"
      :map-pins="mapPins"
      :is-map-shared="isMapShared"
      :is-battle-map="isBattleMap"
      :is-new="isNew"
      :children="children ?? []"
      :map-pinnable-children="mapPinnableChildren"
      :source-map-id="props.location?.source_map_id ?? null"
      :grid-calibration="props.location?.grid_calibration ?? null"
      @update:map-url="onMapUrlUpdate"
      @update:map-pins="mapPins = $event"
      @update:is-map-shared="isMapShared = $event"
      @update:is-battle-map="isBattleMap = $event"
      @open-calibration="calibrationOpen = true"
    />

    <GridCalibrationDialog
      :open="calibrationOpen"
      :map-url="mapUrl"
      :existing="props.location?.grid_calibration ?? null"
      @cancel="calibrationOpen = false"
      @save="onCalibrationSave"
    />
  </div>
</template>

<script setup lang="ts">
import { useConfirm } from "@/composables/useConfirm";
const { confirm } = useConfirm();
import { ref, computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { IconTag } from '@/lib/icons';
import EntityEditorActionBar from "@/components/common/EntityEditorActionBar.vue";
import EntityImageBlock from "@/components/common/EntityImageBlock.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import TagInput from "@/components/common/TagInput.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import GridCalibrationDialog from "@/components/locations/GridCalibrationDialog.vue";
import StoreInventory from "@/components/locations/StoreInventory.vue";
import LocationHierarchyPanel from "@/components/locations/LocationHierarchyPanel.vue";
import LocationSharingPanel from "@/components/locations/LocationSharingPanel.vue";
import LocationResidents from "@/components/locations/LocationResidents.vue";
import LocationMapEditor from "@/components/locations/LocationMapEditor.vue";
import { useNpcs } from "@/composables/useNpcs";
import EntityCalendarSection from "@/components/calendar/EntityCalendarSection.vue";
import {
  useLocations,
  useAllLocations,
  useCreateLocation,
  useUpdateLocation,
  useUpdateLocationGridCalibration,
  useDeleteLocation,
  getPinnableDescendants,
} from "@/composables/useLocations";
import type { GridCalibration } from "@/types/location.types";
import {
  LOCATION_TYPE_LABELS,
  STORE_LOCATION_TYPES,
} from "@/types/location.types";
import type {
  Location,
  LocationType,
  MapPin as MapPinType,
} from "@/types/location.types";

const props = defineProps<{
  location: Location | null;
  parentId?: string | null;
  initialName?: string;
}>();

const router = useRouter();

const route = useRoute();
function onCancel() {
  const { edit: _edit, ...rest } = route.query;
  router.push({ query: rest });
}
const isNew = computed(() => !props.location);

// ── All locations (for parent picker + hierarchy panel) ───────────────────────
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
    current = current.parent_id
      ? allLocations.value!.find((l) => l.id === current!.parent_id)
      : undefined;
  }
  return chain;
});

const parentOptions = computed(() =>
  (allLocations.value ?? []).filter((l) => l.id !== props.location?.id),
);

// ── Fetch children (only when editing existing) ────────────────────────────────
const { data: children } = props.location
  ? useLocations(props.location.id)
  : { data: ref<Location[]>([]) };

// ── Pinnable descendants for the map's "Unplaced" picker ──────────────────────
const mapPinnableChildren = computed(() => {
  if (!props.location || !allLocations.value?.length) return [];
  return getPinnableDescendants(props.location.id, allLocations.value);
});

// ── Related locations ──────────────────────────────────────────────────────────
const relatedLocationIds = ref<string[]>(
  props.location?.related_location_ids ? [...props.location.related_location_ids] : [],
);

// ── Create child helper (invoked from LocationHierarchyPanel) ─────────────────
function createChild(name: string) {
  const query: Record<string, string> = { parent: props.location!.id };
  if (name) query.name = name;
  router.push({ path: "/locations/new", query });
}

// ── NPCs at this location (includes descendants) ───────────────────────────────
function collectDescendantIds(
  id: string,
  allLocs: Location[],
  visited = new Set<string>(),
): string[] {
  if (visited.has(id)) return [];
  visited.add(id);
  const result: string[] = [id];
  for (const loc of allLocs) {
    if (loc.parent_id === id)
      result.push(...collectDescendantIds(loc.id, allLocs, visited));
  }
  return result;
}

const npcLocationIds = computed(() => {
  if (!props.location || !allLocations.value?.length) return [];
  return collectDescendantIds(props.location.id, allLocations.value);
});

// ── Form state ─────────────────────────────────────────────────────────────────
const name = ref(props.location?.name ?? props.initialName ?? "");
const locationType = ref<LocationType>(
  props.location?.location_type ?? "other",
);
const tags = ref<string[]>(
  props.location?.tags ? [...props.location.tags] : [],
);
const imageUrl = ref<string | null>(props.location?.image_url ?? null);
const saving = ref(false);
const saveError = ref("");

// ── Description ────────────────────────────────────────────────────────────────
const description = ref<string>(props.location?.description ?? "");

// ── Player sharing ─────────────────────────────────────────────────────────────
const playerVisibleTo = ref<string[]>(props.location?.player_visible_to ?? []);
const playerSummary = ref<string>(props.location?.player_summary ?? "");
const isDescriptionShared = ref<boolean>(
  props.location?.is_description_shared ?? false,
);
const isNpcsShared = ref<boolean>(props.location?.is_npcs_shared ?? false);
const isInventoryShared = ref<boolean>(
  props.location?.is_inventory_shared ?? false,
);
const npcOwnerId = ref<string>(props.location?.npc_owner_id ?? "");
const { data: allNpcs } = useNpcs();
const npcOptions = computed(() =>
  (allNpcs.value ?? []).map((n) => ({ id: n.id, name: n.name })),
);
const ownerNpcName = computed(
  () => allNpcs.value?.find((n) => n.id === npcOwnerId.value)?.name ?? null,
);

// ── Map ────────────────────────────────────────────────────────────────────────
const mapUrl = ref<string | null>(props.location?.map_url ?? null);
const mapPins = ref<MapPinType[]>(
  props.location?.map_pins ? [...props.location.map_pins] : [],
);
const isMapShared = ref<boolean>(props.location?.is_map_shared ?? false);
const isBattleMap = ref<boolean>(props.location?.is_battle_map ?? false);

// Keep denormalized pin metadata (type/name/image) in sync with live children data
watch(
  children,
  (currentChildren) => {
    if (!currentChildren?.length || !mapPins.value.length) return;
    mapPins.value = mapPins.value.map((pin) => {
      const child = (currentChildren as Location[]).find(
        (c) => c.id === pin.child_location_id,
      );
      return child
        ? {
            ...pin,
            child_type: child.location_type,
            child_name: child.name,
            child_image_url: child.image_url ?? null,
          }
        : pin;
    });
  },
  { immediate: true },
);

function onMapUrlUpdate(url: string | null) {
  mapUrl.value = url;
  if (!url) mapPins.value = [];
}

// VTT grid calibration dialog state
const calibrationOpen = ref(false);
const updateGridCalibration = useUpdateLocationGridCalibration();
async function onCalibrationSave(calibration: GridCalibration) {
  if (!props.location?.id) return;
  await updateGridCalibration.mutateAsync({ id: props.location.id, calibration });
  calibrationOpen.value = false;
}

// ── CRUD ───────────────────────────────────────────────────────────────────────
const { mutateAsync: create } = useCreateLocation();
const { mutateAsync: update } = useUpdateLocation();
const { mutateAsync: del } = useDeleteLocation();

function buildPayload() {
  return {
    name: name.value.trim() || "Unnamed Location",
    location_type: locationType.value,
    description: description.value,
    notes: null,
    tags: tags.value,
    parent_id: selectedParentId.value,
    image_url: imageUrl.value,
    map_url: mapUrl.value,
    map_pins: mapPins.value,
    is_map_shared: isMapShared.value,
    is_battle_map: isBattleMap.value,
    player_visible_to: playerVisibleTo.value,
    player_summary: playerSummary.value || null,
    is_description_shared: isDescriptionShared.value,
    is_npcs_shared: isNpcsShared.value,
    is_inventory_shared: isInventoryShared.value,
    npc_owner_id: npcOwnerId.value || null,
    related_location_ids: relatedLocationIds.value,
    source_map_id: props.location?.source_map_id ?? null,
    grid_calibration: props.location?.grid_calibration ?? null,
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
  if (
    !(await confirm(
      `Delete "${props.location.name}"? Sub-locations will also be deleted.`,
    ))
  )
    return;
  const parentId = props.location.parent_id;
  await del(props.location.id);
  router.push(parentId ? `/locations/${parentId}` : "/locations");
}
</script>
