import { computed, type ComputedRef } from "vue";
import { useSoundboardStore } from "@/stores/soundboard";
import { useSounds } from "@/composables/soundboard/useSounds";
import { useActiveAudioTriggers, type ActiveTrigger } from "@/composables/soundboard/useAudioThemeTriggers";
import type { SoundCategory } from "@/types/sound.types";

/**
 * What is audible and why: the derivation behind the Now rail and the deck's
 * Now chips, so the two cannot disagree about what is playing.
 *
 * Slot-shaped rather than list-shaped, because that is the model: music is
 * exclusive (one entry), scenes stack, and loose sounds are whatever is audible
 * outside both slots.
 */

export interface NowMusic {
  playlistId: string;
  name: string;
  /** "???" over blank: a missing name is a real gap worth seeing. */
  trackName: string;
  /** 1-based, for display. */
  position: number;
  trackCount: number;
  trigger: ActiveTrigger | null;
  prev: () => void;
  next: () => void;
  stop: () => void;
}

export interface NowScene {
  playlistId: string;
  name: string;
  layers: number;
  trigger: ActiveTrigger | null;
  stop: () => void;
}

export interface NowLoose {
  id: string;
  name: string;
  category: SoundCategory;
  trigger: ActiveTrigger | null;
  stop: () => void;
}

export interface NowPlaying {
  music: ComputedRef<NowMusic | null>;
  scenes: ComputedRef<NowScene[]>;
  loose: ComputedRef<NowLoose[]>;
  isIdle: ComputedRef<boolean>;
}

export function useNowPlaying(): NowPlaying {
  const store = useSoundboardStore();
  const { triggerForPlaylist, triggerForSound, musicTrigger } = useActiveAudioTriggers();
  const { data: sounds } = useSounds();

  const music = computed<NowMusic | null>(() => {
    const running = store.activeMusicPlaylist;
    if (running === null) return null;
    const soundId = running.trackSoundIds[running.currentIndex];
    const trackName = soundId === undefined ? "" : (running.soundNames[soundId] ?? "???");
    return {
      playlistId: running.playlistId,
      name: running.playlistName,
      trackName,
      position: running.currentIndex + 1,
      trackCount: running.trackSoundIds.length,
      trigger: musicTrigger.value,
      prev: () => store.musicPlaylistPrev(),
      next: () => store.musicPlaylistNext(),
      stop: () => store.stopMusicPlaylist(),
    };
  });

  const scenes = computed<NowScene[]>(() =>
    store.activeAmbientPlaylists.map((scene) => ({
      playlistId: scene.playlistId,
      name: scene.playlistName,
      layers: scene.soundIds.length,
      trigger: triggerForPlaylist(scene.playlistId),
      // Scoped by id: pulling the rain must not close the tavern.
      stop: () => store.stopAmbientPlaylist(scene.playlistId),
    })),
  );

  // Sounds fired straight from the grid or the palette sit in no slot. A rail
  // that read only the two slots said "nothing audible" over a bed a pad had
  // started, which is a lie.
  const loose = computed<NowLoose[]>(() => {
    const claimed = new Set<string>();
    const running = store.activeMusicPlaylist;
    if (running !== null) running.trackSoundIds.forEach((id) => claimed.add(id));
    store.activeAmbientPlaylists.forEach((scene) => scene.soundIds.forEach((id) => claimed.add(id)));

    return Object.entries(store.playbackStates)
      .filter(([id, state]) => state.isPlaying && !claimed.has(id))
      .map(([id]) => {
        const match = sounds.value?.find((s) => s.id === id);
        return {
          id,
          name: match === undefined ? "???" : match.name,
          category: match === undefined ? "effects" : match.category,
          trigger: triggerForSound(id),
          stop: () => store.stop(id),
        };
      });
  });

  const isIdle = computed(
    () => music.value === null && scenes.value.length === 0 && loose.value.length === 0,
  );

  return { music, scenes, loose, isIdle };
}
