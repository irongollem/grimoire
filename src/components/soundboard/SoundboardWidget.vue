<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200 ease-out"
      leave-active-class="transition-opacity duration-150 ease-in"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="store.widgetOpen"
        ref="widgetEl"
        class="fixed z-50 w-72 rounded-lg border border-border bg-card shadow-xl"
        :style="posStyle"
        :class="dragging ? 'select-none' : ''"
      >
        <!-- Header — drag handle -->
        <div
          class="flex items-center gap-2 px-3 py-2 border-b border-border cursor-grab active:cursor-grabbing"
          @pointerdown="startDrag"
        >
          <IconMusicNote class="h-3.5 w-3.5 text-gold-400 shrink-0" />
          <span class="font-cinzel text-xs font-semibold text-foreground flex-1 tracking-wide">Soundboard</span>
          <CastButton />
          <button
            v-if="store.hasActiveAudio || spotifyStore.isPlaying"
            class="text-caption-sm text-muted-foreground hover:text-destructive transition-colors px-1.5 py-0.5 rounded border border-border hover:border-destructive/40"
            title="Stop all sounds"
            @click="stopAll"
          >
            Stop All
          </button>
          <AppButton
            variant="ghost"
            size="icon-xs"
            :icon="IconClose"
            aria-label="Close soundboard widget"
            @click="store.toggleWidget()"
          />
        </div>

        <!-- Playing sounds list -->
        <div class="max-h-72 overflow-y-auto p-2 space-y-1.5">
          <!-- Spotify track (singleton) — visible while a track is loaded, even when paused -->
          <div
            v-if="spotifyStore.isConnected && spotifyStore.trackName"
            class="group/spotify space-y-1.5 pb-1.5 border-b border-border/50"
          >
            <div class="flex items-center gap-2 px-2 py-1.5 rounded-md bg-green-500/5 border border-green-500/20">
              <img
                v-if="spotifyStore.albumArtUrl"
                :src="spotifyStore.albumArtUrl"
                class="h-7 w-7 rounded shrink-0 object-cover"
                alt=""
              />
              <div class="flex-1 min-w-0">
                <p class="font-cinzel text-xs font-medium text-foreground truncate">
                  {{ spotifyStore.trackName }}
                </p>
                <p class="text-caption-sm text-muted-foreground truncate">
                  {{ spotifyStore.artistName }}
                </p>
              </div>
              <!-- Volume -->
              <VolumeSlider
                accent="green"
                :model-value="spotifyStore.volume"
                @update:model-value="spotifyStore.setVolume($event)"
              />
              <!-- Prev / IconPlay·IconPause / Next -->
              <AppButton
                variant="ghost"
                size="inline-xs"
                class="shrink-0"
                tooltip="Previous track"
                :icon="IconSkipBack"
                icon-size="xs"
                @click="spotifyStore.previousTrack()"
              />
              <AppButton
                variant="ghost"
                size="inline-xs"
                class="shrink-0"
                :tooltip="spotifyStore.isPlaying ? 'Pause' : 'Resume'"
                @click="spotifyStore.isPlaying ? spotifyStore.pause() : spotifyStore.resume()"
              >
                <template #icon>
                  <IconPause v-if="spotifyStore.isPlaying" class="h-3 w-3" />
                  <IconPlay v-else class="h-3 w-3" />
                </template>
              </AppButton>
              <AppButton
                variant="ghost"
                size="inline-xs"
                class="shrink-0"
                tooltip="Next track"
                :icon="IconSkipForward"
                icon-size="xs"
                @click="spotifyStore.nextTrack()"
              />
            </div>

            <!-- Progress bar + repeat/shuffle on same row -->
            <div class="flex items-center gap-1.5 px-2">
              <span class="text-caption-sm text-muted-foreground tabular-nums">
                {{ formatSpotifyTime(spotifyStore.positionMs) }}
              </span>
              <div class="flex-1 h-1 bg-border/50 rounded-full">
                <div
                  class="h-full bg-green-500/50 rounded-full"
                  :style="{ width: spotifyProgress + '%' }"
                />
              </div>
              <span class="text-caption-sm text-muted-foreground tabular-nums">
                {{ formatSpotifyTime(spotifyStore.durationMs) }}
              </span>
              <!-- IconRepeat -->
              <button
                class="shrink-0 transition-all opacity-40 [@media(hover:hover)]:opacity-0 group-hover/spotify:opacity-100"
                :class="spotifyStore.repeatMode > 0 ? 'text-green-500' : 'text-muted-foreground hover:text-foreground'"
                :title="repeatTitle"
                @click="cycleRepeat"
              >
                <IconRepeatOne v-if="spotifyStore.repeatMode === 2" class="h-2.5 w-2.5" />
                <IconRepeat v-else class="h-2.5 w-2.5" />
              </button>
              <!-- IconShuffle -->
              <button
                class="shrink-0 transition-all opacity-40 [@media(hover:hover)]:opacity-0 group-hover/spotify:opacity-100"
                :class="spotifyStore.shuffleOn ? 'text-green-500' : 'text-muted-foreground hover:text-foreground'"
                title="Shuffle"
                @click="spotifyStore.setShuffle(!spotifyStore.shuffleOn)"
              >
                <IconShuffle class="h-2.5 w-2.5" />
              </button>
            </div>
          </div>

          <!-- Spotify error — shared with the /soundboard page -->
          <SpotifyErrorBanner />

          <!-- Active music playlist -->
          <div
            v-if="store.activeMusicPlaylist"
            class="space-y-1 pb-1.5 border-b border-border/50"
          >
            <div class="flex items-center gap-2 px-2 py-1.5 rounded-md bg-gold-500/5 border border-gold-500/20">
              <IconMusicNote class="h-3.5 w-3.5 text-gold-400 shrink-0" />
              <div class="flex-1 min-w-0">
                <p class="font-cinzel text-xs font-medium text-foreground truncate">
                  {{ store.activeMusicPlaylist.playlistName }}
                </p>
                <p v-if="activeMusicTrackName" class="text-caption-sm text-muted-foreground truncate">
                  ♪ {{ activeMusicTrackName }}
                  <span class="ml-1 opacity-60">
                    {{ store.activeMusicPlaylist.currentIndex + 1 }} / {{ store.activeMusicPlaylist.trackSoundIds.length }}
                  </span>
                </p>
                <!-- The widget is where a DM is standing when audio surprises
                     them, so "why" has to be answerable here too. -->
                <CausedByChip :trigger="musicTrigger" small class="mt-0.5" />
              </div>
              <!-- Effect -->
              <SoundEffectPicker
                :model-value="store.activeMusicPlaylist?.effect ?? 'none'"
                @update:model-value="store.setMusicPlaylistEffect($event)"
              />
              <!-- Prev -->
              <AppButton
                variant="ghost"
                size="inline-xs"
                class="shrink-0"
                tooltip="Previous track"
                :icon="IconSkipBack"
                icon-size="xs"
                @click="store.musicPlaylistPrev()"
              />
              <!-- Next -->
              <AppButton
                variant="ghost"
                size="inline-xs"
                class="shrink-0"
                tooltip="Next track"
                :icon="IconSkipForward"
                icon-size="xs"
                @click="store.musicPlaylistNext()"
              />
              <!-- Stop -->
              <AppButton
                variant="ghost"
                tone="danger"
                size="inline-xs"
                class="shrink-0"
                tooltip="Stop playlist"
                :icon="IconStop"
                icon-size="xs"
                @click="store.stopMusicPlaylist()"
              />
            </div>
          </div>

          <!-- Active ambient scenes — several can run at once -->
          <div
            v-if="store.activeAmbientPlaylists.length > 0"
            class="pb-1.5 border-b border-border/50 space-y-1"
          >
            <div
              v-for="scene in store.activeAmbientPlaylists"
              :key="scene.playlistId"
              class="flex items-center gap-2 px-2 py-1.5 rounded-md bg-green-500/5 border border-green-500/20"
            >
              <IconWind class="h-3.5 w-3.5 text-green-400 shrink-0" />
              <div class="flex-1 min-w-0">
                <p class="font-cinzel text-xs font-medium text-foreground truncate">
                  {{ scene.playlistName }}
                </p>
                <p class="text-caption-sm text-muted-foreground">
                  {{ scene.soundIds.length }} layered tracks
                </p>
                <CausedByChip :trigger="triggerForPlaylist(scene.playlistId)" small class="mt-0.5" />
              </div>
              <!-- Stops this scene only; the others stacked with it keep running -->
              <AppButton
                variant="ghost"
                tone="danger"
                size="inline-xs"
                class="shrink-0"
                :tooltip="`Stop ${scene.playlistName}`"
                :icon="IconStop"
                icon-size="xs"
                @click="store.stopAmbientPlaylist(scene.playlistId)"
              />
            </div>
          </div>

          <!-- HTML audio sounds -->
          <template v-if="playingSounds.length > 0">
            <div
              v-for="sound in playingSounds"
              :key="sound.id"
              class="flex items-center gap-2 px-2 py-1.5 rounded-md bg-gold-500/5 border border-gold-500/20"
            >
              <p class="font-cinzel text-xs font-medium text-foreground truncate flex-1 min-w-0">{{ sound.name }}</p>
              <!-- Volume -->
              <VolumeSlider
                :disabled-reason="store.volumeControlNote"
                :model-value="store.getState(sound.id).volume"
                @update:model-value="store.setVolume(sound.id, $event)"
              />
              <!-- Effect picker -->
              <SoundEffectPicker
                v-if="!store.directOutput"
                :model-value="store.soundEffects?.[sound.id] ?? 'none'"
                @update:model-value="store.setEffect(sound.id, sound.file_url, $event, sound.category)"
              />
              <!-- Stop -->
              <AppButton
                variant="ghost"
                size="inline-xs"
                class="shrink-0"
                tooltip="Stop"
                :icon="IconStop"
                icon-size="xs"
                @click="store.stop(sound.id)"
              />
            </div>
          </template>

          <!-- Empty state -->
          <div
            v-if="!store.hasActiveAudio && !spotifyStore.isPlaying"
            class="py-6 text-center"
          >
            <IconMute class="h-6 w-6 text-muted-foreground/40 mx-auto mb-1.5" />
            <p class="text-caption text-muted-foreground italic">No sounds playing</p>
            <RouterLink
              to="/soundboard"
              class="text-caption text-gold-400 hover:text-gold-300 transition-colors"
              @click="store.widgetOpen = false"
            >
              Open Soundboard →
            </RouterLink>
          </div>
        </div>

        <!-- Mixer — shared with the /soundboard page so the two never drift -->
        <div class="border-t border-border px-3 py-2">
          <SoundboardMixer collapsible />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, nextTick } from "vue";
import { IconClose, IconMusicNote, IconMute, IconPause, IconPlay, IconRepeat, IconRepeatOne, IconShuffle, IconSkipBack, IconSkipForward, IconStop, IconWind } from '@/lib/icons';
import AppButton from "@/components/common/AppButton.vue";
import { useSoundboardStore } from "@/stores/soundboard";
import { useSpotifyStore } from "@/stores/spotify";
import { useSounds } from "@/composables/useSounds";
import SoundEffectPicker from "./SoundEffectPicker.vue";
import VolumeSlider from "./VolumeSlider.vue";
import SoundboardMixer from "./SoundboardMixer.vue";
import CausedByChip from "./CausedByChip.vue";
import { useActiveAudioTriggers } from "@/composables/useAudioThemeTriggers";
import SpotifyErrorBanner from "./SpotifyErrorBanner.vue";

import CastButton from "./CastButton.vue";

const store = useSoundboardStore();
const { musicTrigger, triggerForPlaylist } = useActiveAudioTriggers();
const spotifyStore = useSpotifyStore();
const { data: sounds } = useSounds();

// ── Draggable position ────────────────────────────────────────────────────────

const widgetEl = ref<HTMLElement | null>(null);
const pos = ref<{ x: number; y: number } | null>(null);
const dragging = ref(false);

// The component only exists when widgetOpen is true (v-if), so onMounted
// fires exactly when the widget first appears — initialize position then.
onMounted(async () => {
  await nextTick();
  const h = widgetEl.value?.offsetHeight ?? 320;
  pos.value = {
    x: window.innerWidth - 288 - 16,
    y: window.innerHeight - h - 64,
  };
});

const posStyle = computed(() =>
  pos.value
    ? { left: `${pos.value.x}px`, top: `${pos.value.y}px` }
    : { right: "1rem", bottom: "4rem" },
);

let dragOffset = { x: 0, y: 0 };

function startDrag(e: PointerEvent) {
  if (!pos.value) return;
  e.preventDefault();
  dragging.value = true;
  document.body.style.userSelect = "none";
  dragOffset = { x: e.clientX - pos.value.x, y: e.clientY - pos.value.y };
  window.addEventListener("pointermove", onDrag);
  window.addEventListener("pointerup", stopDrag, { once: true });
}

function onDrag(e: PointerEvent) {
  if (!pos.value) return;
  const w = widgetEl.value?.offsetWidth ?? 288;
  const h = widgetEl.value?.offsetHeight ?? 320;
  pos.value = {
    x: Math.max(0, Math.min(window.innerWidth - w, e.clientX - dragOffset.x)),
    y: Math.max(0, Math.min(window.innerHeight - h, e.clientY - dragOffset.y)),
  };
}

function stopDrag() {
  dragging.value = false;
  document.body.style.userSelect = "";
  window.removeEventListener("pointermove", onDrag);
}

const playingSounds = computed(() =>
  (sounds.value ?? []).filter(
    (s) => s.source_type !== "spotify" && store.playbackStates[s.id]?.isPlaying,
  ),
);

const activeMusicTrackName = computed(() => {
  const mpl = store.activeMusicPlaylist;
  if (!mpl) return null;
  const soundId = mpl.trackSoundIds[mpl.currentIndex];
  return sounds.value?.find((s) => s.id === soundId)?.name ?? null;
});

const spotifyProgress = computed(() => {
  if (!spotifyStore.durationMs) return 0;
  return Math.min(100, (spotifyStore.positionMs / spotifyStore.durationMs) * 100);
});

function formatSpotifyTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const repeatTitle = computed(() => {
  if (spotifyStore.repeatMode === 2) return "Repeat: Track";
  if (spotifyStore.repeatMode === 1) return "Repeat: Context";
  return "Repeat: Off";
});

function cycleRepeat() {
  const next = ((spotifyStore.repeatMode + 1) % 3) as 0 | 1 | 2;
  spotifyStore.setRepeat(next);
}

function stopAll() {
  store.stopAll();
  if (spotifyStore.isPlaying) spotifyStore.pause();
}
</script>
