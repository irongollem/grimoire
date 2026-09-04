<template>
  <div class="flex flex-col gap-3">
    <!-- Existing ways out -->
    <div v-if="doors.length" class="flex flex-col gap-1.5">
      <div
        v-for="view in doors"
        :key="view.door.id"
        class="flex flex-col gap-1.5 rounded-md border border-border bg-card px-3 py-2"
      >
        <div class="flex items-center gap-2">
          <RouterLink
            :to="`/locations/${view.otherRoomId}`"
            class="min-w-0 flex-1 truncate font-cinzel text-xs font-semibold text-foreground transition-colors hover:text-primary"
          >{{ view.otherRoomName }}</RouterLink>

          <AppButton
            variant="ghost"
            size="xs"
            :active="view.door.is_one_way"
            tooltip="Passable only from this side"
            class="shrink-0"
            @click="toggleFlag(view.door, 'is_one_way')"
          >One-way</AppButton>
          <AppButton
            variant="ghost"
            size="icon-xs"
            :icon="IconLock"
            :active="view.door.starts_locked"
            :tooltip="view.door.lock_note ? `Starts locked — ${view.door.lock_note}` : 'Starts locked'"
            class="shrink-0"
            @click="toggleFlag(view.door, 'starts_locked')"
          />
          <AppButton
            variant="ghost"
            size="icon-xs"
            :icon="IconHide"
            :active="view.door.is_secret"
            tooltip="Secret — hidden until the party finds it"
            class="shrink-0"
            @click="toggleFlag(view.door, 'is_secret')"
          />

          <AppButton
            variant="ghost"
            tone="danger"
            size="icon-xs"
            :icon="IconClose"
            tooltip="Remove this door"
            class="shrink-0"
            @click="removeDoor(view.door.id)"
          />
        </div>
        <AppInput
          v-if="view.door.starts_locked"
          :model-value="view.door.lock_note ?? ''"
          :model-modifiers="{ lazy: true }"
          type="text"
          tone="bare"
          size="xs"
          placeholder="What opens it — e.g. the brass key"
          class="px-0 text-caption"
          @update:model-value="(value) => onLockNoteCommit(view.door, value as string)"
        />
        <AppInput
          :model-value="view.door.label"
          :model-modifiers="{ lazy: true }"
          type="text"
          tone="bare"
          size="xs"
          placeholder="Label — e.g. iron grille"
          class="px-0 text-caption"
          @update:model-value="(value) => onLabelCommit(view.door, value as string)"
        />
      </div>
    </div>
    <p v-else class="text-caption text-muted-foreground italic">No ways out yet — add one below.</p>

    <!-- Inline add -->
    <div class="flex flex-col gap-2 rounded-md border border-dashed border-border bg-background px-3 py-2">
      <EntityCombobox v-model="newRoomId" :options="siblingRooms" placeholder="Pick a room…" />
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
        :disabled="!newRoomId || isCreating"
        @click="addDoor"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * "Ways out" — named, directional, lockable doors between rooms in one site
 * (#785, epic #780). Mirrors `SiteRoomsPanel` / `LocationPlacements`' shape:
 * self-contained, always-editable, keyed off scalar props rather than a route
 * param so `AtlasPlacePane` can reuse one mounted instance across selections.
 *
 * A door is stored once, directional (`from_location_id` -> `to_location_id`),
 * but this panel always creates it with `from_location_id` = the room it's
 * mounted on — the DM is always adding "a way out of the room I'm looking
 * at". `useLocationDoors` then merges outgoing doors with any bidirectional
 * incoming door into one "ways out" list, so a two-way door added from the
 * far room's panel still shows up here.
 *
 * The DB trigger (`guard_location_door_endpoints`) is the actual authority on
 * which rooms may be connected — this panel only restricts the picker to
 * *sibling* rooms (same `parent_id`, type `room`, excluding self) rather than
 * re-deriving that rule; a rejection still surfaces as a toast.
 *
 * The three flags are toggles, not live switches, and the distinction matters:
 * they say what the DM *authored* — this door starts locked, this one is
 * secret — and prep gets revised, so they stay editable. What they are not is a
 * record of play: whether the party has since opened or found a door is durable
 * site state with provenance and undo, and belongs to #787 keyed on the room.
 * Nothing here should ever be renamed to `is_locked` or `is_discovered`.
 */
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import AppButton from "@/components/common/AppButton.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import AppInput from "@/components/common/AppInput.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import { IconClose, IconHide, IconLock } from "@/lib/icons";
import { useToast } from "@/composables/useToast";
import { useLocations } from "@/composables/locations/useLocations";
import {
  useLocationDoors,
  useCreateLocationDoor,
  useUpdateLocationDoor,
  useDeleteLocationDoor,
} from "@/composables/locations/useLocationDoors";
import type { LocationDoorWithRooms } from "@/composables/locations/useLocationDoors";
import type { LocationDoorInsert, LocationDoorUpdate } from "@/types/locationDoor.types";

const { roomId, parentId } = defineProps<{ roomId: string; parentId: string | null }>();

const roomIdRef = computed(() => roomId);
const { doors } = useLocationDoors(roomIdRef);

const toast = useToast();

// ── Sibling picker ──────────────────────────────────────────────────────────────
// A room's parent is guaranteed non-null by `locations_room_parent_guard` —
// there is no such thing as a top-level room — so `parentId === null` here
// only means a malformed row; the picker degrades to empty rather than
// silently substituting a fake parent id and querying the wrong tree.
const parentIdRef = computed(() => parentId);
const { data: children } = useLocations(parentIdRef);
const siblingRooms = computed(() =>
  parentId
    ? (children.value ?? []).filter((l) => l.location_type === "room" && l.id !== roomId)
    : [],
);

// ── Add ─────────────────────────────────────────────────────────────────────────
const newRoomId = ref("");
const newLabel = ref("");
const newIsOneWay = ref(false);
const newStartsLocked = ref(false);
const newIsSecret = ref(false);
const newLockNote = ref("");

const { mutate: createDoor, isPending: isCreating } = useCreateLocationDoor();

function buildInsert(): LocationDoorInsert {
  return {
    from_location_id: roomId,
    to_location_id: newRoomId.value,
    label: newLabel.value.trim(),
    is_one_way: newIsOneWay.value,
    starts_locked: newStartsLocked.value,
    lock_note: newStartsLocked.value ? newLockNote.value.trim() || null : null,
    is_secret: newIsSecret.value,
  };
}

function addDoor() {
  if (!newRoomId.value) return;
  createDoor(buildInsert(), {
    onSuccess: () => {
      newRoomId.value = "";
      newLabel.value = "";
      newIsOneWay.value = false;
      newStartsLocked.value = false;
      newIsSecret.value = false;
      newLockNote.value = "";
    },
    // Surfaces both the endpoint guard (a room outside this site somehow
    // reached the picker) and the unique-route conflict (same pair + label).
    onError: (e) => toast.error(toast.fromError(e)),
  });
}

// ── Editing an existing door ────────────────────────────────────────────────────
// The three flags are authored prep, and prep gets revised: a DM who decides
// halfway through that the stair only goes down should not have to delete the
// door and lose its label to say so. Endpoints stay immutable — changing what a
// door connects makes it a different door.
const { mutate: updateDoor } = useUpdateLocationDoor();

type DoorFlag = "is_one_way" | "starts_locked" | "is_secret";

function commit(door: LocationDoorWithRooms, update: LocationDoorUpdate) {
  updateDoor({ id: door.id, update }, { onError: (e) => toast.error(toast.fromError(e)) });
}

function toggleFlag(door: LocationDoorWithRooms, flag: DoorFlag) {
  commit(door, { [flag]: !door[flag] });
}

function onLabelCommit(door: LocationDoorWithRooms, value: string) {
  const next = value.trim();
  if (next !== door.label) commit(door, { label: next });
}

function onLockNoteCommit(door: LocationDoorWithRooms, value: string) {
  const next = value.trim();
  const current = door.lock_note ?? "";
  if (next !== current) commit(door, { lock_note: next === "" ? null : next });
}

// ── Remove ──────────────────────────────────────────────────────────────────────
const { mutate: deleteDoor } = useDeleteLocationDoor();

function removeDoor(id: string) {
  deleteDoor(id, { onError: (e) => toast.error(toast.fromError(e)) });
}
</script>
