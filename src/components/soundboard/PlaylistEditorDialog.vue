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
          :class="localType === 'ambient' ? 'max-w-3xl' : 'max-w-lg'"
          class="relative w-full rounded-xl border border-border bg-card shadow-2xl flex flex-col max-h-[90vh]"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="dialogTitleId"
        >
          <!-- Header -->
          <div class="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-border shrink-0">
            <div class="shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-gold-500/15 text-gold-400">
              <component :is="noun.icon" class="h-4.5 w-4.5" />
            </div>
            <h2 :id="dialogTitleId" class="font-cinzel text-sm font-bold text-foreground tracking-wide flex-1">
              {{ playlist ? `Edit ${noun.singular}` : `New ${noun.singular}` }}
            </h2>
            <AppButton
              variant="ghost"
              size="icon-xs"
              icon-size="md"
              :icon="IconClose"
              aria-label="Close"
              @click="$emit('close')"
            />
          </div>

          <!-- Body (scrollable) -->
          <div class="overflow-y-auto flex-1 px-5 py-4 space-y-4">
            <!-- Name -->
            <div class="space-y-1.5">
              <label class="font-cinzel text-xs font-semibold text-foreground tracking-wide">Name</label>
              <AppInput
                v-model="localName"
                tone="filled"
                size="body"
                placeholder="Tavern Music, Battle Scene…"
                maxlength="80"
              />
            </div>

            <!-- No type toggle: the tab you came from already decided, and a
                 visible Music | Ambient control here would contradict it in
                 schema vocabulary. What remains is the explanation. -->
            <p class="text-caption text-muted-foreground italic">
              <template v-if="localType === 'music'">Tracks play one after another. Auto-advances when a track ends.</template>
              <template v-else>All layers play at once — beds loop underneath while random layers fire on their own schedules.</template>
            </p>

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
                <template v-if="localType === 'music'">
                  Encounters request music by theme. Tag this "battle" and any combat with that
                  theme can start it — and if you tag three playlists the same, each fight picks
                  between them, so your players stop recognising the goblin song.
                </template>
                <template v-else>
                  Locations request ambience by theme. Tag this "tavern" and walking into a
                  tavern-themed location starts it — tag three scenes the same and it picks between
                  them. A theme that matches nothing leaves your audio exactly where it is.
                </template>
              </p>
            </div>

            <!-- Track list -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between">
                <label class="font-cinzel text-xs font-semibold text-foreground tracking-wide">
                  {{ noun.entriesLabel }}
                  <span class="font-fell font-normal text-muted-foreground ml-1">({{ trackList.length }})</span>
                </label>
              </div>

              <div v-if="trackList.length === 0" class="py-4 text-center text-caption text-muted-foreground italic">
                No {{ noun.entriesLabel.toLowerCase() }} yet — add sounds below.
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
            <!-- The answer to "why did my rain not start" belongs in the room,
                 not in a code comment. -->
            <p v-if="localType === 'ambient'" class="me-auto text-caption text-muted-foreground text-pretty">
              A sound already claimed by another running scene is skipped — one element per sound,
              so nothing plays over itself.
            </p>
            <AppButton variant="subtle" size="md" label="Cancel" @click="$emit('close')" />
            <AppButton
              variant="tinted"
              tone="primary"
              emphasis="soft"
              size="md"
              :label="saving ? 'Saving…' : `Save ${noun.singular}`"
              :disabled="!localName.trim() || saving"
              @click="save"
            />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { VueDraggable } from "vue-draggable-plus";
import { IconClose } from "@/lib/icons";
import { PLAYLIST_NOUNS } from "@/lib/audio/playlistPeers";
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
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";

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

const noun = computed(() => PLAYLIST_NOUNS[localType.value]);

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
