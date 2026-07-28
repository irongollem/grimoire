<template>
  <div class="space-y-3">
    <!-- No caption row: the tab already says which peer this is, the page rail
         says which page, and a line that exists on two tabs out of three shifts
         the whole page on every switch. Quota lives on the create button. -->

    <!-- Loading -->
    <LoadingSpinner v-if="isPending" />

    <template v-else>
    <!-- Offered here as well as in the board's empty state, because a campaign
         that predates the library has a full board and none of these scenes,
         and would otherwise never find out they exist. Scenes tab only — they
         are all ambient — and it hides itself once they are all added. -->
    <StarterScenesCard v-if="playlistType === 'ambient'" compact />

    <!-- Search found nothing — a different fact from "you have none", and
         offering Create here would build a duplicate of the thing being
         searched for. -->
    <div v-if="visible.length === 0 && filter.trim() !== ''" class="py-10 text-center">
      <p class="text-body italic text-muted-foreground">
        No {{ noun.plural.toLowerCase() }} match "{{ filter.trim() }}".
      </p>
    </div>

    <!-- Empty state -->
    <div
      v-else-if="visible.length === 0"
      class="py-12 text-center space-y-2"
    >
      <component :is="noun.icon" class="h-8 w-8 text-muted-foreground/30 mx-auto" />
      <p class="font-cinzel text-sm text-muted-foreground">No {{ noun.plural.toLowerCase() }} yet</p>
      <p class="text-caption text-muted-foreground/70 italic">{{ noun.blurb }}</p>
      <button
        class="mt-2 px-4 py-2 rounded-md border border-gold-500/30 font-cinzel text-xs tracking-wide text-gold-400 hover:bg-gold-500/10 transition-colors"
        @click="openNewPlaylist()"
      >
        Create {{ noun.singular }}
      </button>
    </div>

    <!-- Playlist grid -->
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <PlaylistCard
        v-for="pl in visible"
        :key="pl.id"
        :playlist="pl"
        @edit="startEdit(pl)"
        @delete="handleDelete(pl.id)"
      />
    </div>

    <!--
      Spotify lives here rather than among the pads. It is music by definition,
      and its transport belongs to Spotify's own SDK — no waveform, no layering,
      nothing the fire grid knows how to do. Keeping it out leaves that grid one
      uniform kind of thing.
    -->
    <section v-if="playlistType === 'music' && spotifySounds.length > 0" class="space-y-2 pt-2">
      <div class="flex items-center gap-2 border-t border-border/50 pt-3">
        <h3 class="font-cinzel text-xs tracking-wide text-muted-foreground">From Spotify</h3>
        <span class="text-caption text-muted-foreground/70">
          Driven by Spotify's own player, so it has its own controls.
        </span>
      </div>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SoundCard
          v-for="sound in spotifySounds"
          :key="sound.id"
          :sound="sound"
          :show-delete="true"
          mode="arrange"
        />
      </div>
    </section>
    </template>

    <!-- Editor dialog (create + edit) -->
    <PlaylistEditorDialog
      :open="showEditor"
      :playlist="editTarget"
      :page-id="pageId"
      :default-type="playlistType"
      @close="closeEditor"
    />

    <PaywallModal v-model="showPlaylistPaywall" resource="soundboard_playlists" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { PLAYLIST_NOUNS } from "@/lib/playlistPeers";
import { usePlaylists, useDeletePlaylist } from "@/composables/useSoundboardPlaylists";
import { useSounds } from "@/composables/useSounds";
import { useSoundboardStore } from "@/stores/soundboard";
import { useQuota } from "@/composables/useQuota";
import type { SoundboardPlaylist, PlaylistType } from "@/types/sound.types";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import PaywallModal from "@/components/common/PaywallModal.vue";
import PlaylistCard from "./PlaylistCard.vue";
import SoundCard from "./SoundCard.vue";
import PlaylistEditorDialog from "./PlaylistEditorDialog.vue";
import StarterScenesCard from "./StarterScenesCard.vue";

const { pageId, playlistType, filter = "", createSignal = 0 } = defineProps<{
  pageId: string | null;
  /** Which peer this panel is showing — scenes are ambient, playlists are music. */
  playlistType: PlaylistType;
  /** Free-text search from the shared filter row: matches name and theme tags. */
  filter?: string;
  /** Bumped by the page head's create button; the panel owns dialog and gating. */
  createSignal?: number;
}>();

watch(
  () => createSignal,
  () => openNewPlaylist(),
);

// A scene is a room, a playlist is a running order — the shared vocabulary
// lives in playlistPeers so the dialog behind this panel says the same word.
const noun = computed(() => PLAYLIST_NOUNS[playlistType]);

const { data: allSounds } = useSounds();

/**
 * Spotify sounds on this page.
 *
 * Page-filtered like the sounds grid is. Showing every campaign's Spotify
 * tracks while the rest of the board is scoped to Chapter 3 would make the
 * page tabs look broken.
 */
const spotifySounds = computed(() => {
  const list = allSounds.value;
  if (list === undefined) return [];
  return list.filter(
    (s) => s.source_type === "spotify" && (pageId === null || s.page_id === pageId),
  );
});

const { data: playlists, isPending } = usePlaylists();
const { mutate: deletePlaylist } = useDeletePlaylist();
const store = useSoundboardStore();
const { canCreate: canCreatePlaylist } = useQuota("soundboard_playlists");
const showPlaylistPaywall = ref(false);

const showEditor = ref(false);
const editTarget = ref<SoundboardPlaylist | null>(null);

/** This peer's playlists, on the current page (or every page when pageId is null). */
const visible = computed(() => {
  const all = playlists.value === undefined ? [] : playlists.value;
  let list = all.filter((pl) => pl.playlist_type === playlistType);
  if (pageId !== null) {
    list = list.filter((pl) => pl.page_id === pageId || pl.page_id === null);
  }
  const q = filter.trim().toLowerCase();
  if (q !== "") {
    // Tags too: a DM hunting the battle music types "battle", not the name
    // they gave the playlist three months ago.
    list = list.filter(
      (pl) =>
        pl.name.toLowerCase().includes(q) ||
        pl.tags.some((tag) => tag.toLowerCase().includes(q)),
    );
  }
  return list;
});

function openNewPlaylist() {
  if (!canCreatePlaylist.value) { showPlaylistPaywall.value = true; return; }
  showEditor.value = true;
}

function startEdit(pl: SoundboardPlaylist) {
  editTarget.value = pl;
  showEditor.value = true;
}

function closeEditor() {
  showEditor.value = false;
  editTarget.value = null;
}

function handleDelete(id: string) {
  // Stop the playlist if it's currently active — by id, so deleting one scene
  // does not silence the others stacked with it.
  if (store.activeMusicPlaylist?.playlistId === id) store.stopMusicPlaylist();
  store.stopAmbientPlaylist(id);
  deletePlaylist(id);
}
</script>
