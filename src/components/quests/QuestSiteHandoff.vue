<template>
  <div v-if="!beat.staged_at_location_id" class="rounded-xl border border-border bg-card p-4 text-caption italic text-muted-foreground">
    This beat has no site staged — the cockpit should not have mounted the site handoff for it.
  </div>
  <div v-else-if="!site" class="rounded-xl border border-border bg-card p-4 text-caption italic text-muted-foreground">
    Loading the site…
  </div>

  <div v-else class="flex flex-col gap-4">
    <!-- Header strip -->
    <!-- `min-w-0 flex-1` on the title gives it a 0% flex-basis, so `flex-wrap`
         never actually wraps the button row onto its own line below xl — the
         line-breaking decision is made on basis, not on shrunk size, so the
         title just gets squeezed to whatever the button row doesn't claim
         (a pre-existing bug this story's own phone verification pass turned
         up: a beat title was rendering one letter per line at 390px). Below
         xl the header stacks instead; at xl+ `xl:flex-row xl:flex-wrap
         xl:justify-between` reproduce the original row layout exactly, so
         nothing above the breakpoint changes. -->
    <header class="flex flex-col items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 xl:flex-row xl:flex-wrap xl:justify-between">
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
        <!-- Frame 4: the dock carries this same verb below xl, so the header's
             own copy hides there rather than duplicating a control that is
             now one tap away at any scroll position. -->
        <AppButton variant="primary" size="sm" class="hidden xl:inline-flex" :icon="IconCheck" label="Advance beat" @click="emit('advance')" />
      </div>
    </header>

    <!-- A zone can name a beat (#868 S12): the party walking into a traced
         trigger room this beat itself is named on. Never fires the advance
         on its own — this only surfaces the same button the header already
         carries. -->
    <TriggerBeatPrompt
      v-if="showTriggerPrompt"
      :beat="{ title: beat.title }"
      @advance="emit('advance')"
      @dismiss="dismissTriggerPrompt"
    />

    <!-- Frame 4 ("On a phone the crawl is one room at a time"): below xl this
         whole three-column layout gives way to a single-room composition, so
         it is a JS-level branch (not CSS visibility) — both arms mount
         SiteRunRoomStack/SiteRunWaysOut/LocationStateControls, and mounting
         both would double every query they run. -->
    <div v-if="!belowXl" class="grid grid-cols-1 gap-4 xl:grid-cols-[20rem_minmax(0,1fr)_20rem]">
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
          run-captions
          :secret-undiscovered-ids="secretUndiscoveredIds"
          :zone-notes="zoneNotes"
          @move="moveTo"
        />
        <p class="text-caption text-muted-foreground">
          Rooms are the site's own content, not beats. The last room may hand the thread on to a real beat — which is how a crawl ends without a fake "you leave the dungeon" beat.
        </p>
      </section>

      <!-- Middle: the floor plan and the room's own read-aloud/prompts/payoff,
           then the other threads this quest is holding. -->
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

        <SiteRunRoomStack
          v-if="currentRoom"
          :site-id="site.id"
          :room="currentRoom"
          :regions="regions"
          :doors="doors"
          :door-state="doorStateOf"
          :loot="currentRoomLoot ?? []"
          :campaign-id="campaign.activeCampaignId"
        />
        <p v-else class="rounded-xl border border-dashed border-border p-4 text-caption italic text-muted-foreground">
          The party hasn't entered a room here yet — click one on the left to move them in.
        </p>

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

      <!-- Right: ways out of the current room, and its progress. -->
      <div class="flex min-h-0 flex-col gap-4">
        <SiteRunWaysOut
          v-if="currentRoom"
          :site-id="site.id"
          :room-id="currentRoom.id"
          :room-name="currentRoom.name"
          :doors="doors"
          :door-state="doorStateOf"
        />

        <section v-if="currentRoom" class="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
          <h3 class="font-cinzel text-sm font-bold text-foreground">Progress</h3>
          <p class="text-caption text-muted-foreground">{{ currentRoom.name }}</p>
          <LocationStateControls :location-id="currentRoom.id" />
        </section>
      </div>
    </div>

    <!-- Frame 4a/4b: the plan, the current room (read-aloud, hazards, ways
         out AS the move control), then a docked "Rooms · n" / "Advance beat".
         SiteRoomList lives in the Rooms sheet, not a column — moving never
         means opening it, since Ways Out already IS the move control. -->
    <template v-else>
      <div class="flex flex-col gap-3">
        <div class="relative h-[11.875rem] overflow-hidden rounded-xl border border-border">
          <div v-if="site.map_url" class="pointer-events-none absolute inset-0">
            <LocationMap
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
              :show-layer-bar="false"
            />
          </div>
          <div v-else class="flex h-full flex-col items-center justify-center gap-1 p-4 text-center text-caption text-muted-foreground">
            <p>Floor plan from the location.</p>
          </div>
          <button
            v-if="site.map_url"
            type="button"
            class="absolute inset-0"
            aria-label="Expand floor plan"
            @click="mapExpandOpen = true"
          />
          <span
            v-if="site.map_url"
            class="pointer-events-none absolute bottom-2 right-2 rounded bg-card/90 px-1.5 py-0.5 text-label uppercase text-muted-foreground shadow-sm backdrop-blur-sm"
          >
            Tap to expand
          </span>
          <span
            v-if="site.is_map_shared"
            class="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-full border border-border bg-card/90 px-2 py-0.5 text-label text-ink-info shadow-sm backdrop-blur-sm"
          >
            <IconReveal class="h-3 w-3 shrink-0" aria-hidden="true" />
            Shared with players
          </span>
        </div>

        <section v-if="currentRoom" class="flex flex-col gap-3 rounded-xl border border-border bg-card p-3">
          <header class="flex items-center gap-2">
            <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-tone-info font-cinzel text-label font-bold text-white">
              {{ roomOrdinalValue }}
            </span>
            <div class="min-w-0 flex-1">
              <h2 class="truncate font-cinzel text-sm font-bold text-foreground">{{ currentRoom.name }}</h2>
              <p class="truncate text-caption text-muted-foreground">Party is here{{ currentRoomZoneNote ? ` · ${currentRoomZoneNote}` : "" }}</p>
            </div>
          </header>
          <SiteRunRoomStack
            :site-id="site.id"
            :room="currentRoom"
            :regions="regions"
            :doors="doors"
            :door-state="doorStateOf"
            :loot="currentRoomLoot ?? []"
            :campaign-id="campaign.activeCampaignId"
          />
          <SiteRunWaysOut
            :site-id="site.id"
            :room-id="currentRoom.id"
            :room-name="currentRoom.name"
            :doors="doors"
            :door-state="doorStateOf"
          />
          <div class="flex flex-col gap-2">
            <h3 class="font-cinzel text-sm font-bold text-foreground">Progress</h3>
            <LocationStateControls :location-id="currentRoom.id" />
          </div>
        </section>
        <p v-else class="rounded-xl border border-dashed border-border p-4 text-caption italic text-muted-foreground">
          The party hasn't entered a room here yet — open Rooms below to move them in.
        </p>
      </div>

      <DockBar hide-from="xl">
        <AppButton variant="subtle" size="md" class="min-h-12 flex-1" :label="`Rooms · ${rooms.length}`" @click="roomsSheetOpen = true" />
        <AppButton variant="primary" size="md" class="min-h-12 flex-1" :icon="IconCheck" label="Advance beat" @click="emit('advance')" />
      </DockBar>

      <MobileSheet v-model:open="roomsSheetOpen" show-until="xl" title="Rooms">
        <div v-if="unwrittenIds.size" class="mb-2 flex justify-end">
          <span class="rounded bg-tone-caution/15 px-1.5 py-0.5 text-label uppercase text-ink-caution">{{ unwrittenIds.size }} unwritten</span>
        </div>
        <SiteRoomList
          :site-id="site.id"
          :rooms="rooms"
          :current-room-id="currentRoomId"
          :reachable="reachable"
          :state-of="stateOf"
          :unwritten-ids="unwrittenIds"
          run-captions
          :secret-undiscovered-ids="secretUndiscoveredIds"
          :zone-notes="zoneNotes"
          @move="onRoomsSheetMove"
        />
        <template #footer>
          <div class="flex gap-2">
            <AppButton variant="subtle" size="md" class="min-h-11 flex-1" label="Leave site" @click="emit('leave')" />
            <AppButton variant="primary" size="md" class="min-h-11 flex-1" :icon="IconCheck" label="Advance beat" @click="emit('advance')" />
          </div>
        </template>
      </MobileSheet>

      <MobileSheet v-if="site.map_url" v-model:open="mapExpandOpen" show-until="xl" title="Floor plan">
        <div class="relative">
          <LocationMap
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
            :show-layer-bar="false"
            @move-party="onExpandedMapMove"
          />
          <span
            v-if="site.is_map_shared"
            class="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-full border border-border bg-card/90 px-2 py-0.5 text-label text-ink-info shadow-sm backdrop-blur-sm"
          >
            <IconReveal class="h-3 w-3 shrink-0" aria-hidden="true" />
            Shared with players
          </span>
        </div>
      </MobileSheet>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * Frame `06 Site` (Quest Manager Redesign), reshaped for #868's frame 15 (S12):
 * a beat staged at a site with a floor plan runs as rooms. Replaces the
 * cockpit's beat card + held payoff for exactly that case (#850 story H):
 * "the thread's cursor stays on the beat, the room cursor lives inside it,
 * and leaving keeps both" — nothing here writes to `quest_runtime_state`.
 * `leave` and `advance` are the only two ways out, and both are emits; the
 * cockpit (story F) owns what happens next.
 *
 * The current room's own stack — read-aloud, prompt rows, payoff — is
 * `SiteRunRoomStack`, and its ways out are `SiteRunWaysOut`: the same two
 * pieces `SiteRunSurface` mounts for the Atlas Run action (#868, S11), so a
 * DM running a crawl from the cockpit and one running it from the Atlas see
 * the identical room surface rather than two components that can drift.
 * `SiteRoomList` itself is shared verbatim with `SiteRunSurface` too, now with
 * `runCaptions` on (frame 08's reachability-driven captions).
 */
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import AppButton from "@/components/common/AppButton.vue";
import DockBar from "@/components/common/DockBar.vue";
import MobileSheet from "@/components/common/MobileSheet.vue";
import LocationMap from "@/components/locations/LocationMap.vue";
import LocationStateControls from "@/components/locations/LocationStateControls.vue";
import SiteRoomList from "@/components/locations/SiteRoomList.vue";
import SiteRunWaysOut from "@/components/locations/SiteRunWaysOut.vue";
import SiteRunRoomStack from "@/components/locations/SiteRunRoomStack.vue";
import TriggerBeatPrompt from "@/components/locations/TriggerBeatPrompt.vue";
import { IconCheck, IconImages, IconNavigate, IconReveal } from "@/lib/icons";
import { useLocation, useLocations, useUpdateLocation } from "@/composables/locations/useLocations";
import { useLocationMapRegions } from "@/composables/locations/useLocationMapRegions";
import { useLocationStateForRooms, useDoorStateForSite } from "@/composables/locations/useLocationState";
import { useSiteDoors } from "@/composables/locations/useSiteDoors";
import { useLootPlacements } from "@/composables/quests/useQuestFlow";
import { useQuest } from "@/composables/quests/useQuests";
import { useSetCampaignLocation } from "@/composables/campaign/useCampaigns";
import { useCampaignStore } from "@/stores/campaign";
import { useToast } from "@/composables/useToast";
import { useBelow } from "@/composables/useBreakpoint";
import { bindableSpaces, isSiteType } from "@/lib/locations/tiers";
import { compareSiblings } from "@/lib/locations/tree";
import { partyRoomInSite, reachableRoomIds as computeReachableRoomIds } from "@/lib/locations/siteRun";
import { threadBadge, threadBadges } from "@/lib/quests/threads";
import { roomOrdinal, unwrittenRoomIds } from "@/lib/quests/siteHandoff";
import { zoneSummary } from "@/lib/locations/zones";
import { QUEST_BEAT_KIND_LABELS } from "@/types/quest.types";
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

// Frame 4 ("On a phone the crawl is one room at a time") — a JS branch, not
// a CSS one: the mobile arm mounts its own SiteRunRoomStack/SiteRunWaysOut/
// LocationStateControls/SiteRoomList, and CSS-only hiding would mount the
// desktop arm's copies of the same components alongside them.
const belowXl = useBelow("xl");
const roomsSheetOpen = ref(false);
const mapExpandOpen = ref(false);

// ── Quest + thread chrome ────────────────────────────────────────────────
const { data: quest } = useQuest(computed(() => questId));
const currentBadge = computed(() => threadBadge(context.threads, threadId));
const kindLabel = computed(() => QUEST_BEAT_KIND_LABELS[beat.kind as keyof typeof QUEST_BEAT_KIND_LABELS] ?? beat.kind);

const otherThreads = computed(() => threadBadges(context.threads).filter((b) => b.thread.id !== threadId && b.thread.status === "live"));
const otherThreadsHeading = computed(() => otherThreads.value.length === 1
  ? `Thread ${otherThreads.value[0]!.letter} is paused, not closed`
  : "Other threads are paused, not closed");

// ── The site and its rooms, exactly as SiteRunSurface reads them ───────────
// A beat can now be staged directly at a room, not only a site itself (#868
// S12) — "Opens at" (`QuestBeatSitePanel`'s row) is that room, and this crawl
// still runs at the room's PARENT site: fetching this component's rooms/map/
// doors off the room id itself (as if it were the site) would return zero of
// everything, since a room has no children of its own.
const stagedLocationId = computed(() => beat.staged_at_location_id ?? "");
const { data: stagedLocationRecord } = useLocation(stagedLocationId);
const siteId = computed(() => {
  const staged = stagedLocationRecord.value;
  if (!staged) return "";
  return isSiteType(staged.location_type) ? staged.id : (staged.parent_id ?? "");
});
const { data: site } = useLocation(siteId);
const { data: children } = useLocations(siteId);
const rooms = computed<Location[]>(() =>
  (children.value ?? []).filter((l) => l.location_type === "room").sort(compareSiblings));
const roomIds = computed(() => rooms.value.map((r) => r.id));
const siteSpaces = computed(() => bindableSpaces(children.value ?? []));
const pinnableChildren = computed<Location[]>(() =>
  (children.value ?? []).filter((l) => l.location_type !== "room"));

const unwrittenIds = computed(() => unwrittenRoomIds(rooms.value));

// The room the beat is staged at directly, when it is one — "the party
// starts here when Run enters the site" (frame 15). Never moves the party on
// its own: the room list already requires a click to move them in, same as
// every other room, this is only what the "not yet inside" caption points at.
const openingRoom = computed(() => {
  const staged = stagedLocationRecord.value;
  return staged && staged.location_type === "room" ? rooms.value.find((r) => r.id === staged.id) ?? null : null;
});

const currentRoomId = computed(() =>
  partyRoomInSite(campaign.activeCampaign?.current_location_id ?? null, roomIds.value));
const currentRoom = computed(() => rooms.value.find((r) => r.id === currentRoomId.value) ?? null);
const roomOrdinalValue = computed(() => roomOrdinal(currentRoomId.value, roomIds.value));
const positionLabel = computed(() => {
  if (roomOrdinalValue.value !== null) return `room ${roomOrdinalValue.value} of ${rooms.value.length}`;
  return openingRoom.value ? `not yet inside — opens at ${openingRoom.value.name}` : "not yet inside";
});
const switchingCaption = computed(() => roomOrdinalValue.value === null ? "Switching back leaves this site" : `Switching back leaves this site at room ${roomOrdinalValue.value}`);

// ── Doors, and the unlock facts that widen reachability past `starts_locked`
//    (#868) — the same graph `SiteRunSurface` walks for the Atlas Run action. ─
const doorsQuery = useSiteDoors(roomIds);
const doors = computed(() => doorsQuery.data.value ?? []);
const { stateOf: doorStateOf } = useDoorStateForSite(siteId);
const reachable = computed(() => {
  const from = currentRoomId.value;
  if (!from) return null;
  const unlocked = new Set(doors.value.filter((d) => doorStateOf(d.id, "unlocked")?.value === true).map((d) => d.id));
  return computeReachableRoomIds(from, doors.value, unlocked);
});

const regionsQuery = useLocationMapRegions(siteId);
const regions = computed(() => regionsQuery.data.value ?? []);

// ── Frame 08's room-list subtitles: a room whose only known doors are all
//    secret and undiscovered gets its own caption rather than a plain
//    "Reachable" — the same derivation `SiteRunSurface` uses for its own
//    `runCaptions` mount of `SiteRoomList`. ──────────────────────────────
const secretUndiscoveredIds = computed(() => {
  const bySpace = new Map<string, typeof doors.value>();
  for (const door of doors.value) {
    for (const spaceId of new Set([door.from_location_id, door.to_location_id])) {
      const existing = bySpace.get(spaceId);
      if (existing) existing.push(door);
      else bySpace.set(spaceId, [door]);
    }
  }
  const ids = new Set<string>();
  for (const room of rooms.value) {
    const incident = bySpace.get(room.id) ?? [];
    if (incident.length && incident.every((d) => d.is_secret && doorStateOf(d.id, "found")?.value !== true)) {
      ids.add(room.id);
    }
  }
  return ids;
});

// The current room's own active zone, named for the "Party here · <zone>
// active" caption — same intersection `SiteRunSurface` computes.
const zoneNotes = computed(() => {
  const map = new Map<string, string>();
  const roomId = currentRoomId.value;
  const roomRegion = roomId ? regions.value.find((r) => r.region_role === "space" && r.space_location_id === roomId) : undefined;
  if (!roomId || !roomRegion) return map;
  const roomCells = new Set(roomRegion.cells);
  const zone = regions.value.find((r) => r.region_role === "zone" && r.cells.some((c) => roomCells.has(c)));
  const note = zone ? zone.label || zoneSummary(zone) : "";
  if (note) map.set(roomId, note);
  return map;
});

// Frame 4's current-room card reads this same map for its own "Party is
// here · <zone>" caption, keyed off the current room the same way.
const currentRoomZoneNote = computed(() => currentRoomId.value ? zoneNotes.value.get(currentRoomId.value) : undefined);

// ── A zone can name a beat (#868 S12) — a trigger zone whose payload names
//    THIS beat, traced over the room the party is currently standing in.
//    Comparing to `beat.id` (not merely "any beat in this quest") is what
//    keeps the prompt meaningful: `advance` has no target parameter, so it
//    can only ever advance the beat already staged here. Dismissing is
//    per-room, not per-session — walking the prompt off then back onto the
//    trigger room shows it again, since nothing about the config changed. ──
const dismissedRoomId = ref<string | null>(null);
// A dismissal only ever means "not now, in this room" — leaving the room
// forgets it, so walking back in re-checks the zone fresh, matching the
// comment above rather than pinning the dismissal to that room forever.
watch(currentRoomId, () => { dismissedRoomId.value = null; });
const triggerZone = computed(() => {
  const roomId = currentRoomId.value;
  if (!roomId) return null;
  const roomRegion = regions.value.find((r) => r.region_role === "space" && r.space_location_id === roomId);
  if (!roomRegion) return null;
  const roomCells = new Set(roomRegion.cells);
  return regions.value.find((r) =>
    r.region_role === "zone" && r.zone_kind === "trigger" && r.zone_payload.beat_id === beat.id
    && r.cells.some((c) => roomCells.has(c)),
  ) ?? null;
});
const showTriggerPrompt = computed(() => !!triggerZone.value && dismissedRoomId.value !== currentRoomId.value);
function dismissTriggerPrompt(): void { dismissedRoomId.value = currentRoomId.value; }

const { mutate: setCampaignLocation, isPending: isMoving } = useSetCampaignLocation();
function moveTo(roomId: string): void {
  if (!campaign.activeCampaignId || isMoving.value || roomId === currentRoomId.value) return;
  setCampaignLocation({ id: campaign.activeCampaignId, locationId: roomId }, { onError: (e) => toast.error(toast.fromError(e)) });
}

// Frame 4's Rooms sheet and expanded-map sheet both close on a successful
// move — the DM asked "where next," got their answer, and the sheet
// covering the current-room card is no longer where they want to look.
function onRoomsSheetMove(roomId: string): void {
  moveTo(roomId);
  roomsSheetOpen.value = false;
}
function onExpandedMapMove(roomId: string): void {
  moveTo(roomId);
  mapExpandOpen.value = false;
}

// ── Show/hide the map to players ────────────────────────────────────────
const { mutate: updateLocation, isPending: isTogglingShare } = useUpdateLocation();
function toggleMapShared(): void {
  if (!site.value) return;
  updateLocation({ id: site.value.id, update: { is_map_shared: !site.value.is_map_shared } }, { onError: (e) => toast.error(toast.fromError(e)) });
}

// ── Room state, for the shared room list ────────────────────────────────
const { stateOf } = useLocationStateForRooms(roomIds);

const currentRoomIdOrEmpty = computed(() => currentRoom.value?.id ?? "");
const { data: currentRoomLoot } = useLootPlacements({ locationId: currentRoomIdOrEmpty });
</script>
