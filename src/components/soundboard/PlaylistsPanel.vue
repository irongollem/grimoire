<template>
  <div class="space-y-3">
    <!-- Panel header -->
    <div class="flex items-center justify-between">
      <p class="text-caption text-muted-foreground italic">
        <template v-if="pageId">Playlists on this page.</template>
        <template v-else>All playlists in this campaign.</template>
      </p>
      <button
        class="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border font-cinzel text-xs tracking-wide text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors relative"
        :title="canCreatePlaylist ? undefined : 'Pro feature — upgrade for unlimited playlists'"
        @click="openNewPlaylist()"
      >
        <IconAdd class="h-3.5 w-3.5" />
        New Playlist
        <span v-if="playlistQuota && !playlistQuota.unlimited" class="text-caption-sm tabular-nums opacity-60">{{ playlistQuota.current }}/{{ playlistQuota.limit }}</span>
        <span v-if="!canCreatePlaylist" class="absolute -top-1.5 -right-1.5 px-1 rounded text-2xs font-cinzel bg-amber-500 text-black leading-4">PRO</span>
      </button>
    </div>

    <!-- Loading -->
    <LoadingSpinner v-if="isPending" />

    <!-- Empty state -->
    <div
      v-else-if="visible.length === 0"
      class="py-12 text-center space-y-2"
    >
      <IconListOrdered class="h-8 w-8 text-muted-foreground/30 mx-auto" />
      <p class="font-cinzel text-sm text-muted-foreground">No playlists yet</p>
      <p class="text-caption text-muted-foreground/70 italic">
        Create a music playlist to chain tracks, or an ambient playlist to layer a soundscape.
      </p>
      <button
        class="mt-2 px-4 py-2 rounded-md border border-gold-500/30 font-cinzel text-xs tracking-wide text-gold-400 hover:bg-gold-500/10 transition-colors"
        @click="openNewPlaylist()"
      >
        Create Playlist
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

    <!-- Editor dialog (create + edit) -->
    <PlaylistEditorDialog
      :open="showEditor"
      :playlist="editTarget"
      :page-id="pageId"
      @close="closeEditor"
    />

    <PaywallModal v-model="showPlaylistPaywall" resource="soundboard_playlists" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IconAdd, IconListOrdered } from "@/lib/icons";
import { usePlaylists, useDeletePlaylist } from "@/composables/useSoundboardPlaylists";
import { useSoundboardStore } from "@/stores/soundboard";
import { useQuota } from "@/composables/useQuota";
import type { SoundboardPlaylist } from "@/types/sound.types";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import PaywallModal from "@/components/common/PaywallModal.vue";
import PlaylistCard from "./PlaylistCard.vue";
import PlaylistEditorDialog from "./PlaylistEditorDialog.vue";

const { pageId } = defineProps<{ pageId: string | null }>();

const { data: playlists, isPending } = usePlaylists();
const { mutate: deletePlaylist } = useDeletePlaylist();
const store = useSoundboardStore();
const { canCreate: canCreatePlaylist, quota: playlistQuota } = useQuota("soundboard_playlists");
const showPlaylistPaywall = ref(false);

const showEditor = ref(false);
const editTarget = ref<SoundboardPlaylist | null>(null);

/** Filter to playlists that match the current page (or show all when pageId is null) */
const visible = computed(() => {
  const all = playlists.value ?? [];
  if (pageId === null) return all;
  return all.filter((pl) => pl.page_id === pageId || pl.page_id === null);
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
