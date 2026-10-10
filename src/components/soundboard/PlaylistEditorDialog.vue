<template>
  <AppModal
    :open="open"
    :size="meta.playlist_type === 'ambient' ? 'lg' : 'md'"
    @close="$emit('close')"
  >
    <ModalHeader
      :title="playlist ? `Edit ${noun.singular}` : `New ${noun.singular}`"
      :icon="noun.icon"
      tone="gold"
      closeable
      @close="$emit('close')"
    />

    <!-- Body (scrollable) -->
    <div class="overflow-y-auto flex-1 px-5 py-4 space-y-4">
      <!-- Name -->
      <div class="space-y-1.5">
        <label class="text-label-lg font-semibold text-foreground ">Name</label>
        <AppInput
          v-model="meta.name"
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
        <template v-if="meta.playlist_type === 'music'">Tracks play one after another. Auto-advances when a track ends.</template>
        <template v-else>All layers play at once: beds loop underneath while random layers fire on their own schedules.</template>
      </p>

      <!-- Music-only options -->
      <template v-if="meta.playlist_type === 'music'">
        <div class="flex gap-4">
          <AppCheckbox
            v-model="meta.shuffle"
            size="sm"
            label-role="label-lg"
            label-weight="normal" label-tone="foreground"
            label="Shuffle"
          />
          <AppCheckbox
            v-model="meta.repeat"
            size="sm"
            label-role="label-lg"
            label-weight="normal" label-tone="foreground"
            label="Repeat all"
          />
        </div>
      </template>

      <!-- Themes -->
      <div class="space-y-1.5">
        <label class="text-label-lg font-semibold text-foreground ">Themes</label>
        <TagInput v-model="meta.tags" placeholder="battle, tavern…" />
        <p class="text-caption text-muted-foreground italic">
          <template v-if="meta.playlist_type === 'music'">
            Encounters request music by theme. Tag this "battle" and any combat with that
            theme can start it. Tag three playlists the same and each fight picks between
            them, so your players stop recognising the goblin song.
          </template>
          <template v-else>
            Locations request ambience by theme. Tag this "tavern" and a tavern-themed
            location plays it while the party is there in a session, or when you press Play
            ambience on its page. Tag three scenes the same and it picks between them.
          </template>
        </p>
      </div>

      <!-- Track list -->
      <div class="space-y-1.5">
        <div class="flex items-center justify-between">
          <label class="text-label-lg font-semibold text-foreground ">
            {{ noun.entriesLabel }}
            <span class="font-fell font-normal text-muted-foreground ml-1">({{ trackList.length }})</span>
          </label>
        </div>

        <div v-if="trackList.length === 0" class="py-4 text-center text-caption text-muted-foreground italic">
          No {{ noun.entriesLabel.toLowerCase() }} yet. Add sounds below.
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
            :layer="meta.playlist_type === 'ambient' ? item.layer : null"
            @update:layer="Object.assign(item.layer, $event)"
            @remove="removeTrack(item.localId)"
            :previewing="store.playbackStates[item.sound.id]?.isPlaying === true"
            @preview="togglePreview(item.sound)"
          />
        </VueDraggable>
      </div>

      <!-- Add sound -->
      <div class="space-y-1.5">
        <label class="text-label-lg font-semibold text-foreground ">Add Sound</label>
        <EntityCombobox
          v-model="addSoundId"
          :options="addableSounds"
          placeholder="Search sounds to add…"
        />
      </div>
    </div>

    <DraftConflictNotice :fields="conflictLabels" :on-discard="discardEdits" class="mx-5 mb-3" />

    <!-- Footer -->
    <div class="flex items-center justify-end gap-2 px-5 py-4 border-t border-border shrink-0">
      <!-- The answer to "why did my rain not start" belongs in the room,
           not in a code comment. -->
      <p v-if="meta.playlist_type === 'ambient'" class="me-auto text-caption text-muted-foreground text-pretty">
        A sound already claimed by another running scene is skipped: one element per sound,
        so nothing plays over itself.
      </p>
      <AppButton variant="subtle" size="md" label="Cancel" @click="$emit('close')" />
      <AppButton
        variant="tinted"
        tone="primary"
        emphasis="soft"
        size="md"
        :label="saving ? 'Saving…' : `Save ${noun.singular}`"
        :disabled="!meta.name.trim() || saving"
        @click="save"
      />
    </div>
  </AppModal>

  <PaywallModal v-model="showPaywall" resource="soundboard_playlists" />
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from "vue";
import { VueDraggable } from "vue-draggable-plus";
import { PLAYLIST_NOUNS } from "@/lib/audio/playlistPeers";
import { useSounds } from "@/composables/soundboard/useSounds";
import { usePlaylistTracks, useCreatePlaylist, useUpdatePlaylist, useReplacePlaylistTracks } from "@/composables/soundboard/useSoundboardPlaylists";
import { useCampaignStore } from "@/stores/campaign";
import { useSoundboardStore } from "@/stores/soundboard";
import { storeToRefs } from "pinia";
import { DEFAULT_LAYER } from "@/types/sound.types";
import type { SoundboardPlaylist, PlaylistType, PlaylistTrackWithSound, Sound, PlaylistTrackLayer } from "@/types/sound.types";
import PlaylistTrackRow from "./PlaylistTrackRow.vue";
import DraftConflictNotice from "@/components/common/feedback/DraftConflictNotice.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import ModalHeader from "@/components/common/overlays/ModalHeader.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import TagInput from "@/components/common/controls/TagInput.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import PaywallModal from "@/components/common/overlays/PaywallModal.vue";
import { useRecordDraft } from "@/composables/useRecordDraft";
import { useToast } from "@/composables/useToast";
import { isQuotaExceeded } from "@/lib/quotaError";

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
//
// Two drafts, because the playlist and its tracks are two queries. Each takes
// fresh server data into the fields the user has not touched (#946), and the
// save below writes only what changed.

interface MetaDraft {
  name: string;
  playlist_type: PlaylistType;
  shuffle: boolean;
  repeat: boolean;
  tags: string[];
}

interface TracksDraft {
  tracks: TrackListItem[];
}

const {
  draft: meta,
  conflicts: metaConflicts,
  changes: metaChanges,
  commit: commitMeta,
  reset: resetMeta,
} = useRecordDraft<SoundboardPlaylist, MetaDraft>({
  source: () => playlist,
  identity: (row) => row.id,
  toDraft: (row) =>
    row
      ? { name: row.name, playlist_type: row.playlist_type, shuffle: row.shuffle, repeat: row.repeat, tags: [...row.tags] }
      : { name: "", playlist_type: defaultType, shuffle: false, repeat: true, tags: [] },
});

/** The playlist columns an edit writes. Pure: also run over the server copy. */
function buildMeta(d: MetaDraft) {
  return { name: d.name.trim(), shuffle: d.shuffle, repeat: d.repeat, tags: d.tags };
}

const {
  draft: tracksDraft,
  conflicts: trackConflicts,
  changes: trackChanges,
  commit: commitTracks,
  reset: resetTracks,
} = useRecordDraft<{ id: string; rows: PlaylistTrackWithSound[] }, TracksDraft>({
  source: () => (playlist && existingTracks.value ? { id: playlist.id, rows: existingTracks.value } : null),
  identity: (row) => row.id,
  toDraft: (row) => ({
    tracks: (row?.rows ?? []).map((t) => ({
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
    })),
  }),
});

/** The ordered entries `replaceTracks` takes. Pure: also run over the server copy. */
function buildTracks(d: TracksDraft) {
  return { tracks: d.tracks.map((t) => ({ soundId: t.sound.id, layer: { ...t.layer } })) };
}

const trackList = computed({
  get: () => tracksDraft.tracks,
  set: (next: TrackListItem[]) => {
    tracksDraft.tracks = next;
  },
});
const addSoundId = ref("");
const saving = ref(false);
const showPaywall = ref(false);
const toast = useToast();

const noun = computed(() => PLAYLIST_NOUNS[meta.playlist_type]);

const conflictLabels = computed(() => {
  const labels: Partial<Record<keyof MetaDraft, string>> = {
    name: "Name",
    shuffle: "Shuffle",
    repeat: "Repeat all",
    tags: "Themes",
  };
  return [
    ...metaConflicts.value.flatMap((key) => labels[key] ?? []),
    ...(trackConflicts.value.length > 0 ? [noun.value.entriesLabel] : []),
  ];
});

function discardEdits() {
  resetMeta();
  resetTracks();
}

function startBlank() {
  Object.assign(meta, { name: "", playlist_type: defaultType, shuffle: false, repeat: true, tags: [] });
  trackList.value = [];
}

// The dialog stays mounted while shut: opening it starts from the server copy
// (dropping edits abandoned last time) or, for a new one, from a blank form.
watch(
  () => open,
  (isOpen) => {
    if (!isOpen) return;
    if (playlist) discardEdits();
    else startBlank();
  },
);
// Going from editing to creating swaps the record under an open dialog too.
watch(
  () => playlist,
  (pl) => {
    if (!pl) startBlank();
  },
);

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
 * Play one layer on its own, so the DM can hear what they are setting — and
 * stop it again from the same button, because a rain bed can run for minutes.
 *
 * Deliberately a plain one-shot rather than a scene preview: the point is to
 * check "is this the right mug", and the layer's own level and pan ranges only
 * mean anything once the scene is running.
 */
const auditioned = new Set<string>();
function togglePreview(sound: Sound): void {
  if (store.playbackStates[sound.id]?.isPlaying === true) {
    store.stop(sound.id);
    return;
  }
  auditioned.add(sound.id);
  store.play(sound.id, sound.file_url, sound.category, sound.gain_trim);
}

// Closing the editor ends whatever it was auditioning; anything the DM had
// playing before they opened it is left alone. The dialog stays mounted while
// shut, so closing is `open` going false, not an unmount.
function endAuditions(): void {
  for (const id of auditioned) {
    if (store.playbackStates[id]?.isPlaying === true) store.stop(id);
  }
  auditioned.clear();
}
watch(() => open, (isOpen) => { if (!isOpen) endAuditions(); });
onBeforeUnmount(endAuditions);

// ── Save ──────────────────────────────────────────────────────────────────

async function save() {
  if (!meta.name.trim() || !activeCampaignId.value) return;
  saving.value = true;
  try {
    if (playlist) {
      // Edit: write only what changed, so a stale dialog never reverts the rest.
      const update = metaChanges(buildMeta);
      if (Object.keys(update).length > 0) {
        await updatePlaylist({ id: playlist.id, update });
        commitMeta();
      }
      const { tracks } = trackChanges(buildTracks);
      if (tracks) {
        await replaceTracks({ playlistId: playlist.id, tracks });
        commitTracks();
      }
    } else {
      // Create: insert playlist then tracks
      const { tracks } = buildTracks(tracksDraft);
      const created = await createPlaylist({
        campaign_id: activeCampaignId.value,
        page_id: pageId,
        playlist_type: meta.playlist_type,
        ...buildMeta(meta),
        sort_order: 0,
      });
      if (tracks.length > 0) {
        await replaceTracks({ playlistId: created.id, tracks });
      }
    }
    emit("close");
  } catch (e) {
    if (isQuotaExceeded(e)) { showPaywall.value = true; return; }
    toast.error(toast.fromError(e));
  } finally {
    saving.value = false;
  }
}
</script>
