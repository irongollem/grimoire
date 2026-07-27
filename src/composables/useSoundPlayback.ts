import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";
import { useSoundboardStore } from "@/stores/soundboard";
import { useSpotifyStore } from "@/stores/spotify";
import type { Sound } from "@/types/sound.types";

/**
 * "Can this sound fire, and what happens if I hit it?" — for every surface that
 * fires a sound.
 *
 * A sound is played from three places now (the two card transports and the
 * command palette) and each needs the same three answers: is it the one making
 * noise, is it blocked, and what does the next press do. Duplicating that meant
 * the palette would happily offer a WebM file to a Safari user that the card
 * already knows to disable.
 *
 * Exposed twice over: as plain predicates a list can call for every row, and as
 * a reactive facade a single-sound component can bind to. The facade is built
 * from the predicates, so there is one definition of each answer.
 */

const IS_SAFARI = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

/** What the next press does — used for button titles and palette hints. */
export type PlaybackAction = "play" | "pause" | "refire";

export const ACTION_LABEL: Record<PlaybackAction, string> = {
  play: "Play",
  pause: "Pause",
  refire: "Fire again",
} as const;

/** Is this sound the one currently audible? */
export function useAudibleCheck(): (sound: Sound) => boolean {
  const soundboardStore = useSoundboardStore();
  const spotifyStore = useSpotifyStore();

  return (sound) =>
    sound.source_type === "spotify"
      ? spotifyStore.lastPlayedUrl === sound.file_url && spotifyStore.isPlaying
      : soundboardStore.getState(sound.id).isPlaying;
}

/** Why this sound cannot be fired right now, or null when it can. */
export function useBlockedCheck(): (sound: Sound) => string | null {
  const soundboardStore = useSoundboardStore();
  const spotifyStore = useSpotifyStore();

  return (sound) => {
    if (sound.source_type === "spotify") {
      return spotifyStore.isReady ? null : "Connecting to Spotify device…";
    }
    // Safari refuses WebM audio outright, so the file is not merely slow — it
    // will never play, and offering the button is a lie.
    const path = (sound.storage_path ?? sound.file_url).split("?")[0];
    if (path.endsWith(".webm") && IS_SAFARI) return "WebM — cannot play in Safari";
    if (soundboardStore.getState(sound.id).loadError) return "Failed to load";
    return null;
  };
}

/** What the next press on this sound will do. */
export function useActionCheck(): (sound: Sound) => PlaybackAction {
  const isAudible = useAudibleCheck();
  return (sound) => {
    if (!isAudible(sound)) return "play";
    return sound.category === "effects" ? "refire" : "pause";
  };
}

/**
 * Transport semantics: playing → pause, otherwise play.
 * This is what a card's play/pause button does.
 */
export function useSoundToggle(): (sound: Sound) => void {
  const soundboardStore = useSoundboardStore();
  const spotifyStore = useSpotifyStore();
  const isAudible = useAudibleCheck();
  const blockedReason = useBlockedCheck();

  return (sound) => {
    if (blockedReason(sound) !== null) return;

    if (sound.source_type === "spotify") {
      if (isAudible(sound)) spotifyStore.pause();
      else spotifyStore.play(sound.file_url);
      return;
    }

    if (isAudible(sound)) soundboardStore.pause(sound.id);
    // Category picks the bus: "effects" one-shots duck the music and ambient
    // beds under themselves, music and ambience do not.
    else soundboardStore.play(sound.id, sound.file_url, sound.category, sound.gain_trim);
  };
}

/**
 * Command-palette semantics: a one-shot effect fires again from the top rather
 * than pausing, because hitting the thunderclap twice should give you two
 * thunderclaps. Everything else toggles.
 */
export function useSoundTrigger(): (sound: Sound) => void {
  const soundboardStore = useSoundboardStore();
  const action = useActionCheck();
  const blockedReason = useBlockedCheck();
  const toggle = useSoundToggle();

  return (sound) => {
    if (blockedReason(sound) !== null) return;
    if (action(sound) === "refire" && sound.source_type !== "spotify") {
      soundboardStore.restart(sound.id, sound.file_url, sound.category, sound.gain_trim);
      return;
    }
    toggle(sound);
  };
}

export interface SoundPlayback {
  isSpotify: ComputedRef<boolean>;
  isPlaying: ComputedRef<boolean>;
  blockedReason: ComputedRef<string | null>;
  action: ComputedRef<PlaybackAction>;
  toggle: () => void;
  trigger: () => void;
  stop: () => void;
}

/** Reactive facade over the predicates above, for a component bound to one sound. */
export function useSoundPlayback(sound: MaybeRefOrGetter<Sound>): SoundPlayback {
  const soundboardStore = useSoundboardStore();
  const spotifyStore = useSpotifyStore();
  const isAudible = useAudibleCheck();
  const blocked = useBlockedCheck();
  const action = useActionCheck();
  const toggleSound = useSoundToggle();
  const triggerSound = useSoundTrigger();

  return {
    isSpotify: computed(() => toValue(sound).source_type === "spotify"),
    isPlaying: computed(() => isAudible(toValue(sound))),
    blockedReason: computed(() => blocked(toValue(sound))),
    action: computed(() => action(toValue(sound))),
    toggle: () => toggleSound(toValue(sound)),
    trigger: () => triggerSound(toValue(sound)),
    stop: () => {
      const s = toValue(sound);
      if (s.source_type === "spotify") spotifyStore.pause();
      else soundboardStore.stop(s.id);
    },
  };
}
