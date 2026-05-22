<template>
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div
        v-if="open"
        class="fixed inset-0 z-200 flex items-center justify-center p-4"
        @mousedown.self="$emit('close')"
      >
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" />

        <div
          class="relative w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl flex flex-col max-h-[90vh]"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="dialogTitleId"
        >
          <!-- Header -->
          <div class="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-border shrink-0">
            <div class="shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-gold-500/15 text-gold-400">
              <IconListOrdered class="h-4.5 w-4.5" />
            </div>
            <h2 :id="dialogTitleId" class="font-cinzel text-sm font-bold text-foreground tracking-wide flex-1">
              {{ playlist ? "Edit Playlist" : "New Playlist" }}
            </h2>
            <button
              type="button"
              class="p-1 rounded text-muted-foreground hover:text-foreground transition-colors"
              @click="$emit('close')"
            >
              <IconClose class="h-4 w-4" />
            </button>
          </div>

          <!-- Body (scrollable) -->
          <div class="overflow-y-auto flex-1 px-5 py-4 space-y-4">
            <!-- Name -->
            <div class="space-y-1.5">
              <label class="font-cinzel text-xs font-semibold text-foreground tracking-wide">Name</label>
              <input
                v-model="localName"
                type="text"
                class="w-full rounded-md border border-border bg-input px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Tavern Music, Battle Scene…"
                maxlength="80"
              />
            </div>

            <!-- Type -->
            <div class="space-y-1.5">
              <label class="font-cinzel text-xs font-semibold text-foreground tracking-wide">Type</label>
              <div class="flex gap-2">
                <button
                  v-for="opt in typeOptions"
                  :key="opt.value"
                  type="button"
                  class="flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-cinzel tracking-wide transition-colors"
                  :class="localType === opt.value
                    ? opt.activeClass
                    : 'border-border text-muted-foreground hover:text-foreground hover:border-border/80'"
                  :disabled="!!playlist"
                  :title="playlist ? 'Type cannot be changed after creation' : undefined"
                  @click="localType = opt.value"
                >
                  <component :is="opt.icon" class="h-3.5 w-3.5 shrink-0" />
                  {{ opt.label }}
                </button>
              </div>
              <p class="font-fell text-xs text-muted-foreground italic">
                <template v-if="localType === 'music'">Tracks play one after another. Auto-advances when a track ends.</template>
                <template v-else>All tracks play simultaneously as a layered soundscape.</template>
              </p>
            </div>

            <!-- Music-only options -->
            <template v-if="localType === 'music'">
              <div class="flex gap-4">
                <label class="flex items-center gap-2 cursor-pointer select-none">
                  <input v-model="localShuffle" type="checkbox" class="accent-gold-500 h-3.5 w-3.5 rounded" />
                  <span class="font-cinzel text-xs text-foreground">Shuffle</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer select-none">
                  <input v-model="localRepeat" type="checkbox" class="accent-gold-500 h-3.5 w-3.5 rounded" />
                  <span class="font-cinzel text-xs text-foreground">Repeat all</span>
                </label>
              </div>
            </template>

            <!-- Track list -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between">
                <label class="font-cinzel text-xs font-semibold text-foreground tracking-wide">
                  Tracks
                  <span class="font-fell font-normal text-muted-foreground ml-1">({{ trackList.length }})</span>
                </label>
              </div>

              <div v-if="trackList.length === 0" class="py-4 text-center font-fell text-xs text-muted-foreground italic">
                No tracks yet — add sounds below.
              </div>

              <VueDraggable
                v-else
                v-model="trackList"
                class="space-y-1"
                handle=".drag-handle"
                :animation="120"
                ghost-class="opacity-40"
              >
                <PlaylistTrackRow
                  v-for="item in trackList"
                  :key="item.localId"
                  :sound="item.sound"
                  @remove="removeTrack(item.localId)"
                />
              </VueDraggable>
            </div>

            <!-- Add sound -->
            <div class="space-y-1.5">
              <label class="font-cinzel text-xs font-semibold text-foreground tracking-wide">Add Sound</label>
              <EntityCombobox
                v-model="addSoundId"
                :options="addableSounds"
                placeholder="Search sounds to add…"
              />
            </div>
          </div>

          <!-- Footer -->
          <div class="flex items-center justify-end gap-2 px-5 py-4 border-t border-border shrink-0">
            <button
              type="button"
              class="px-4 py-2 rounded-md border border-border font-cinzel text-xs tracking-wide text-muted-foreground hover:text-foreground transition-colors"
              @click="$emit('close')"
            >
              Cancel
            </button>
            <button
              type="button"
              class="px-4 py-2 rounded-md bg-gold-500/20 border border-gold-500/40 font-cinzel text-xs tracking-wide text-gold-400 hover:bg-gold-500/30 transition-colors disabled:opacity-50 disabled:pointer-events-none"
              :disabled="!localName.trim() || saving"
              @click="save"
            >
              {{ saving ? "Saving…" : "Save Playlist" }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { VueDraggable } from "vue-draggable-plus";
import { IconClose, IconListOrdered, IconMusicNote, IconWind } from "@/lib/icons";
import { useSounds } from "@/composables/useSounds";
import { usePlaylistTracks, useCreatePlaylist, useUpdatePlaylist, useReplacePlaylistTracks } from "@/composables/useSoundboardPlaylists";
import { useCampaignStore } from "@/stores/campaign";
import { storeToRefs } from "pinia";
import type { SoundboardPlaylist, PlaylistType, Sound } from "@/types/sound.types";
import PlaylistTrackRow from "./PlaylistTrackRow.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";

interface TrackListItem { sound: Sound; localId: string }

const { open, playlist, pageId } = defineProps<{
  open: boolean;
  playlist?: SoundboardPlaylist | null;
  pageId: string | null;
}>();
const emit = defineEmits<{ close: [] }>();

const { activeCampaignId } = storeToRefs(useCampaignStore());
const { data: allSounds } = useSounds();

// Only load existing tracks when editing
const editingId = computed(() => playlist?.id ?? null);
const { data: existingTracks } = usePlaylistTracks(editingId);

const { mutateAsync: createPlaylist } = useCreatePlaylist();
const { mutateAsync: updatePlaylist } = useUpdatePlaylist();
const { mutateAsync: replaceTracks } = useReplacePlaylistTracks();

// ── Local form state ──────────────────────────────────────────────────────

const localName = ref("");
const localType = ref<PlaylistType>("music");
const localShuffle = ref(false);
const localRepeat = ref(true);
const trackList = ref<TrackListItem[]>([]);
const addSoundId = ref("");
const saving = ref(false);

const dialogTitleId = computed(() => playlist ? `edit-playlist-${playlist.id}` : "create-playlist");

// Populate form when opening for edit
watch(
  () => playlist,
  (pl) => {
    if (pl) {
      localName.value = pl.name;
      localType.value = pl.playlist_type;
      localShuffle.value = pl.shuffle;
      localRepeat.value = pl.repeat;
    } else {
      localName.value = "";
      localType.value = "music";
      localShuffle.value = false;
      localRepeat.value = true;
      trackList.value = [];
    }
  },
  { immediate: true },
);

// Populate track list when existing tracks load (edit mode)
watch(existingTracks, (tracks) => {
  if (tracks && playlist) {
    trackList.value = tracks.map((t) => ({
      sound: t.sound,
      localId: t.id,
    }));
  }
});

// Auto-add when a sound is selected from the combobox
watch(addSoundId, (id) => {
  if (!id) return;
  const sound = allSounds.value?.find((s) => s.id === id);
  if (!sound || trackList.value.some((t) => t.sound.id === id)) {
    addSoundId.value = "";
    return;
  }
  trackList.value.push({ sound, localId: crypto.randomUUID() });
  addSoundId.value = "";
});

// ── Computed options ──────────────────────────────────────────────────────

const typeOptions = [
  { value: "music" as PlaylistType, label: "Music", icon: IconMusicNote, activeClass: "border-gold-500/40 bg-gold-500/10 text-gold-400" },
  { value: "ambient" as PlaylistType, label: "Ambient", icon: IconWind, activeClass: "border-green-500/40 bg-green-500/10 text-green-400" },
] as const;

/** Sounds not yet in the track list, available to add */
const addableSounds = computed(() => {
  const existingIds = new Set(trackList.value.map((t) => t.sound.id));
  return (allSounds.value ?? []).filter((s) => s.source_type !== "spotify" && !existingIds.has(s.id));
});

function removeTrack(localId: string) {
  trackList.value = trackList.value.filter((t) => t.localId !== localId);
}

// ── Save ──────────────────────────────────────────────────────────────────

async function save() {
  if (!localName.value.trim() || !activeCampaignId.value) return;
  saving.value = true;
  try {
    const soundIds = trackList.value.map((t) => t.sound.id);

    if (playlist) {
      // Edit: update metadata + replace tracks
      await updatePlaylist({ id: playlist.id, update: { name: localName.value.trim(), shuffle: localShuffle.value, repeat: localRepeat.value } });
      await replaceTracks({ playlistId: playlist.id, soundIds });
    } else {
      // Create: insert playlist then tracks
      const created = await createPlaylist({
        campaign_id: activeCampaignId.value,
        page_id: pageId,
        name: localName.value.trim(),
        playlist_type: localType.value,
        shuffle: localShuffle.value,
        repeat: localRepeat.value,
        sort_order: 0,
      });
      if (soundIds.length > 0) {
        await replaceTracks({ playlistId: created.id, soundIds });
      }
    }
    emit("close");
  } finally {
    saving.value = false;
  }
}
</script>
