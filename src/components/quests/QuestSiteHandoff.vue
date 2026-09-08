<template>
  <div v-if="!beat.staged_at_location_id" class="rounded-xl border border-border bg-card p-4 text-caption italic text-muted-foreground">
    This beat has no site staged — the cockpit should not have mounted the site handoff for it.
  </div>
  <div v-else-if="!site" class="rounded-xl border border-border bg-card p-4 text-caption italic text-muted-foreground">
    Loading the site…
  </div>

  <div v-else class="flex flex-col gap-4">
    <!-- Header strip -->
    <header class="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <div class="min-w-0 flex-1">
        <div class="mb-1 flex flex-wrap items-center gap-2">
          <span
            class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-label uppercase"
            :class="currentBadge ? [currentBadge.tone.bg, currentBadge.tone.text] : 'bg-muted text-muted-foreground'"
          >
            <IconNavigate class="h-3 w-3" aria-hidden="true" />
            Thread {{ currentBadge?.letter ?? "?" }}
          </span>
          <span class="rounded bg-muted px-1.5 py-0.5 text-label uppercase text-muted-foreground">{{ quest?.title ?? "…" }}</span>
        </div>
        <h1 class="font-cinzel text-lg font-bold text-foreground">{{ beat.title || "Untitled beat" }}</h1>
        <p class="mt-0.5 text-caption text-muted-foreground">{{ kindLabel }} · staged at a site · {{ positionLabel }}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        <AppButton
          variant="subtle"
          size="sm"
          :icon="IconImages"
          :label="site.is_map_shared ? 'Hide map from players' : 'Show map to players'"
          :loading="isTogglingShare"
          @click="toggleMapShared"
        />
        <AppButton variant="subtle" size="sm" label="Leave site" @click="emit('leave')" />
        <AppButton variant="primary" size="sm" :icon="IconCheck" label="Advance beat" @click="emit('advance')" />
      </div>
    </header>

    <div class="grid grid-cols-1 gap-4 xl:grid-cols-[20rem_minmax(0,1fr)_19rem]">
      <!-- Rooms -->
      <section class="flex min-h-0 flex-col gap-2 rounded-xl border border-border bg-card p-3">
        <header class="flex items-center gap-2">
          <h2 class="font-cinzel text-sm font-bold text-foreground">Rooms</h2>
          <span v-if="unwrittenIds.size" class="ml-auto rounded bg-tone-caution/15 px-1.5 py-0.5 text-label uppercase text-ink-caution">
            {{ unwrittenIds.size }} unwritten
          </span>
        </header>
        <SiteRoomList
          :site-id="site.id"
          :rooms="rooms"
          :current-room-id="currentRoomId"
          :reachable="reachable"
          :state-of="stateOf"
          :unwritten-ids="unwrittenIds"
          @move="moveTo"
        />
        <p class="text-caption text-muted-foreground">
          Rooms are the site's own content, not beats. The last room may hand the thread on to a real beat — which is how a crawl ends without a fake "you leave the dungeon" beat.
        </p>
      </section>

      <!-- Middle: the floor plan, and the other threads this quest is holding -->
      <div class="flex min-h-0 flex-col gap-4">
        <LocationMap
          v-if="site.map_url"
          class="flex-1"
          :map-url="site.map_url"
          :pins="site.map_pins"
          :children="pinnableChildren"
          mode="view"
          :show-hidden-pins="true"
          :location-id="site.id"
          show-regions
          :regions="regions"
          :spaces="siteSpaces"
          :calibration="site.grid_calibration"
          run-mode
          :party-room-id="currentRoomId"
          :reachable-room-ids="reachable"
          @move-party="moveTo"
        />
        <div v-else class="flex flex-1 flex-col items-center justify-center gap-1 rounded-xl border border-border bg-muted/20 p-6 text-center text-caption text-muted-foreground">
          <p>Floor plan from the location.</p>
          <p>Cartographer scene or an uploaded battlemap.</p>
        </div>

        <section v-if="otherThreads.length" class="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
          <h3 class="font-cinzel text-sm font-bold text-foreground">{{ otherThreadsHeading }}</h3>
          <div v-for="badge in otherThreads" :key="badge.thread.id" class="flex items-center gap-3 rounded-lg border border-border bg-card p-2">
            <span class="flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-md" :class="badge.tone.bg">
              <IconNavigate class="h-3.5 w-3.5" :class="badge.tone.text" aria-hidden="true" />
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate font-cinzel text-label font-bold text-foreground">
                {{ badge.thread.current_beat_title ?? "Not started yet" }} is still the cursor on Thread {{ badge.letter }}
              </p>
              <p class="text-caption text-muted-foreground">{{ switchingCaption }}</p>
            </div>
            <AppButton size="xs" label="Switch" :to="{ query: { ...route.query, thread: badge.thread.id } }" />
          </div>
        </section>
      </div>

      <!-- Right: the current room, and its payoff -->
      <div class="flex min-h-0 flex-col gap-4">
        <article v-if="currentRoom" class="flex flex-col gap-3 rounded-xl border border-tone-info bg-card p-4">
          <div class="flex flex-wrap items-center gap-1.5">
            <span class="inline-flex items-center gap-1.5 rounded bg-tone-info/15 px-1.5 py-0.5 text-label uppercase text-ink-info">
              <span class="relative flex h-1.5 w-1.5">
                <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-tone-info opacity-75" />
                <span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-tone-info" />
              </span>
              Room {{ roomOrdinalValue }}
            </span>
            <span v-for="kind in currentRoomPlacementKinds" :key="kind" class="rounded bg-muted px-1.5 py-0.5 text-label uppercase text-muted-foreground">
              {{ LOCATION_PLACEMENT_KIND_LABELS[kind] }}
            </span>
          </div>
          <h2 class="font-cinzel text-base font-bold text-foreground">{{ currentRoom.name }}</h2>
          <RichTextViewer v-if="hasDescription" :content="currentRoom.description" />
          <div class="flex flex-wrap gap-2">
            <AppButton v-if="!isRoomCleared" variant="primary" size="sm" label="Room cleared" :loading="isAsserting" @click="markCleared" />
            <AppButton v-else variant="tinted" tone="success" emphasis="soft" size="sm" :icon="IconCheck" label="Cleared" disabled />
          </div>
          <div class="flex flex-col gap-2">
            <h4 class="font-cinzel text-xs font-bold uppercase tracking-wide text-muted-foreground">Prepared here</h4>
            <LocationPlacements :location-id="currentRoom.id" />
          </div>
        </article>
        <p v-else class="rounded-xl border border-dashed border-border p-4 text-caption italic text-muted-foreground">
          The party hasn't entered a room here yet — click one on the left to move them in.
        </p>

        <section class="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
          <h3 class="font-cinzel text-sm font-bold text-foreground">Room payoff</h3>
          <LootPlacementList
            v-if="currentRoom"
            title="Loot"
            empty-label="No loot prepared for this room."
            :loot="currentRoomLoot ?? []"
            @dropped="onLootDropped"
          />
          <p v-else class="text-caption italic text-muted-foreground">No room to pay off until the party is inside one.</p>
          <p class="text-caption text-muted-foreground">A room's payoff uses the same two mechanisms as a beat's, logged against the beat that owns the site.</p>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Frame `06 Site` (Quest Manager Redesign) — a beat staged at a site with a
 * floor plan runs as rooms. Replaces the cockpit's beat card + held payoff
 * for exactly that case (#850 story H): "the thread's cursor stays on the
 * beat, the room cursor lives inside it, and leaving keeps both" — nothing
 * here writes to `quest_runtime_state`. `leave` and `advance` are the only
 * two ways out, and both are emits; the cockpit (story F) owns what happens
 * next.
 *
 * The room list itself is `SiteRoomList` (#850 story H), shared verbatim
 * with `SiteRunSurface`'s Atlas Run action — this component only supplies
 * the site's rooms, the party's current room, and the door-reachability
 * graph, exactly as `SiteRunSurface` does for its own mount of the same
 * component.
 */
import { computed } from "vue";
import { useRoute } from "vue-router";
import AppButton from "@/components/common/AppButton.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import LocationMap from "@/components/locations/LocationMap.vue";
import LocationPlacements from "@/components/locations/LocationPlacements.vue";
import SiteRoomList from "@/components/locations/SiteRoomList.vue";
import LootPlacementList from "@/components/quests/LootPlacementList.vue";
import { IconCheck, IconImages, IconNavigate } from "@/lib/icons";
import { useLocation, useLocations, useUpdateLocation } from "@/composables/locations/useLocations";
import { useLocationMapRegions } from "@/composables/locations/useLocationMapRegions";
import { useLocationPlacements } from "@/composables/locations/useLocationPlacements";
import { useLocationStateForRooms, useAssertLocationState } from "@/composables/locations/useLocationState";
import { useSiteDoors } from "@/composables/locations/useSiteDoors";
import { useLootPlacements } from "@/composables/quests/useQuestFlow";
import { useQuest } from "@/composables/quests/useQuests";
import { useSetCampaignLocation } from "@/composables/campaign/useCampaigns";
import { useCampaignStore } from "@/stores/campaign";
import { useToast } from "@/composables/useToast";
import { useQueryClient } from "@tanstack/vue-query";
import { LOCATION_STATE_QUERY_KEY } from "@/composables/locations/useLocationState";
import { bindableSpaces } from "@/lib/locations/tiers";
import { compareSiblings } from "@/lib/locations/tree";
import { extractTiptapText } from "@/lib/utils";
import { partyRoomInSite, reachableRoomIds as computeReachableRoomIds } from "@/lib/locations/siteRun";
import { threadBadge, threadBadges } from "@/lib/quests/threads";
import { roomOrdinal, unwrittenRoomIds } from "@/lib/quests/siteHandoff";
import { placementKind, LOCATION_PLACEMENT_KIND_LABELS } from "@/types/locationPlacement.types";
import { QUEST_BEAT_KIND_LABELS } from "@/types/quest.types";
import type { LocationPlacementKind } from "@/types/locationPlacement.types";
import type { Location } from "@/types/location.types";
import type { QuestBeat, QuestRuntimeContext } from "@/types/quest.types";

const { questId, threadId, beat, context } = defineProps<{
  questId: string;
  threadId: string;
  beat: QuestBeat;
  context: QuestRuntimeContext;
}>();
const emit = defineEmits<{ advance: []; leave: [] }>();

const route = useRoute();
const campaign = useCampaignStore();
const toast = useToast();
const queryClient = useQueryClient();

// ── Quest + thread chrome ────────────────────────────────────────────────
const { data: quest } = useQuest(computed(() => questId));
const currentBadge = computed(() => threadBadge(context.threads, threadId));
const kindLabel = computed(() => QUEST_BEAT_KIND_LABELS[beat.kind as keyof typeof QUEST_BEAT_KIND_LABELS] ?? beat.kind);

const otherThreads = computed(() => threadBadges(context.threads).filter((b) => b.thread.id !== threadId && b.thread.status === "live"));
const otherThreadsHeading = computed(() => otherThreads.value.length === 1
  ? `Thread ${otherThreads.value[0]!.letter} is paused, not closed`
  : "Other threads are paused, not closed");

// ── The site and its rooms, exactly as SiteRunSurface reads them ───────────
const siteId = computed(() => beat.staged_at_location_id ?? "");
const { data: site } = useLocation(siteId);
const { data: children } = useLocations(siteId);
const rooms = computed<Location[]>(() =>
  (children.value ?? []).filter((l) => l.location_type === "room").sort(compareSiblings));
const roomIds = computed(() => rooms.value.map((r) => r.id));
const siteSpaces = computed(() => bindableSpaces(children.value ?? []));
const pinnableChildren = computed<Location[]>(() =>
  (children.value ?? []).filter((l) => l.location_type !== "room"));

const unwrittenIds = computed(() => unwrittenRoomIds(rooms.value));

const currentRoomId = computed(() =>
  partyRoomInSite(campaign.activeCampaign?.current_location_id ?? null, roomIds.value));
const currentRoom = computed(() => rooms.value.find((r) => r.id === currentRoomId.value) ?? null);
const roomOrdinalValue = computed(() => roomOrdinal(currentRoomId.value, roomIds.value));
const positionLabel = computed(() => roomOrdinalValue.value === null ? "not yet inside" : `room ${roomOrdinalValue.value} of ${rooms.value.length}`);
const switchingCaption = computed(() => roomOrdinalValue.value === null ? "Switching back leaves this site" : `Switching back leaves this site at room ${roomOrdinalValue.value}`);

const doorsQuery = useSiteDoors(roomIds);
const reachable = computed(() => {
  const from = currentRoomId.value;
  return from ? computeReachableRoomIds(from, doorsQuery.data.value ?? []) : null;
});

const regionsQuery = useLocationMapRegions(siteId);
const regions = computed(() => regionsQuery.data.value ?? []);

const { mutate: setCampaignLocation, isPending: isMoving } = useSetCampaignLocation();
function moveTo(roomId: string): void {
  if (!campaign.activeCampaignId || isMoving.value || roomId === currentRoomId.value) return;
  setCampaignLocation({ id: campaign.activeCampaignId, locationId: roomId }, { onError: (e) => toast.error(toast.fromError(e)) });
}

// ── Show/hide the map to players ────────────────────────────────────────
const { mutate: updateLocation, isPending: isTogglingShare } = useUpdateLocation();
function toggleMapShared(): void {
  if (!site.value) return;
  updateLocation({ id: site.value.id, update: { is_map_shared: !site.value.is_map_shared } }, { onError: (e) => toast.error(toast.fromError(e)) });
}

// ── The current room: state, placements, loot ───────────────────────────
const { stateOf } = useLocationStateForRooms(roomIds);
const hasDescription = computed(() => !!currentRoom.value && extractTiptapText(currentRoom.value.description, 1).length > 0);
const isRoomCleared = computed(() => !!currentRoom.value && stateOf(currentRoom.value.id, "cleared")?.value === true);

const { mutate: assertState, isPending: isAsserting } = useAssertLocationState();
function markCleared(): void {
  if (!currentRoom.value) return;
  assertState({ location_id: currentRoom.value.id, fact: "cleared", value: true }, { onError: (e) => toast.error(toast.fromError(e)) });
}

const currentRoomIdOrEmpty = computed(() => currentRoom.value?.id ?? "");
const { data: currentRoomPlacements } = useLocationPlacements(currentRoomIdOrEmpty);
const currentRoomPlacementKinds = computed<LocationPlacementKind[]>(() => {
  const kinds = new Set<LocationPlacementKind>();
  for (const placement of currentRoomPlacements.value ?? []) kinds.add(placementKind(placement));
  return [...kinds];
});

const { data: currentRoomLoot } = useLootPlacements({ locationId: currentRoomIdOrEmpty });
function onLootDropped(): void {
  void queryClient.invalidateQueries({ queryKey: [LOCATION_STATE_QUERY_KEY] });
}
</script>
