<template>
  <section class="flex flex-col gap-3" :aria-label="verticalOnly ? 'Vertical ways out' : 'Ways out'">
    <!-- `hideHeader` for a caller that already renders its own section
         heading (`LocationDetailSections`'s "Ways out" `h2`) — a second
         "Ways out" title right beneath the first read as a mistake, not
         emphasis. -->
    <header v-if="!hideHeader" class="flex items-center gap-2">
      <IconDoor class="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <h3 class="font-cinzel text-sm font-bold text-foreground">{{ verticalOnly ? "Vertical ways out" : "Ways out" }}</h3>
      <span
        v-if="rows.length"
        class="ml-auto rounded bg-muted px-1.5 py-0.5 text-label uppercase text-muted-foreground"
      >{{ rows.length }}</span>
    </header>

    <div v-if="rows.length" class="flex flex-col gap-1.5">
      <div v-for="row in rows" :key="row.door.id" class="flex flex-col gap-1.5 rounded-md border border-border bg-card px-3 py-2">
        <div class="flex min-w-0 items-center gap-2">
          <component :is="DOOR_KIND_ICONS[row.door.door_kind]" class="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span class="min-w-0 flex-1 truncate font-cinzel text-xs font-semibold text-foreground">{{ row.title }}</span>

          <span v-if="row.door.is_secret" class="shrink-0 rounded bg-tone-arcane/15 px-1.5 py-0.5 text-label uppercase text-ink-arcane">secret</span>
          <span v-if="row.door.starts_locked" class="shrink-0 rounded bg-tone-caution/15 px-1.5 py-0.5 text-label uppercase text-ink-caution">locked</span>
          <span v-if="row.isVertical" class="shrink-0 rounded bg-tone-info/15 px-1.5 py-0.5 text-label uppercase text-ink-info">{{ DOOR_KIND_LABELS[row.door.door_kind] }}</span>

          <template v-if="!verticalOnly">
            <AppButton
              variant="ghost"
              size="icon-xs"
              :icon="expandedIds.has(row.door.id) ? IconChevronUp : IconChevronDown"
              tooltip="Edit this way out"
              class="shrink-0"
              @click="toggleExpanded(row.door.id)"
            />
            <AppButton
              variant="ghost"
              tone="danger"
              size="icon-xs"
              :icon="IconClose"
              tooltip="Remove this way out"
              class="shrink-0"
              @click="removeDoor(row.door.id)"
            />
          </template>
        </div>
        <p class="pl-6 text-caption text-muted-foreground">{{ row.subtitle }}</p>

        <Transition v-if="!verticalOnly" v-bind="drawerTransition()">
          <div v-if="expandedIds.has(row.door.id)" class="flex flex-col gap-2 border-t border-border pt-2">
            <div class="flex flex-wrap items-center gap-4">
              <AppButton
                variant="ghost"
                size="xs"
                :active="row.door.is_one_way"
                tooltip="Passable only from this side"
                @click="toggleFlag(row.door, 'is_one_way')"
              >One-way</AppButton>
              <AppButton
                variant="ghost"
                size="icon-xs"
                :icon="IconLock"
                :active="row.door.starts_locked"
                :tooltip="row.door.lock_note ? `Starts locked — ${row.door.lock_note}` : 'Starts locked'"
                @click="toggleFlag(row.door, 'starts_locked')"
              />
              <AppButton
                variant="ghost"
                size="icon-xs"
                :icon="IconHide"
                :active="row.door.is_secret"
                tooltip="Secret — hidden until the party finds it"
                @click="toggleFlag(row.door, 'is_secret')"
              />
              <AppSelect
                :model-value="row.door.door_kind"
                size="xs"
                aria-label="Way-out kind"
                @update:model-value="(kind) => commit(row.door, { door_kind: kind as DoorKind })"
              >
                <option v-for="kind in DOOR_KINDS" :key="kind" :value="kind">{{ DOOR_KIND_LABELS[kind] }}</option>
              </AppSelect>
            </div>

            <PlacementNoteInput
              v-if="row.door.starts_locked"
              :model-value="row.door.lock_note"
              placeholder="What opens it — e.g. the brass key"
              @commit="(value) => onLockNoteCommit(row.door, value)"
            />
            <PlacementNoteInput
              :model-value="row.door.label"
              placeholder="Label — e.g. iron grille"
              @commit="(value) => onLabelCommit(row.door, value)"
            />

            <DoorFeatureCard
              v-if="row.door.dungeon_feature_id && !changingFeatureIds.has(row.door.id)"
              :feature-id="row.door.dungeon_feature_id"
            >
              <template #actions>
                <AppButton label="Change feature" size="xs" variant="subtle" @click="startChangingFeature(row.door.id)" />
              </template>
            </DoorFeatureCard>
            <div v-else class="flex flex-col gap-1.5">
              <EntityCombobox
                :model-value="row.door.dungeon_feature_id ?? ''"
                :options="featureOptions"
                placeholder="Governed by a feature…"
                @update:model-value="(featureId) => onFeatureSelect(row.door, featureId)"
              />
              <AppButton
                v-if="!showAllFeatures && otherFeatures.length"
                variant="link"
                size="inline-xs"
                label="Show all features"
                class="self-start"
                @click="showAllFeatures = true"
              />
            </div>
          </div>
        </Transition>
      </div>
    </div>
    <p v-else class="text-caption italic text-muted-foreground">
      {{ verticalOnly ? "No ways up or down yet." : "No ways out yet — add one below." }}
    </p>

    <!-- Inline add -->
    <div v-if="!verticalOnly" class="flex flex-col gap-2 rounded-md border border-dashed border-border bg-background px-3 py-2">
      <div class="grid grid-cols-2 gap-2">
        <EntityCombobox v-model="newFromId" :options="spaces" placeholder="From…" />
        <EntityCombobox v-model="newToId" :options="toOptions" placeholder="To…" />
      </div>
      <AppSelect v-model="newKind" size="xs" aria-label="Way-out kind">
        <option v-for="kind in DOOR_KINDS" :key="kind" :value="kind">{{ DOOR_KIND_LABELS[kind] }}</option>
      </AppSelect>
      <AppInput
        v-model="newLabel"
        type="text"
        tone="bare"
        size="xs"
        placeholder="Label — e.g. iron grille"
        class="px-0 text-caption"
      />
      <div class="flex flex-wrap items-center gap-4">
        <AppCheckbox v-model="newIsOneWay" label="One-way" size="sm" />
        <AppCheckbox v-model="newStartsLocked" label="Starts locked" size="sm" />
        <AppCheckbox v-model="newIsSecret" label="Secret" size="sm" />
      </div>
      <AppInput
        v-if="newStartsLocked"
        v-model="newLockNote"
        type="text"
        size="xs"
        placeholder="What opens it — the brass key, DC 15 thieves' tools…"
      />
      <AppButton
        variant="ghost"
        size="inline-xs"
        label="Add"
        class="self-start"
        :disabled="!newFromId || !newToId || newFromId === newToId || isCreating"
        @click="addDoor"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * "Ways out", lifted to the site (#868, epic #780, frames 03/06/11).
 * `LocationDoors.vue` reads one room's doors from that room's own point of
 * view; a site-tier place has as many as eight of them, and no one-room panel
 * ever showed the graph as a whole. This panel reads `useSiteDoors` directly —
 * every door whose origin is one of the site's own bindable spaces (#868
 * widened the endpoint guard from "two rooms" to "two bindable spaces sharing
 * a parent"), so unlike the room-level composable this never needs
 * `doorsFromRoomPerspective`'s incoming-door merge: a door between two
 * children of this site always has its `from` side among `spaces` already.
 *
 * `verticalOnly` renders the frame-06 variant — title, filtered rows, no add
 * form — for a levels rail (S6) to mount without also offering to author a
 * new door from that context.
 *
 * The three authored flags are live toggles here, exactly as `LocationDoors.vue`
 * implements them: one graph, one interaction model, whether you are reading it
 * from a room or from the site. Editing `door_kind` after creation is likewise
 * allowed — `LocationDoorUpdate` always has — because only the *endpoints* are
 * a delete-and-recreate; everything else, including which feature governs a
 * door, is prep that gets revised.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import PlacementNoteInput from "@/components/locations/PlacementNoteInput.vue";
import DoorFeatureCard from "@/components/locations/DoorFeatureCard.vue";
import { drawerTransition } from "@/lib/motion";
import { IconChevronDown, IconChevronUp, IconClose, IconDoor, IconHide, IconLock } from "@/lib/icons";
import { useToast } from "@/composables/useToast";
import { useDungeonFeatures } from "@/composables/dungeon-features/useDungeonFeatures";
import { useSiteDoors } from "@/composables/locations/useSiteDoors";
import type { SiteDoorWithSpaces } from "@/composables/locations/useSiteDoors";
import {
  useCreateLocationDoor,
  useUpdateLocationDoor,
  useDeleteLocationDoor,
} from "@/composables/locations/useLocationDoors";
import { DOOR_KIND_ICONS, doorSubtitle, doorTitle, verticalWays } from "@/lib/locations/doors";
import { DOOR_KINDS, DOOR_KIND_LABELS, VERTICAL_DOOR_KINDS } from "@/types/locationDoor.types";
import type { DoorKind, LocationDoorInsert, LocationDoorUpdate } from "@/types/locationDoor.types";
import type { DungeonFeatureType } from "@/types/dungeonFeature.types";
import type { LocationType } from "@/types/location.types";

export interface WaysOutSpace {
  id: string;
  name: string;
  location_type: LocationType;
}

// `siteId` is part of the contract (S6 mounts this on a levels rail and will
// key/route off it) but nothing in this story's rendering needs it — every
// door this panel reads is already scoped by `spaces`, which is exhaustive
// for the site it was fetched from.
const { spaces, verticalOnly = false, hideHeader = false } = defineProps<{
  siteId: string;
  spaces: WaysOutSpace[];
  /** Renders the frame-06 "Vertical ways out" variant: filtered, read-only,
   *  no add form — for a levels rail to mount. */
  verticalOnly?: boolean;
  /** Suppresses the icon+title+count header — for a caller (`LocationDetailSections`)
   *  that already renders its own "Ways out" section heading above this. */
  hideHeader?: boolean;
}>();

const toast = useToast();

// ── Doors ───────────────────────────────────────────────────────────────────────
const spaceIds = computed(() => spaces.map((s) => s.id));
const doorsQuery = useSiteDoors(spaceIds);
const doors = computed(() => doorsQuery.data.value ?? []);
const names = computed(() => new Map(spaces.map((s) => [s.id, s.name])));

const filteredDoors = computed(() => (verticalOnly ? verticalWays(doors.value) : doors.value));

interface WaysOutRow {
  door: SiteDoorWithSpaces;
  title: string;
  subtitle: string;
  isVertical: boolean;
}

const rows = computed<WaysOutRow[]>(() =>
  [...filteredDoors.value]
    .map((door) => ({
      door,
      title: doorTitle(door, names.value),
      subtitle: doorSubtitle(door),
      isVertical: VERTICAL_DOOR_KINDS.has(door.door_kind),
    }))
    .sort((a, b) => a.title.localeCompare(b.title)),
);

// ── Expand / collapse ────────────────────────────────────────────────────────────
const expandedIds = ref(new Set<string>());
function toggleExpanded(doorId: string) {
  const next = new Set(expandedIds.value);
  if (next.has(doorId)) next.delete(doorId);
  else next.add(doorId);
  expandedIds.value = next;
}

// ── Editing an existing door — same authored-prep model as LocationDoors.vue ────
const { mutate: updateDoor } = useUpdateLocationDoor();

function commit(door: SiteDoorWithSpaces, update: LocationDoorUpdate) {
  updateDoor({ id: door.id, update }, { onError: (e) => toast.error(toast.fromError(e)) });
}

function toggleFlag(door: SiteDoorWithSpaces, flag: "is_one_way" | "starts_locked" | "is_secret") {
  commit(door, { [flag]: !door[flag] });
}

function onLabelCommit(door: SiteDoorWithSpaces, value: string) {
  const next = value.trim();
  if (next !== door.label) commit(door, { label: next });
}

function onLockNoteCommit(door: SiteDoorWithSpaces, value: string) {
  const next = value.trim();
  const current = door.lock_note ?? "";
  if (next !== current) commit(door, { lock_note: next === "" ? null : next });
}

// ── Governing feature (frame 11) ─────────────────────────────────────────────────
const CONNECTION_FEATURE_TYPES: ReadonlySet<DungeonFeatureType> = new Set([
  "Secret Door",
  "Hidden Passage",
  "Moving Wall",
]);
const showAllFeatures = ref(false);
const changingFeatureIds = ref(new Set<string>());
function startChangingFeature(doorId: string) {
  changingFeatureIds.value = new Set([...changingFeatureIds.value, doorId]);
}

const { data: allFeatures } = useDungeonFeatures();
const connectionFeatures = computed(() =>
  (allFeatures.value ?? []).filter((f) => CONNECTION_FEATURE_TYPES.has(f.feature_type)),
);
const otherFeatures = computed(() =>
  (allFeatures.value ?? []).filter((f) => !CONNECTION_FEATURE_TYPES.has(f.feature_type)),
);
const featureOptions = computed(() =>
  showAllFeatures.value ? [...connectionFeatures.value, ...otherFeatures.value] : connectionFeatures.value,
);

function onFeatureSelect(door: SiteDoorWithSpaces, featureId: string) {
  commit(door, { dungeon_feature_id: featureId || null });
  if (changingFeatureIds.value.has(door.id)) {
    const next = new Set(changingFeatureIds.value);
    next.delete(door.id);
    changingFeatureIds.value = next;
  }
}

// ── Remove ────────────────────────────────────────────────────────────────────────
const { mutate: deleteDoor } = useDeleteLocationDoor();
function removeDoor(id: string) {
  deleteDoor(id, { onError: (e) => toast.error(toast.fromError(e)) });
}

// ── Inline add ────────────────────────────────────────────────────────────────────
const newFromId = ref("");
const newToId = ref("");
const newKind = ref<DoorKind>("door");
const newLabel = ref("");
const newIsOneWay = ref(false);
const newStartsLocked = ref(false);
const newIsSecret = ref(false);
const newLockNote = ref("");

// A door cannot join a space to itself — excluded from the "to" picker rather
// than merely validated on submit, so the DM never selects the invalid pair.
const toOptions = computed(() => spaces.filter((s) => s.id !== newFromId.value));

const { mutate: createDoor, isPending: isCreating } = useCreateLocationDoor();

function buildInsert(): LocationDoorInsert {
  return {
    from_location_id: newFromId.value,
    to_location_id: newToId.value,
    label: newLabel.value.trim(),
    is_one_way: newIsOneWay.value,
    starts_locked: newStartsLocked.value,
    lock_note: newStartsLocked.value ? newLockNote.value.trim() || null : null,
    is_secret: newIsSecret.value,
    door_kind: newKind.value,
  };
}

function addDoor() {
  if (!newFromId.value || !newToId.value || newFromId.value === newToId.value) return;
  createDoor(buildInsert(), {
    onSuccess: () => {
      newFromId.value = "";
      newToId.value = "";
      newKind.value = "door";
      newLabel.value = "";
      newIsOneWay.value = false;
      newStartsLocked.value = false;
      newIsSecret.value = false;
      newLockNote.value = "";
    },
    onError: (e) => toast.error(toast.fromError(e)),
  });
}
</script>
