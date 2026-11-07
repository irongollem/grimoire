<template>
  <div class="flex h-full min-h-0 flex-col gap-3">
    <div class="space-y-2">
      <ListSearchInput v-model="soundboardUi.soundboardSearchQuery" :inline="false" placeholder="Search sounds and scenes…" />
      <SoundCategoryFilter v-model="soundboardUi.soundboardFilterCategory" />
      <AppButton
        v-if="soundboardUi.soundboardHasActiveFilters"
        variant="link"
        size="inline"
        label="Clear"
        @click="soundboardUi.resetSoundboardFilters()"
      />
    </div>

    <SegmentedControl v-model="list" :options="LISTS" block />

    <div class="flex flex-wrap gap-2">
      <AppButton
        v-if="list === 'sounds'"
        variant="tinted"
        tone="primary"
        size="sm"
        :icon="IconAdd"
        label="Add sound"
        @click="openAddSound"
      />
      <AppButton
        v-else
        variant="tinted"
        tone="primary"
        size="sm"
        :icon="IconAdd"
        :label="list === 'scenes' ? 'New scene' : 'New playlist'"
        @click="openNewPlaylist"
      />
    </div>

    <StarterScenesCard v-if="list === 'scenes' && scenesEmpty" compact />

    <p v-if="canPlace" class="text-caption text-muted-foreground">Pick a row to put it in the selected slot, or drag it onto the deck.</p>
    <p v-else class="text-caption text-muted-foreground">Drag a row onto the deck, or select an empty slot first.</p>

    <ul v-if="rows.length > 0" class="min-h-0 flex-1 space-y-0.5 overflow-y-auto" :aria-label="`${list} library`">
      <DeckLibraryRow
        v-for="row in shown"
        :key="row.key"
        :row="row"
        :on-page="isOnPage(row)"
        :can-place="canPlace"
        :playing="isPlaying(row)"
        @place="emit('place', row.placement)"
        @preview="preview(row)"
        @edit="openEdit(row)"
      />
      <li v-if="rows.length > shown.length" class="px-2 py-2 text-caption text-muted-foreground">
        Showing {{ shown.length }} of {{ rows.length }}. Search to narrow the list.
      </li>
    </ul>
    <p v-else-if="filtersActive" class="py-6 text-center text-body italic text-muted-foreground">
      Nothing here matches your filters.
    </p>
    <p v-else class="py-6 text-center text-body italic text-muted-foreground">{{ emptyText }}</p>

    <PlaylistEditorDialog
      :open="editorOpen"
      :playlist="editTarget"
      :default-type="list === 'scenes' ? 'ambient' : 'music'"
      @close="closeEditor"
    />
    <SoundEditDialog :sound="editSound" @close="editSoundId = null" />
    <PaywallModal v-model="soundPaywall" resource="sounds" />
    <PaywallModal v-model="playlistPaywall" resource="soundboard_playlists" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { IconAdd } from "@/lib/icons";
import { useSounds } from "@/composables/soundboard/useSounds";
import { usePlaylists, usePlaylistsTracks, useFetchPlaylistTracks } from "@/composables/soundboard/useSoundboardPlaylists";
import { useAudibleCheck, useSoundToggle } from "@/composables/soundboard/useSoundPlayback";
import { useQuota } from "@/composables/billing/useQuota";
import { useSoundboardStore } from "@/stores/soundboard";
import { useSoundboardUiStore } from "@/stores/ui/soundboard";
import type { SoundboardPlaylist } from "@/types/sound.types";
import AppButton from "@/components/common/controls/AppButton.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import ListSearchInput from "@/components/common/list/ListSearchInput.vue";
import PaywallModal from "@/components/common/overlays/PaywallModal.vue";
import SoundCategoryFilter from "../SoundCategoryFilter.vue";
import StarterScenesCard from "../StarterScenesCard.vue";
import PlaylistEditorDialog from "../PlaylistEditorDialog.vue";
import SoundEditDialog from "../SoundEditDialog.vue";
import DeckLibraryRow from "./DeckLibraryRow.vue";
import { libraryRows, type LibraryList, type LibraryPlacement, type LibraryRow } from "./libraryRows";

const { usedSoundIds, usedPlaylistIds, canPlace } = defineProps<{
  /** Sounds already on the current page. */
  usedSoundIds: ReadonlySet<string>;
  usedPlaylistIds: ReadonlySet<string>;
  /** An empty slot is selected, so a click places. */
  canPlace: boolean;
}>();
const emit = defineEmits<{ place: [placement: LibraryPlacement] }>();

const LISTS = [
  { value: "sounds", label: "Sounds" },
  { value: "scenes", label: "Scenes" },
  { value: "playlists", label: "Playlists" },
] as const;

// Long enough for any real library; past it the DM searches instead of scrolling.
const ROW_CAP = 300;

const soundboardUi = useSoundboardUiStore();
const store = useSoundboardStore();
const list = ref<LibraryList>("sounds");

const { data: sounds } = useSounds();
const { data: playlists } = usePlaylists();
const { byPlaylist } = usePlaylistsTracks(() => (playlists.value ?? []).map((pl) => pl.id));
const fetchTracks = useFetchPlaylistTracks();
const isAudible = useAudibleCheck();
const toggleSound = useSoundToggle();

const trackCounts = computed(() => {
  const counts = new Map<string, number>();
  for (const [id, tracks] of byPlaylist.value ?? []) counts.set(id, tracks.length);
  return counts;
});

const filtersActive = computed(() => soundboardUi.soundboardHasActiveFilters);

const rows = computed(() =>
  libraryRows(list.value, sounds.value ?? [], playlists.value ?? [], trackCounts.value, {
    query: soundboardUi.soundboardSearchQuery,
    category: soundboardUi.soundboardFilterCategory,
  }),
);
const shown = computed(() => rows.value.slice(0, ROW_CAP));
const scenesEmpty = computed(() => !(playlists.value ?? []).some((pl) => pl.playlist_type === "ambient"));

const emptyText = computed(() => {
  if (list.value === "sounds") return "No sounds yet. Add one to build your deck.";
  if (list.value === "scenes") return "No scenes yet. A scene layers ambient sounds into a room.";
  return "No playlists yet. A playlist is a running order of music.";
});

function isOnPage(row: LibraryRow): boolean {
  return row.placement.kind === "sound" ? usedSoundIds.has(row.placement.id) : usedPlaylistIds.has(row.placement.id);
}

function isPlaying(row: LibraryRow): boolean {
  if (row.sound) return isAudible(row.sound);
  return row.playlist !== null && store.isPlaylistActive(row.playlist.id);
}

async function preview(row: LibraryRow) {
  if (row.sound) {
    toggleSound(row.sound);
    return;
  }
  const playlist = row.playlist;
  if (playlist === null) return;
  if (store.isPlaylistActive(playlist.id)) {
    store.stopPlaylist(playlist.playlist_type, playlist.id);
    return;
  }
  store.playPlaylist(playlist, await fetchTracks(playlist.id));
}

// ── Creating and editing ──────────────────────────────────────────────────

const { canCreate: canCreateSound } = useQuota("sounds");
const { canCreate: canCreatePlaylist } = useQuota("soundboard_playlists");
const soundPaywall = ref(false);
const playlistPaywall = ref(false);
const editorOpen = ref(false);
const editTarget = ref<SoundboardPlaylist | null>(null);
// By id, so the dialog reads the live cache row (artwork and trim write straight through).
const editSoundId = ref<string | null>(null);
const editSound = computed(() => (editSoundId.value === null ? null : (sounds.value ?? []).find((s) => s.id === editSoundId.value) ?? null));

function openAddSound() {
  if (!canCreateSound.value) {
    soundPaywall.value = true;
    return;
  }
  soundboardUi.addSoundDialogOpen = true;
}

function openNewPlaylist() {
  if (!canCreatePlaylist.value) {
    playlistPaywall.value = true;
    return;
  }
  editTarget.value = null;
  editorOpen.value = true;
}

function openEdit(row: LibraryRow) {
  if (row.sound) {
    editSoundId.value = row.sound.id;
    return;
  }
  editTarget.value = row.playlist;
  editorOpen.value = true;
}

function closeEditor() {
  editorOpen.value = false;
  editTarget.value = null;
}
</script>
