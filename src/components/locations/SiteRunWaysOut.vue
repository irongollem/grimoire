<template>
  <section class="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
    <h3 class="font-cinzel text-sm font-bold text-foreground">Ways out of {{ roomName }}</h3>
    <p v-if="!views.length" class="text-caption italic text-muted-foreground">No ways out from here yet.</p>
    <PlacementRow v-for="view in views" :key="view.door.id" :to="`/locations/${view.otherRoomId}`" :name="view.otherRoomName">
      <template #badge>
        <component :is="DOOR_KIND_ICONS[view.door.door_kind]" class="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </template>
      <template #actions>
        <span v-if="wasUnlocked(view.door)" class="shrink-0 text-2xs uppercase text-muted-foreground">Unlocked</span>
        <AppButton
          v-if="isSecret(view.door)"
          size="xs"
          variant="tinted"
          tone="arcane"
          :icon="IconHide"
          label="Reveal"
          :loading="pendingDoorIds.has(view.door.id)"
          @click="reveal(view.door)"
        />
        <AppButton
          v-else-if="isLocked(view.door)"
          size="xs"
          variant="tinted"
          tone="caution"
          :icon="IconLock"
          label="Unlock"
          :loading="pendingDoorIds.has(view.door.id)"
          @click="unlock(view.door)"
        />
        <AppButton v-else size="xs" :icon="IconNavigate" label="Move" :loading="isMoving" @click="move(view.otherRoomId)" />
      </template>
      <p class="text-caption text-muted-foreground">{{ doorSubtitle(view.door) }}</p>
    </PlacementRow>
  </section>
</template>

<script setup lang="ts">
/**
 * Frame 08's "Ways out of the <room>" panel — read-only reference plus the
 * two play-state writes a DM makes from the table: Unlock and Reveal. Both
 * go to the append-only `location_state_events` log as door facts, exactly
 * as `LocationDoors.vue`'s own `starts_locked`/`is_secret` toggles do NOT —
 * those stay authored prep. `starts_locked` and `is_secret` never change
 * here; only whether the party has since unlocked or found the door does.
 *
 * Move duplicates `SiteRoomList`'s own party-move mutation rather than
 * emitting up to it, because the two lists answer different questions —
 * "every room in the site" vs. "the doors of one room" — and neither owns
 * the other. Moving through a door listed here is always legal: the row
 * only exists because a door connects this room to `otherRoomId`, so there
 * is nothing to gate beyond "not already there."
 *
 * A found secret or an already-unlocked door falls through to the ordinary
 * Move row — a found secret reads exactly like any other way out (the
 * design's own rule); an unlocked one keeps a muted "Unlocked" tag so the DM
 * can still tell it was ever locked at all.
 */
import { computed, reactive } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import PlacementRow from "@/components/locations/PlacementRow.vue";
import { IconHide, IconLock, IconNavigate } from "@/lib/icons";
import { DOOR_KIND_ICONS, doorSubtitle, doorsOfSpace } from "@/lib/locations/doors";
import { useSetCampaignLocation } from "@/composables/campaign/useCampaigns";
import { useAssertDoorState } from "@/composables/locations/useLocationState";
import { useCampaignStore } from "@/stores/campaign";
import { useToast } from "@/composables/useToast";
import type { SiteDoorWithSpaces } from "@/composables/locations/useSiteDoors";
import type { DoorStateFact, LocationState } from "@/types/locationState.types";

const { siteId, roomId, roomName, doors, doorState } = defineProps<{
  siteId: string;
  roomId: string;
  roomName: string;
  doors: SiteDoorWithSpaces[];
  doorState: (doorId: string, fact: DoorStateFact) => LocationState | undefined;
}>();

const views = computed(() => doorsOfSpace(doors, roomId));

function isSecret(door: SiteDoorWithSpaces): boolean {
  return door.is_secret && doorState(door.id, "found")?.value !== true;
}
function wasUnlocked(door: SiteDoorWithSpaces): boolean {
  return door.starts_locked && doorState(door.id, "unlocked")?.value === true;
}
function isLocked(door: SiteDoorWithSpaces): boolean {
  return door.starts_locked && !wasUnlocked(door);
}

const campaign = useCampaignStore();
const toast = useToast();

const { mutate: setCampaignLocation, isPending: isMoving } = useSetCampaignLocation();
function move(otherRoomId: string): void {
  if (!campaign.activeCampaignId || isMoving.value) return;
  setCampaignLocation(
    { id: campaign.activeCampaignId, locationId: otherRoomId },
    { onError: (e) => toast.error(toast.fromError(e)) },
  );
}

const { mutate: assertDoor } = useAssertDoorState();
// A `Set` rather than one shared ref — `MapRegionsLayer`'s `pendingStroke`
// guard's reasoning applies here too: two doors can be in flight at once, and
// clearing a single shared id on settle clears whichever door happened to
// resolve, not necessarily the one that just finished.
const pendingDoorIds = reactive(new Set<string>());

function assert(door: SiteDoorWithSpaces, fact: DoorStateFact): void {
  pendingDoorIds.add(door.id);
  assertDoor(
    { location_id: siteId, door_id: door.id, fact, value: true },
    {
      onSuccess: () => { pendingDoorIds.delete(door.id); },
      onError: (e) => { pendingDoorIds.delete(door.id); toast.error(toast.fromError(e)); },
    },
  );
}
function reveal(door: SiteDoorWithSpaces): void { assert(door, "found"); }
function unlock(door: SiteDoorWithSpaces): void { assert(door, "unlocked"); }
</script>
