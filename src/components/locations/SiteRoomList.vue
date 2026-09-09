<template>
  <div class="flex flex-col gap-1.5">
    <p v-if="!rooms.length" class="text-caption italic text-muted-foreground">
      No rooms yet — <RouterLink :to="`/locations/${siteId}`" class="underline hover:text-primary">add some from the site's own sheet</RouterLink>.
    </p>

    <div
      v-for="room in rooms"
      :key="room.id"
      class="flex items-stretch gap-1.5 rounded-lg border p-2"
      :class="rowClass(room)"
    >
      <!-- Filling an unwritten room: an inline editor replaces the row's own
           content entirely — a RichTextEditor cannot live inside a <button>,
           so this branch is never wrapped in one. -->
      <div v-if="fillingId === room.id" class="flex min-w-0 flex-1 flex-col gap-2">
        <RichTextEditor v-model="draft" size="sm" placeholder="What's in this room…" />
        <div class="flex justify-end gap-2">
          <AppButton variant="ghost" size="inline" label="Cancel" @click="cancelFill" />
          <AppButton variant="link" size="inline" label="Save" :loading="isSaving" @click="saveFill(room)" />
        </div>
      </div>

      <template v-else>
        <AppButton
          variant="menu"
          size="sm"
          block
          class="min-w-0 flex-1 gap-2.5 p-0"
          :to="linkTo(room)"
          @click="onRowClick(room)"
        >
          <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded font-cinzel text-label font-bold" :class="numberClass(room)">
            {{ indexOf(room) + 1 }}
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate font-cinzel text-label font-bold text-foreground">{{ room.name }}</span>
            <span class="block truncate text-caption text-muted-foreground" :class="unwrittenIds.has(room.id) ? 'italic' : ''">{{ captionFor(room) }}</span>
          </span>
        </AppButton>

        <span v-if="lootRoomIds.has(room.id)" class="inline-flex shrink-0 items-center self-center rounded bg-primary/10 px-1.5 py-0.5 text-primary" title="Loot held here">
          <IconCoins class="h-3 w-3" aria-hidden="true" />
        </span>
        <span
          v-if="runCaptions && secretUndiscoveredIds.has(room.id)"
          class="inline-flex shrink-0 items-center self-center rounded bg-tone-arcane/10 px-1.5 py-0.5 text-tone-arcane"
          title="Reachable only through an undiscovered secret door"
        >
          <IconHide class="h-3 w-3" aria-hidden="true" />
        </span>
        <AppButton v-if="unwrittenIds.has(room.id)" size="xs" label="Fill" class="shrink-0 self-center" @click="startFill(room)" />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The site's rooms, numbered in `compareSiblings` order — the one room list
 * shared by `SiteRunSurface` (the Atlas Run action) and `QuestSiteHandoff`
 * (#850 story H). Previously each surface grew its own copy of this exact
 * click-to-move / unreachable-links-to-sheet logic; this is the single
 * version both now mount, so it can never drift into two answers for "can
 * the party reach this room" again.
 *
 * Self-contained on purpose, the same shape `LootPlacementList` already set:
 * it performs its own writes (`useSetCampaignLocation` to move the party,
 * `useUpdateLocation` to save a Fill) and only *announces* what happened via
 * `move` / `fill`, mirroring `LootPlacementList`'s `dropped`. Neither current
 * caller needs to react to either emit — both mutations already invalidate
 * the query keys that make `rooms` and `currentRoomId` refresh on their
 * own — but the events exist for a caller that later does (a toast, a log
 * line), exactly as `dropped` does today for nobody yet either.
 */
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import AppButton from "@/components/common/AppButton.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import { IconCoins, IconHide } from "@/lib/icons";
import { useUpdateLocation } from "@/composables/locations/useLocations";
import { useLootPlacements } from "@/composables/quests/useQuestFlow";
import { useSetCampaignLocation } from "@/composables/campaign/useCampaigns";
import { useCampaignStore } from "@/stores/campaign";
import { useToast } from "@/composables/useToast";
import { roomRowCaption, roomsWithHeldLoot } from "@/lib/quests/siteHandoff";
import type { LocationState, LocationStateFact } from "@/types/locationState.types";
import type { Location } from "@/types/location.types";

const {
  siteId, rooms, currentRoomId, reachable, stateOf, unwrittenIds,
  runCaptions = false,
  secretUndiscoveredIds = new Set<string>(),
  zoneNotes = new Map<string, string>(),
} = defineProps<{
  siteId: string;
  rooms: Location[];
  currentRoomId: string | null;
  reachable: ReadonlySet<string> | null;
  stateOf: (locationId: string, fact: LocationStateFact) => LocationState | undefined;
  unwrittenIds: ReadonlySet<string>;
  /**
   * Opt-in to frame 08's reachability-driven captions ("Reachable", "Not
   * reachable from here", "Secret door — undiscovered", "Party here · <zone>
   * active") in place of the plain description snippet. Off by default so
   * `QuestSiteHandoff` — not yet redesigned for this frame — keeps its
   * existing rows unchanged; `SiteRunSurface` turns it on (#868, S11).
   */
  runCaptions?: boolean;
  /** Rooms reachable only through a secret door the party hasn't found yet.
   *  Only consulted when `runCaptions` is true. */
  secretUndiscoveredIds?: ReadonlySet<string>;
  /** The active-zone note for the party's current room ("ash-fall zone"),
   *  keyed by room id. Only consulted when `runCaptions` is true. */
  zoneNotes?: ReadonlyMap<string, string>;
}>();
const emit = defineEmits<{ move: [roomId: string]; fill: [roomId: string] }>();

const campaign = useCampaignStore();
const toast = useToast();

function indexOf(room: Location): number {
  return rooms.indexOf(room);
}

function isCleared(room: Location): boolean {
  return stateOf(room.id, "cleared")?.value === true;
}

function isReachable(room: Location): boolean {
  return !reachable || reachable.has(room.id);
}

function captionFor(room: Location): string {
  if (unwrittenIds.has(room.id)) return "Unwritten — write it or roll it";
  if (!runCaptions) return roomRowCaption(room.description, isCleared(room));

  // Frame 08's reachability-driven captions, opt-in via `runCaptions`.
  if (room.id === currentRoomId) {
    const zoneNote = zoneNotes.get(room.id);
    return zoneNote ? `Party here · ${zoneNote} active` : "Party here";
  }
  if (secretUndiscoveredIds.has(room.id)) return "Secret door — undiscovered";
  if (!isReachable(room)) return "Not reachable from here";
  return "Reachable";
}

function rowClass(room: Location): string[] {
  if (unwrittenIds.has(room.id)) return ["border-dashed", "border-tone-caution/50"];
  const classes = ["border-border"];
  if (room.id === currentRoomId) classes.push("border-tone-info", "ring-2", "ring-tone-info/15");
  else if (runCaptions && !isReachable(room)) classes.push("opacity-55");
  else if (isCleared(room)) classes.push("opacity-70");
  return classes;
}

function numberClass(room: Location): string {
  if (unwrittenIds.has(room.id)) return "bg-tone-caution text-black";
  if (isCleared(room)) return "bg-tone-success text-white";
  if (room.id === currentRoomId) return "bg-tone-info text-white";
  return "bg-muted text-muted-foreground";
}

// ── Move ──────────────────────────────────────────────────────────────────
const { mutate: setCampaignLocation, isPending: isMoving } = useSetCampaignLocation();

function linkTo(room: Location): string | undefined {
  if (room.id === currentRoomId) return undefined;
  return isReachable(room) ? undefined : `/locations/${room.id}`;
}

function onRowClick(room: Location): void {
  if (room.id === currentRoomId || !isReachable(room) || !campaign.activeCampaignId || isMoving.value) return;
  setCampaignLocation(
    { id: campaign.activeCampaignId, locationId: room.id },
    { onSuccess: () => emit("move", room.id), onError: (e) => toast.error(toast.fromError(e)) },
  );
}

// ── Fill ──────────────────────────────────────────────────────────────────
const fillingId = ref<string | null>(null);
const draft = ref<string | null>(null);
const { mutate: updateLocation, isPending: isSaving } = useUpdateLocation();

function startFill(room: Location): void {
  fillingId.value = room.id;
  draft.value = room.description;
}
function cancelFill(): void {
  fillingId.value = null;
  draft.value = null;
}
function saveFill(room: Location): void {
  updateLocation(
    { id: room.id, update: { description: draft.value } },
    {
      onSuccess: () => { emit("fill", room.id); fillingId.value = null; draft.value = null; },
      onError: (e) => toast.error(toast.fromError(e)),
    },
  );
}

// ── Loot chip — held loot only; there is no room-anchored knowledge fact to
//    gate a second chip on (`quest_consequences` has no location column). ──
const { data: loot } = useLootPlacements();
const lootRoomIds = computed(() => roomsWithHeldLoot(loot.value ?? []));
</script>
