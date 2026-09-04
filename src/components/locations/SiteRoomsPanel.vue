<template>
  <div class="flex flex-col gap-3">
    <div class="flex items-center justify-between">
      <span class="text-label-lg font-semibold text-muted-foreground">Rooms</span>
    </div>

    <!-- Room list -->
    <VueDraggable
      v-if="dragList.length"
      v-model="dragList"
      class="flex flex-col gap-1.5"
      handle=".room-drag-handle"
      :animation="150"
      ghost-class="opacity-40"
      @end="persistOrder"
    >
      <div
        v-for="(room, idx) in dragList"
        :key="room.id"
        class="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2"
      >
        <div
          class="room-drag-handle shrink-0 cursor-grab text-muted-foreground/40 transition-colors hover:text-muted-foreground/80 active:cursor-grabbing"
          title="Drag to reorder"
        >
          <IconDrag class="h-3.5 w-3.5" />
        </div>

        <span class="w-5 shrink-0 text-caption-sm tabular-nums text-muted-foreground">{{ idx + 1 }}.</span>

        <AppInput
          v-if="editingId === room.id"
          ref="renameInput"
          v-model="nameDraft"
          size="xs"
          class="flex-1"
          @keydown.enter="saveRename(room.id)"
          @keydown.escape="cancelRename"
          @blur="saveRename(room.id)"
        />
        <span
          v-else
          class="min-w-0 flex-1 truncate font-cinzel text-xs font-semibold text-foreground"
        >{{ room.name }}</span>

        <AppButton
          v-if="editingId !== room.id"
          variant="ghost"
          size="icon-xs"
          :icon="IconEdit"
          tooltip="Rename room"
          class="shrink-0"
          @click="startRename(room)"
        />
        <AppButton
          variant="ghost"
          tone="danger"
          size="icon-xs"
          :icon="IconClose"
          tooltip="Delete room"
          class="shrink-0"
          @click="removeRoom(room)"
        />
      </div>
    </VueDraggable>

    <p v-else class="text-caption text-muted-foreground italic">No rooms yet — add the first one below.</p>

    <!-- Inline add -->
    <div class="flex items-center gap-2 rounded-md border border-dashed border-border bg-background px-3 py-2">
      <IconAdd class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <AppInput
        v-model="newRoomName"
        type="text"
        tone="bare"
        size="xs"
        :block="false"
        placeholder="Add a room…"
        class="flex-1 px-0 text-caption"
        @keydown.enter="addRoom"
      />
      <AppButton
        variant="ghost"
        size="inline-xs"
        label="Add"
        :disabled="!newRoomName.trim() || isCreating"
        @click="addRoom"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { VueDraggable } from "vue-draggable-plus";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import { IconAdd, IconClose, IconDrag, IconEdit } from "@/lib/icons";
import { useToast } from "@/composables/useToast";
import { useConfirm } from "@/composables/useConfirm";
import {
  useLocations,
  useCreateLocation,
  useUpdateLocation,
  useDeleteLocation,
  useReorderLocations,
} from "@/composables/locations/useLocations";
import type { Location, LocationInsert } from "@/types/location.types";

/**
 * A site's numbered rooms — the panel #783 gives a dungeon (or any site-tier
 * place). Rooms are ordinary `room`-typed direct children; there is no
 * membership table, because `parent_id` already owns that fact. What this
 * panel adds is the missing *order* (`sort_order`, reordered via drag) and a
 * dedicated surface to add/rename/remove them without opening full edit.
 *
 * Mirrors `StoreInventory`'s shape: a self-contained, always-editable view-mode
 * component keyed off a `locationId` prop rather than a route param, because
 * `AtlasPlacePane` reuses one mounted instance across every selected location
 * instead of remounting per id.
 */
const { locationId } = defineProps<{ locationId: string }>();

const locationIdRef = computed(() => locationId);
const { data: children } = useLocations(locationIdRef);
const rooms = computed(() => (children.value ?? []).filter((l) => l.location_type === "room"));

const toast = useToast();
const { confirm } = useConfirm();

// ── Drag-to-reorder ─────────────────────────────────────────────────────────────
// Local mutable copy for VueDraggable (it reorders this in place); kept in
// sync with the server-derived list, persisted to the RPC on drag end.
const dragList = ref<Location[]>([]);
watch(rooms, (list) => { dragList.value = [...list]; }, { immediate: true });

const { mutate: reorder } = useReorderLocations();

function persistOrder() {
  reorder(dragList.value.map((r) => r.id));
}

// ── Add ─────────────────────────────────────────────────────────────────────────
const newRoomName = ref("");
const { mutate: createLocation, isPending: isCreating } = useCreateLocation();

function buildRoomInsert(name: string): Omit<LocationInsert, "campaign_id"> {
  return {
    name,
    location_type: "room",
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

function addRoom() {
  const trimmed = newRoomName.value.trim();
  if (!trimmed) return;
  // The DB trigger (guard_location_room_parent) is the actual authority on
  // which types may hold a room — this panel only ever inserts under the
  // site it is mounted on, so it never duplicates that check client-side.
  // A rejection still surfaces here rather than vanishing silently.
  createLocation(buildRoomInsert(trimmed), {
    onSuccess: () => { newRoomName.value = ""; },
    onError: (e) => toast.error(toast.fromError(e)),
  });
}

// ── Rename ──────────────────────────────────────────────────────────────────────
const editingId = ref<string | null>(null);
const nameDraft = ref("");
// AppInput exposes { el, focus, select } rather than the raw element, since a
// bare component ref resolves to the public instance, not the DOM node.
const renameInput = ref<{ focus: () => void; select: () => void } | null>(null);
const { mutate: updateLocation } = useUpdateLocation();

function startRename(room: Location) {
  editingId.value = room.id;
  nameDraft.value = room.name;
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

async function removeRoom(room: Location) {
  const ok = await confirm(`Delete "${room.name}"? This cannot be undone.`, {
    confirmLabel: "Delete",
    danger: true,
  });
  if (!ok) return;
  deleteLocation(room.id);
}
</script>
