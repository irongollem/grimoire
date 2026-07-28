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
                class="w-full rounded-md border border-border bg-input px-3 py-2 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
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
              <p class="text-caption text-muted-foreground italic">
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

            <!-- Themes -->
            <div class="space-y-1.5">
              <label class="font-cinzel text-xs font-semibold text-foreground tracking-wide">Themes</label>
              <TagInput v-model="localTags" placeholder="battle, tavern…" />
              <p class="text-caption text-muted-foreground italic">
                Encounters and locations request audio by theme. A music playlist tagged "battle" can be picked when a combat starts.
              </p>
            </div>

            <!-- Track list -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between">
                <label class="font-cinzel text-xs font-semibold text-foreground tracking-wide">
                  Tracks
                  <span class="font-fell font-normal text-muted-foreground ml-1">({{ trackList.length }})</span>
                </label>
              </div>

              <div v-if="trackList.length === 0" class="py-4 text-center text-caption text-muted-foreground italic">
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
                  :layer="localType === 'ambient' ? item.layer : null"
                  @update:layer="Object.assign(item.layer, $event)"
                  @remove="removeTrack(item.localId)"
                  @preview="previewLayer(item.sound)"
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
import { useSoundboardStore } from "@/stores/soundboard";
import { useHotkeys } from "@/composables/useHotkeys";
import { storeToRefs } from "pinia";
import { DEFAULT_LAYER } from "@/types/sound.types";
import type { SoundboardPlaylist, PlaylistType, Sound, PlaylistTrackLayer } from "@/types/sound.types";
import PlaylistTrackRow from "./PlaylistTrackRow.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import TagInput from "@/components/common/TagInput.vue";

interface TrackListItem {
  sound: Sound;
  localId: string;
  /** Scene settings for this layer. Ignored for music playlists. */
  layer: PlaylistTrackLayer;
}

const { open, playlist, pageId, defaultType = "music" } = defineProps<{
  open: boolean;
  playlist?: SoundboardPlaylist | null;
  pageId: string | null;
  /**
   * What a *new* one starts as. Opening this from the Scenes tab should not
   * hand the DM a music playlist to change back. Ignored when editing.
   */
  defaultType?: PlaylistType;
}>();
const emit = defineEmits<{ close: [] }>();

// Registering at the overlay layer does two jobs: Escape closes the dialog, and
// the soundboard page's transport keys stop responding while it is open — so
// typing a playlist name cannot pause the session's audio.
useHotkeys(
  [{ combo: "escape", description: "Close", handler: () => emit("close"), hidden: true }],
  { layer: "overlay", enabled: () => open },
);

const { activeCampaignId } = storeToRefs(useCampaignStore());
const store = useSoundboardStore();
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
const localTags = ref<string[]>([]);
const trackList = ref<TrackListItem[]>([]);
const trackListSeeded = ref(false);
const addSoundId = ref("");
const saving = ref(false);

const dialogTitleId = computed(() => playlist ? `edit-playlist-${playlist.id}` : "create-playlist");

// Populate form when opening for edit
watch(
  () => playlist,
  (pl) => {
    trackListSeeded.value = false;
    if (pl) {
      localName.value = pl.name;
      localType.value = pl.playlist_type;
      localShuffle.value = pl.shuffle;
      localRepeat.value = pl.repeat;
      localTags.value = pl.tags;
    } else {
      localName.value = "";
      localType.value = defaultType;
      localShuffle.value = false;
      localRepeat.value = true;
      localTags.value = [];
      trackList.value = [];
    }
  },
  { immediate: true },
);

// Populate track list when existing tracks first load (edit mode).
// Guard with trackListSeeded so background re-fetches don't overwrite
// changes the user has made since opening the dialog.
watch(existingTracks, (tracks) => {
  if (tracks && playlist && !trackListSeeded.value) {
    trackListSeeded.value = true;
    trackList.value = tracks.map((t) => ({
      sound: t.sound,
      localId: t.id,
      layer: {
        layer_volume: t.layer_volume,
        is_generator: t.is_generator,
        min_interval_s: t.min_interval_s,
        max_interval_s: t.max_interval_s,
        min_gain: t.min_gain,
        max_gain: t.max_gain,
        pan_spread: t.pan_spread,
      },
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
  trackList.value.push({ sound, localId: crypto.randomUUID(), layer: { ...DEFAULT_LAYER } });
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

/**
 * Fire one layer on its own, so the DM can hear what they are setting.
 *
 * Deliberately a plain one-shot rather than a scene preview: the point is to
 * check "is this the right mug", and the layer's own level and pan ranges only
 * mean anything once the scene is running.
 */
function previewLayer(sound: Sound): void {
  store.play(sound.id, sound.file_url, sound.category, sound.gain_trim);
}

// ── Save ──────────────────────────────────────────────────────────────────

async function save() {
  if (!localName.value.trim() || !activeCampaignId.value) return;
  saving.value = true;
  try {
    const tracks = trackList.value.map((t) => ({ soundId: t.sound.id, layer: t.layer }));

    if (playlist) {
      // Edit: update metadata + replace tracks
      await updatePlaylist({ id: playlist.id, update: { name: localName.value.trim(), shuffle: localShuffle.value, repeat: localRepeat.value, tags: localTags.value } });
      await replaceTracks({ playlistId: playlist.id, tracks });
    } else {
      // Create: insert playlist then tracks
      const created = await createPlaylist({
        campaign_id: activeCampaignId.value,
        page_id: pageId,
        name: localName.value.trim(),
        playlist_type: localType.value,
        shuffle: localShuffle.value,
        repeat: localRepeat.value,
        tags: localTags.value,
        sort_order: 0,
      });
      if (tracks.length > 0) {
        await replaceTracks({ playlistId: created.id, tracks });
      }
    }
    emit("close");
  } finally {
    saving.value = false;
  }
}
</script>
