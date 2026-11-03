/**
 * The deck's reads (#1136): is a pad audible, looping, soloed, how far along,
 * what plays next. Reads the store's own playback state rather than keeping a
 * copy, so a pad a trigger started lights up like any other.
 */

import type { Ref } from "vue";
import { effectiveLoop } from "@/lib/audio/deck/deckModel";
import { useBlockedCheck } from "@/composables/soundboard/useSoundPlayback";
import type { DeckPadInfo } from "@/composables/soundboard/useDeckResolved";
import { useSoundboardStore } from "@/stores/soundboard";
import { useSpotifyStore } from "@/stores/spotify";
import type { Sound, SoundboardPad } from "@/types/sound.types";

export interface DeckReadoutState {
  /** The take each pad plays next. */
  cursors: Readonly<Ref<Record<string, number>>>;
  /** Levels being dragged, shown until the saved value arrives. */
  volumeOverrides: Readonly<Ref<Record<string, number>>>;
}

export function useDeckReadout({ cursors, volumeOverrides }: DeckReadoutState) {
  const store = useSoundboardStore();
  const spotify = useSpotifyStore();
  const blockedReason = useBlockedCheck();

  function soundPlaying(sound: Sound): boolean {
    if (sound.source_type === "spotify") return spotify.lastPlayedUrl === sound.file_url && spotify.isPlaying;
    return store.playbackStates[sound.id]?.isPlaying === true;
  }

  function isAudible(info: DeckPadInfo): boolean {
    if (info.kind === "sound") return info.sounds.some(soundPlaying);
    const playlist = info.playlist;
    if (!playlist) return false;
    return store.isPlaylistActive(playlist.id) && !store.isPlaylistPaused(playlist.id);
  }

  function soundLooping(sound: Sound): boolean {
    if (sound.source_type === "spotify") return spotify.lastPlayedUrl === sound.file_url && spotify.repeatMode === 2;
    return store.playbackStates[sound.id]?.isLooping === true || store.isLooping(sound.id);
  }

  /** Whether the pad loops now if it is playing, else whether it will when pressed. */
  function padLoops(info: DeckPadInfo): boolean {
    if (info.kind === "sound") {
      const playing = info.sounds.filter(soundPlaying);
      if (playing.length > 0) return playing.some(soundLooping);
    }
    return effectiveLoop(info.pad, info.category, info.kind);
  }

  /** Sound ids a pad stands for: for Solo, and for who is the soloed one. */
  function padSoundIds(info: DeckPadInfo): string[] {
    if (info.kind === "sound") return info.sounds.map((sound) => sound.id);
    const playlist = info.playlist;
    if (!playlist) return [];
    if (info.kind === "scene") {
      const scene = store.activeAmbientPlaylists.find((s) => s.playlistId === playlist.id);
      return scene ? [...scene.soundIds] : [];
    }
    const music = store.activeMusicPlaylist;
    if (music && music.playlistId === playlist.id) {
      const current = music.trackSoundIds[music.currentIndex];
      return current === undefined ? [] : [current];
    }
    return [];
  }

  function isSoloed(info: DeckPadInfo): boolean {
    const solo = store.soloIds;
    if (solo === null) return false;
    const ids = padSoundIds(info);
    return ids.length > 0 && ids.every((id) => solo.includes(id));
  }

  function progressOf(info: DeckPadInfo): number {
    let soundId: string | undefined;
    if (info.kind === "sound") {
      soundId = info.sounds.find((s) => s.source_type !== "spotify" && soundPlaying(s))?.id;
    } else if (info.kind === "playlist" && info.playlist) {
      const music = store.activeMusicPlaylist;
      if (music && music.playlistId === info.playlist.id) soundId = music.trackSoundIds[music.currentIndex];
    }
    if (soundId === undefined) return 0;
    const state = store.playbackStates[soundId];
    if (!state || state.duration <= 0) return 0;
    return Math.min(1, Math.max(0, state.currentTime / state.duration));
  }

  function volumeOf(pad: SoundboardPad): number {
    const dragged = volumeOverrides.value[pad.id];
    return dragged === undefined ? pad.volume : dragged;
  }

  /** The sound a press would play next. */
  function nextSound(info: DeckPadInfo): Sound | null {
    const count = info.sounds.length;
    if (count === 0) return null;
    const cursor = cursors.value[info.pad.id];
    return info.sounds[(cursor === undefined ? 0 : cursor) % count] ?? null;
  }

  function blockedFor(info: DeckPadInfo): string | null {
    if (info.kind !== "sound") return null;
    const sound = nextSound(info);
    return sound ? blockedReason(sound) : null;
  }

  return {
    soundPlaying,
    isAudible,
    padLoops,
    padSoundIds,
    isSoloed,
    progressOf,
    volumeOf,
    nextSound,
    blockedFor,
  };
}

export type DeckReadout = ReturnType<typeof useDeckReadout>;
