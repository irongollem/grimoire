<template>
  <ListPageLayout title="Soundboard" description="Build your deck and play it">
    <template #title-suffix>
      <ManualHelpLink page="soundboard" />
    </template>

    <template #actions>
      <!-- Board settings had exactly one way in: a muted status line at the
           bottom of the mixer drawer, which its own comment described as "a
           read-only echo, not a control". Three settings including remote-player
           sharing and the CarPlay direct-output fix were effectively hidden.
           It shows at every width: hidden below sm, a phone (the device the DM
           takes to the car) could only reach it through the deck's foldout. -->
      <AppButton
        variant="subtle"
        size="sm"
        :icon="IconSettings"
        aria-label="Board settings"
        tooltip="Board settings: triggers, sharing, output, controllers"
        @click="soundboardUi.soundboardSettingsOpen = true"
      />

      <!-- The mixer drawer toggle — same idea as the chat toggle. -->
      <AppButton
        :variant="soundboardUi.soundboardMixerOpen ? 'tinted' : 'subtle'"
        tone="primary"
        emphasis="soft"
        size="sm"
        :icon="IconMixer"
        label="Mixer"
        :tooltip="soundboardUi.soundboardMixerOpen ? 'Close the mixer' : 'Open the mixer'"
        class="hidden lg:flex"
        @click="soundboardUi.soundboardMixerOpen = !soundboardUi.soundboardMixerOpen"
      />

      <!-- Below lg there is no drawer: the deck's own mixer popover stands in. -->
      <DeckMixerPopover class="lg:hidden" />

      <!-- Spotify connect/disconnect (only for the owner user) -->
      <template v-if="spotifyStore.isEnabled">
        <AppButton
          v-if="spotifyStore.isConnected"
          :variant="spotifyStore.isReady ? 'tinted' : 'subtle'"
          tone="success"
          emphasis="outline"
          size="sm"
          :aria-label="spotifyStore.isReady ? 'Spotify connected. Disconnect' : 'Connecting to Spotify'"
          :tooltip="spotifyStore.isReady ? 'Spotify connected. Click to disconnect' : 'Connecting to Spotify…'"
          :loading="!spotifyStore.isReady"
          @click="spotifyStore.isReady ? spotifyStore.disconnect() : undefined"
        >
          <!-- Slot, not `:icon`: BrandIcon takes a prop, and the mark must not be
               recoloured by the button's tone. -->
          <template #icon><BrandIcon name="spotify" class="h-4 w-4" /></template>
        </AppButton>
        <AppButton
          v-else
          variant="subtle"
          size="sm"
          aria-label="Connect your Spotify account"
          tooltip="Connect your Spotify account"
          @click="spotifyStore.connect()"
        >
          <template #icon><BrandIcon name="spotify" class="h-4 w-4" /></template>
        </AppButton>
      </template>

      <!-- Spotify is per-campaign BYOK. Without a Client ID the whole control
           vanished, so a DM on a campaign that has not been configured saw no
           trace of the feature and no way to find it. Point at the setting. -->
      <AppButton
        v-else-if="auth.isDM"
        variant="subtle"
        size="sm"
        aria-label="Set up Spotify"
        tooltip="Spotify needs a Client ID on this campaign before it can be connected"
        :to="{ name: 'campaign-settings', query: { tab: 'spotify' } }"
        class="border-dashed"
      >
        <template #icon><BrandIcon name="spotify" class="h-4 w-4 opacity-60" /></template>
      </AppButton>

    </template>

    <!-- What is audible and why leads the page: the first question a DM has. -->
    <DeckNowChips class="mt-1" />

    <AudioFormatNotice class="mt-3" />

    <!-- Spotify errors surface here too, not just in the widget: a connection
         failure the DM never sees is a connection failure they cannot fix. -->
    <SpotifyErrorBanner />

    <PaywallModal v-if="paywallMounted" v-model="showSoundPaywall" resource="sounds" />

    <div class="mt-3 flex min-w-0 items-start">
      <div class="min-w-0 flex-1">
        <!-- Day one: nothing to place yet, so the starter scenes lead. -->
        <div v-if="showEmptyState" class="space-y-4">
          <StarterScenesCard />
          <EmptyState
            icon="music"
            title="No sounds yet"
            description="Add ambient tracks, music and effects, then lay them out on the deck."
            action-label="Add sound"
            @action="openAddSound()"
          />
        </div>

        <!-- Build: one side panel and the deck. The panel is the library, or the picked
             pad's settings, with a switch between the two; it never changes width and
             never leaves, so picking a pad moves nothing and the deck keeps its width.
             (The library used to step aside for a separate settings column below 2xl,
             and the whole page jumped left on every pick; three columns at once left a
             laptop's pads too narrow to read.) -->
        <div v-else class="flex min-w-0 items-start gap-5">
          <!-- A column from lg, sheets below. -->
          <aside
            v-if="mode === 'build' && isWide"
            class="flex w-72 shrink-0 flex-col gap-3 2xl:w-80"
            aria-label="Library and pad settings"
          >
            <SegmentedControl
              :model-value="sidePanel"
              :options="sidePanelOptions"
              size="sm"
              block
              aria-label="Side panel"
              @update:model-value="panelChoice = $event"
            />
            <PadSettingsPanel
              v-if="sidePanel === 'pad' && selectedPadId"
              :key="selectedPadId"
              :pad-id="selectedPadId"
              :controls="soundboardUi.deckControls"
              @close="selectedPadId = null"
            />
            <DeckLibraryPanel
              v-else
              :used-sound-ids="usedSoundIds"
              :used-playlist-ids="usedPlaylistIds"
              :can-place="canPlace"
              @place="onPlace"
            />
          </aside>

          <section class="relative flex min-w-0 flex-1 flex-col gap-3" :aria-label="deckLabel">
            <!-- Phone: the page and the mode on one row, the lanes and the library
                 on the next, each wide enough for a thumb. (A tab strip shared its
                 row with Add page and Library and left the names unreadable.) -->
            <template v-if="isPhone">
              <div class="flex min-w-0 items-center gap-2">
                <SoundboardPagePicker
                  :model-value="activePageId"
                  :pages="pages ?? []"
                  :pad-counts="padCounts"
                  class="flex-1"
                  @update:model-value="soundboardUi.soundboardActivePage = $event"
                />
                <SegmentedControl
                  :model-value="mode"
                  :options="MODE_OPTIONS"
                  size="sm"
                  aria-label="Build or play"
                  @update:model-value="chosenMode = $event"
                />
              </div>
              <div class="flex min-w-0 items-center gap-2">
                <SegmentedControl
                  v-model="laneWindow"
                  :options="LANE_WINDOWS"
                  size="sm"
                  block
                  class="min-w-0 flex-1"
                  aria-label="Lanes shown"
                />
                <AppButton
                  v-if="mode === 'build'"
                  variant="subtle"
                  size="sm"
                  :icon="IconList"
                  label="Library"
                  @click="libraryOpen = true"
                />
              </div>
            </template>

            <div v-else class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
              <div class="min-w-0 flex-1 basis-60 overflow-hidden">
                <SoundboardPageTabs
                  :model-value="activePageId"
                  :pages="pages ?? []"
                  :pad-counts="padCounts"
                  @update:model-value="soundboardUi.soundboardActivePage = $event"
                  @pad-drop="onPadDropOnPage"
                />
              </div>
              <AppButton
                v-if="mode === 'build' && !isWide"
                variant="subtle"
                size="sm"
                :icon="IconList"
                label="Library"
                @click="libraryOpen = true"
              />
              <SegmentedControl
                :model-value="mode"
                :options="MODE_OPTIONS"
                size="sm"
                aria-label="Build or play"
                @update:model-value="chosenMode = $event"
              />
            </div>

            <div v-if="isPending || !activePageId" role="status" class="grid grid-cols-4 gap-2 md:grid-cols-8">
              <span class="sr-only">Loading…</span>
              <SkeletonBlock v-for="n in 16" :key="n" class="h-14 rounded-md" />
            </div>

            <template v-else-if="mode === 'build'">
              <div class="relative">
              <DeckGrid
                :lanes="snapshot.lanes"
                :cells="buildCells"
                :rows="buildRows"
                :lane-start="laneStart"
                :lane-count="laneCount"
                size="sm"
                :controls="soundboardUi.deckControls"
                tool="play"
                mode="build"
                :selected-pad-id="selectedPadId ?? undefined"
                @select="onSelect"
                @lane-activate="onLaneActivate"
                @drop="onDropOnSlot"
              />
              <template v-if="laneEditing !== null && activePageId && isWide">
                <div class="fixed inset-0 z-20" aria-hidden="true" @click="laneEditing = null" />
                <div
                  data-slip
                  class="absolute top-8 z-30 w-72 max-w-full bg-card p-3 shadow-lg"
                  :style="lanePopoverStyle"
                  role="dialog"
                  aria-label="Edit lane"
                  @keydown.esc="laneEditing = null"
                >
                  <LaneEditor :page-id="activePageId" :lane-index="laneEditing" @close="laneEditing = null" />
                </div>
              </template>
              </div>
              <p class="max-w-prose text-caption text-muted-foreground">
                Drag a sound from the library onto a slot, or pick an empty slot and click a sound. Dropped on a pad
                that already has one, it becomes another take of that pad. Click a lane's name to rename it or set
                how it plays.
              </p>
            </template>

            <BuilderPlayDeck v-else :lane-start="laneStart" :lane-count="laneCount" :phone="isPhone" />

          </section>
        </div>
      </div>

      <BuilderMixerDrawer />
    </div>
    <BoardSettingsDialog
      v-if="settingsMounted"
      :open="soundboardUi.soundboardSettingsOpen"
      @close="soundboardUi.soundboardSettingsOpen = false"
    />

    <!-- Below lg the library, pad settings and lane editor are sheets. -->
    <template v-if="!isWide">
      <MobileSheet v-model:open="libraryOpen" title="Library" show-until="lg">
        <DeckLibraryPanel
          :used-sound-ids="usedSoundIds"
          :used-playlist-ids="usedPlaylistIds"
          :can-place="canPlace"
          @place="onPlaceFromSheet"
        />
      </MobileSheet>
      <MobileSheet v-model:open="padSheetOpen" title="Pad settings" show-until="lg">
        <PadSettingsPanel
          v-if="selectedPadId"
          :key="selectedPadId"
          :pad-id="selectedPadId"
          :controls="soundboardUi.deckControls"
          @close="selectedPadId = null"
        />
      </MobileSheet>
      <MobileSheet v-model:open="laneSheetOpen" title="Lane" show-until="lg">
        <LaneEditor
          v-if="laneEditing !== null && activePageId"
          :page-id="activePageId"
          :lane-index="laneEditing"
          @close="laneEditing = null"
        />
      </MobileSheet>
    </template>

  </ListPageLayout>
</template>

<script setup lang="ts">
import { ref, computed, defineAsyncComponent, watch, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import { useLazyMount } from "@/composables/useLazyMount";
import { useAbove, useBelow } from "@/composables/useBreakpoint";
import { useHotkeys } from "@/composables/useHotkeys";
import { useToast } from "@/composables/useToast";
import { IconList, IconMixer, IconSettings } from "@/lib/icons";
import { emptyDeckCell, firstFreeSlot } from "@/lib/audio/deck/deckModel";
import { DECK_LANES } from "@/lib/audio/deck/deckSurface";
import { useDeck } from "@/composables/soundboard/useDeck";
import { useAddTake, useCreatePad, useDeckPads, useMovePad } from "@/composables/soundboard/useDeckPads";
import { useSoundboardPages, useCreateSoundboardPage } from "@/composables/soundboard/useSoundboardPages";
import { useSounds } from "@/composables/soundboard/useSounds";
import { useQuota } from "@/composables/billing/useQuota";
import { useSpotifyStore } from "@/stores/spotify";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { useAppUiStore } from "@/stores/ui/app";
import { useSoundboardUiStore } from "@/stores/ui/soundboard";
import AudioFormatNotice from "@/components/common/feedback/AudioFormatNotice.vue";
import ListPageLayout from "@/components/common/list/ListPageLayout.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import MobileSheet from "@/components/common/overlays/MobileSheet.vue";
import SkeletonBlock from "@/components/common/feedback/SkeletonBlock.vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import StarterScenesCard from "@/components/soundboard/StarterScenesCard.vue";
import SpotifyErrorBanner from "@/components/soundboard/SpotifyErrorBanner.vue";
import SoundboardPageTabs from "@/components/soundboard/SoundboardPageTabs.vue";
import SoundboardPagePicker from "@/components/soundboard/SoundboardPagePicker.vue";
import BrandIcon from "@/components/brand/BrandIcon.vue";
import DeckMixerPopover from "@/components/soundboard/deck/DeckMixerPopover.vue";
import DeckGrid from "@/components/soundboard/deck/DeckGrid.vue";
import BuilderPlayDeck from "@/components/soundboard/builder/BuilderPlayDeck.vue";
import BuilderMixerDrawer from "@/components/soundboard/builder/BuilderMixerDrawer.vue";
import DeckNowChips from "@/components/soundboard/deck/DeckNowChips.vue";
import DeckLibraryPanel from "@/components/soundboard/builder/DeckLibraryPanel.vue";
import PadSettingsPanel from "@/components/soundboard/builder/PadSettingsPanel.vue";
import LaneEditor from "@/components/soundboard/builder/LaneEditor.vue";

// Shown on demand, so neither rides in the page's chunk. The dialogs mount
// through a latch so they keep their state once closed.
const PaywallModal = defineAsyncComponent(() => import("@/components/common/overlays/PaywallModal.vue"));
const BoardSettingsDialog = defineAsyncComponent(() => import("@/components/soundboard/BoardSettingsDialog.vue"));

const PAD_TYPE = "application/x-grimoire-pad";
const SOUND_TYPE = "application/x-grimoire-sound";
const PLAYLIST_TYPE = "application/x-grimoire-playlist";
/** Always room to grow into: the deck never looks finished. */
const MIN_BUILD_ROWS = 4;

type Mode = "build" | "play";
const MODE_OPTIONS = [
  { value: "build", label: "Build" },
  { value: "play", label: "Play" },
] as const;
type SidePanel = "library" | "pad";
const LANE_WINDOWS = [
  { value: 0, label: "Lanes 1–4" },
  { value: 4, label: "Lanes 5–8" },
] as const;

const route = useRoute();
const router = useRouter();
const toast = useToast();
const deck = useDeck();
const soundboardUi = useSoundboardUiStore();
const appUi = useAppUiStore();
const spotifyStore = useSpotifyStore();
const auth = useAuthStore();
const { activeCampaignId } = storeToRefs(useCampaignStore());
const { canCreate: canCreateSound } = useQuota("sounds");

const showSoundPaywall = ref(false);
const paywallMounted = useLazyMount(showSoundPaywall);
const settingsMounted = useLazyMount(computed(() => soundboardUi.soundboardSettingsOpen));

onMounted(() => spotifyStore.initSDK());

const { data: sounds, isPending: soundsPending } = useSounds();
const { data: pages, isSuccess: pagesReady } = useSoundboardPages();
const { data: padRows, isPending: padsPending } = useDeckPads();
const { mutate: createPage } = useCreateSoundboardPage();
const { mutate: createPad } = useCreatePad();
const { mutate: movePad } = useMovePad();
const { mutate: addTake } = useAddTake();

const snapshot = deck.snapshot;
const activePageId = deck.activePageId;
const isPending = computed(() => soundsPending.value || padsPending.value);

const isWide = useAbove("lg");
const isPhone = useBelow("md");

// ── The page exists ──────────────────────────────────────────────────────
// The migration laid every existing board out on pages, so a campaign with
// none is a new one: it gets a single "Main" and nothing else.
const mainRequested = ref(false);
watch(
  [pagesReady, pages, activeCampaignId],
  ([ready, list, campaignId]) => {
    if (!ready || mainRequested.value || campaignId === null || list === undefined) return;
    if (list.length === 0) {
      mainRequested.value = true;
      createPage({ name: "Main", sort_order: 0 }, { onSuccess: (page) => (soundboardUi.soundboardActivePage = page.id) });
    }
  },
  { immediate: true },
);

// ── Build or Play ───────────────────────────────────────────────────────
// Until the DM chooses, the mode follows the session: running means play.
const chosenMode = ref<Mode | null>(null);
const mode = computed<Mode>(() => chosenMode.value ?? (appUi.dmMode === "play" ? "play" : "build"));

const deckLabel = computed(() => {
  const page = (pages.value ?? []).find((p) => p.id === activePageId.value);
  return page === undefined ? "Deck" : `Deck: page ${page.name}`;
});

// ── What is on the deck ──────────────────────────────────────────────────

const allPads = computed(() => (padRows.value === undefined ? [] : padRows.value));
const pagePadInfos = computed(() => deck.pagePads.value);

const usedSoundIds = computed(() => new Set(allPads.value.flatMap((pad) => pad.takes.map((take) => take.sound_id))));
const usedPlaylistIds = computed(() => {
  const ids = new Set<string>();
  for (const pad of allPads.value) if (pad.playlist_id !== null) ids.add(pad.playlist_id);
  return ids;
});
const padCounts = computed(() => {
  const counts: Record<string, number> = {};
  for (const pad of allPads.value) counts[pad.page_id] = (counts[pad.page_id] ?? 0) + 1;
  return counts;
});

const showEmptyState = computed(
  () => !isPending.value && (sounds.value ?? []).length === 0 && allPads.value.length === 0,
);


const buildRows = computed(() => Math.max(MIN_BUILD_ROWS, snapshot.value.rows + 1));
// The snapshot ends at the lowest pad; build adds empty rows beneath it.
const buildCells = computed(() => {
  // A guest is triggered audio passing through, not part of the layout, so building sees its slot as free.
  const cells = snapshot.value.cells.map((cell) => (cell.guest === null ? cell : emptyDeckCell(cell.lane, cell.row)));
  const have = new Set(cells.map((c) => `${c.lane}:${c.row}`));
  for (let row = 0; row < buildRows.value; row++) {
    for (let lane = 0; lane < DECK_LANES; lane++) {
      if (!have.has(`${lane}:${row}`)) cells.push(emptyDeckCell(lane, row));
    }
  }
  return cells;
});

const laneWindow = ref<0 | 4>(0);
const laneStart = computed(() => (isPhone.value ? laneWindow.value : 0));
const laneCount = computed(() => (isPhone.value ? 4 : undefined));

// ── Selection ────────────────────────────────────────────────────────────

const selectedPadId = ref<string | null>(null);
const selectedSlot = ref<{ lane: number; row: number } | null>(null);

// The side panel follows the pick (a pad opens its settings, an empty slot the
// library) until the DM flips it, say to the library to drag in another take.
const panelChoice = ref<SidePanel>("library");
const sidePanel = computed<SidePanel>(() => (selectedPadId.value === null ? "library" : panelChoice.value));
const sidePanelOptions = computed(() => [
  { value: "library" as const, label: "Library" },
  { value: "pad" as const, label: "Pad", disabled: selectedPadId.value === null, tooltip: selectedPadId.value === null ? "Pick a pad first" : undefined },
]);

function padAtSlot(lane: number, row: number) {
  return pagePadInfos.value.find((info) => info.pad.lane === lane && info.pad.grid_row === row) ?? null;
}

/** An empty slot is selected: the library's rows can drop into it by click. */
const canPlace = computed(
  () => mode.value === "build" && selectedSlot.value !== null && padAtSlot(selectedSlot.value.lane, selectedSlot.value.row) === null,
);

function onSelect({ lane, row, padId }: { lane: number; row: number; padId: string | null }) {
  if (padId === null) {
    selectedSlot.value = { lane, row };
    selectedPadId.value = null;
    // Below lg the library is a sheet, and a phone cannot drag into the deck: tapping
    // an empty slot opens the library on it, so the next tap on a row places it there.
    if (mode.value === "build" && !isWide.value) libraryOpen.value = true;
  } else {
    selectedSlot.value = null;
    selectedPadId.value = padId;
  }
  panelChoice.value = padId === null ? "library" : "pad";
}

function focusPad(padId: string): boolean {
  const pad = allPads.value.find((p) => p.id === padId);
  if (pad === undefined) return false;
  soundboardUi.soundboardActivePage = pad.page_id;
  chosenMode.value = "build";
  selectedSlot.value = null;
  selectedPadId.value = padId;
  panelChoice.value = "pad";
  return true;
}

// ?pad=<id> is how the dock's Edit tool lands here. Applied once per value, so
// a refetch cannot reselect a pad the DM has since closed.
let appliedParam: string | null = null;
watch(
  [() => route.query.pad, allPads],
  ([param]) => {
    if (typeof param !== "string") {
      appliedParam = null;
      return;
    }
    if (param === appliedParam) return;
    if (focusPad(param)) appliedParam = param;
  },
  { immediate: true },
);
watch(selectedPadId, (id) => {
  if (id !== null) appliedParam = id;
  const current = typeof route.query.pad === "string" ? route.query.pad : null;
  if (current === id) return;
  // replace, not push: selecting pads is not navigation.
  void router.replace({ query: { ...route.query, pad: id === null ? undefined : id } });
});

// The Edit tool pressed on this page asks the same thing as ?pad=.
watch(
  () => deck.editRequest.value,
  (request) => {
    if (request === null) return;
    focusPad(request.padId);
    deck.clearEditRequest();
  },
  { immediate: true },
);

// A selection that no longer points at anything goes away.
watch([allPads, activePageId], () => {
  if (selectedPadId.value === null) {
    if (selectedSlot.value !== null && padAtSlot(selectedSlot.value.lane, selectedSlot.value.row) !== null) selectedSlot.value = null;
    return;
  }
  const pad = allPads.value.find((p) => p.id === selectedPadId.value);
  if (pad === undefined || (activePageId.value !== null && pad.page_id !== activePageId.value)) selectedPadId.value = null;
});
watch(activePageId, () => (selectedSlot.value = null));
watch(mode, () => {
  if (mode.value === "play") {
    selectedPadId.value = null;
    selectedSlot.value = null;
    laneEditing.value = null;
  }
});

// ── Placing ─────────────────────────────────────────────────────────────

type LibraryItem = { kind: "sound"; id: string } | { kind: "playlist"; id: string };

function placeAt(lane: number, row: number, item: LibraryItem, thenSelect: boolean) {
  const pageId = activePageId.value;
  if (pageId === null) return;
  createPad(
    item.kind === "sound"
      ? { pad: { page_id: pageId, lane, grid_row: row }, soundIds: [item.id] }
      : { pad: { page_id: pageId, lane, grid_row: row, playlist_id: item.id } },
    {
      onSuccess: (pad) => {
        if (thenSelect) onSelect({ lane, row, padId: pad.id });
      },
      onError: (e) => toast.error(toast.fromError(e, "Could not put that on the deck.")),
    },
  );
}

function onPlace(item: LibraryItem) {
  const slot = selectedSlot.value;
  if (slot === null) return;
  placeAt(slot.lane, slot.row, item, true);
}

const libraryOpen = ref(false);
function onPlaceFromSheet(item: LibraryItem) {
  onPlace(item);
  libraryOpen.value = false;
}

function onDropOnSlot({ lane, row, event }: { lane: number; row: number; event: DragEvent }) {
  const pageId = activePageId.value;
  const data = event.dataTransfer;
  if (pageId === null || data === null) return;
  const occupant = padAtSlot(lane, row);
  const padId = data.getData(PAD_TYPE);
  const soundId = data.getData(SOUND_TYPE);
  const playlistId = data.getData(PLAYLIST_TYPE);

  if (padId !== "") {
    if (occupant?.pad.id === padId) return;
    // The RPC swaps with whatever sits there, in one transaction.
    movePad({ padId, pageId, lane, row }, { onError: (e) => toast.error(toast.fromError(e, "Could not move that pad.")) });
    return;
  }
  if (soundId !== "") {
    if (occupant === null) return placeAt(lane, row, { kind: "sound", id: soundId }, false);
    if (occupant.kind !== "sound") {
      toast.error(`That slot holds a ${occupant.kind}; drop on an empty slot`);
      return;
    }
    if (occupant.pad.takes.some((take) => take.sound_id === soundId)) return;
    addTake({ padId: occupant.pad.id, soundId }, { onError: (e) => toast.error(toast.fromError(e, "Could not add that take.")) });
    return;
  }
  if (playlistId !== "") {
    if (occupant !== null) {
      toast.error("That slot is taken; drop on an empty slot");
      return;
    }
    placeAt(lane, row, { kind: "playlist", id: playlistId }, false);
  }
}

/** A pad dropped on a page tab goes to that page's first free slot in its own lane. */
function onPadDropOnPage({ pageId, padId }: { pageId: string; padId: string }) {
  const pad = allPads.value.find((p) => p.id === padId);
  if (pad === undefined || pad.page_id === pageId) return;
  const target = firstFreeSlot(allPads.value.filter((p) => p.page_id === pageId), pad.lane);
  movePad(
    { padId, pageId, lane: target.lane, row: target.row },
    { onError: (e) => toast.error(toast.fromError(e, "Could not move that pad.")) },
  );
}

// ── Lanes ───────────────────────────────────────────────────────────────

const laneEditing = ref<number | null>(null);
function onLaneActivate(index: number) {
  laneEditing.value = laneEditing.value === index ? null : index;
}
// Hangs under its header: left-aligned on the left half, right-aligned on the right.
const lanePopoverStyle = computed(() => {
  const index = laneEditing.value;
  if (index === null) return {};
  const shown = DECK_LANES;
  return index < shown / 2
    ? { left: `${(index / shown) * 100}%` }
    : { right: `${((shown - 1 - index) / shown) * 100}%` };
});

// ── Sheets (below lg) ───────────────────────────────────────────────────

const padSheetOpen = computed({
  get: () => mode.value === "build" && !isWide.value && selectedPadId.value !== null,
  set: (open) => {
    if (!open) selectedPadId.value = null;
  },
});
const laneSheetOpen = computed({
  get: () => !isWide.value && laneEditing.value !== null,
  set: (open) => {
    if (!open) laneEditing.value = null;
  },
});

// ── Keys ────────────────────────────────────────────────────────────────
// The deck's own keys work everywhere. Space belongs to this page, and only
// while playing: while building it should not stop the room.

/** A focused button already answers to Space; firing the transport too would be two acts in one press. */
function focusIsOnAControl(): boolean {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === "BUTTON" || el.tagName === "A" || el.getAttribute("role") === "button";
}
useHotkeys(
  [
    {
      combo: "space",
      description: "Pause or resume everything",
      handler: () => {
        if (focusIsOnAControl()) return;
        deck.dispatch({ type: "pauseAll" });
      },
    },
  ],
  { layer: "page", enabled: () => mode.value === "play" },
);

// ── Add sound ───────────────────────────────────────────────────────────
// The dialog is mounted app-wide (AiGeneratorPanels) so music generation can be
// reopened from its badge on any page.
function openAddSound() {
  if (!canCreateSound.value) {
    showSoundPaywall.value = true;
    return;
  }
  soundboardUi.addSoundDialogOpen = true;
}

// The mobile FAB's create lands here.
watch(
  () => soundboardUi.soundboardCreateSignal,
  () => openAddSound(),
);
</script>
