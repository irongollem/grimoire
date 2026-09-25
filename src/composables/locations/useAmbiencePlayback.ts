import { computed } from "vue";
import { requestAudioCue, releaseAudioTheme, type AudioCueTarget } from "@/lib/audio/audioTriggers";
import { resolveAudioTheme } from "@/lib/audio/audioThemes";
import { useActiveAudioTriggers } from "@/composables/soundboard/useAudioThemeTriggers";
import { usePlaylists } from "@/composables/soundboard/useSoundboardPlaylists";
import { useSounds } from "@/composables/soundboard/useSounds";

/**
 * A place's ambience, played by hand from its page (#912 follow-up).
 *
 * Opening a location never starts its sound — it used to, and a DM saving an
 * image found the Sugarwell anthem playing. Instead the page offers Play, and
 * what it starts keeps going after the DM moves on to notes, an NPC, the quest:
 * the room is still where everything is happening. It stops when the DM
 * presses Stop, on the page or in the floating player, or puts on a different
 * place's sound, which replaces it rather than layering two places.
 *
 * There is no state here. What is playing is read from the trigger bus's own
 * ownership list, so the page and the floating player can never disagree, and
 * a scene stopped in the player reads as stopped on the page.
 *
 * It fires a cue, not a theme request: a theme request is *guessed* audio and
 * obeys the DM's automatic-triggers switch, while this is a button the DM
 * pressed on purpose. Its own `ambience:` prefix keeps it apart from
 * `usePartyAmbience`'s `party:` requests, so neither releases the other.
 */
const SOURCE_PREFIX = "ambience:";

export interface AmbienceToPlay {
  /** The location whose own theme answers — itself, or the ancestor it inherits from. */
  themeOwnerId: string;
  theme: string;
  /** Shown as the scene's label in the player. */
  label: string;
}

export function useAmbiencePlayback() {
  const { ambientTriggers } = useActiveAudioTriggers();
  const { data: playlists } = usePlaylists();
  const { data: sounds } = useSounds();

  const playing = computed(() => ambientTriggers.value.find((t) => t.sourceId.startsWith(SOURCE_PREFIX)) ?? null);

  /** What a theme would play, or null when nothing on the soundboard answers it yet. */
  function targetFor(theme: string): AudioCueTarget | null {
    if (playlists.value === undefined || sounds.value === undefined) return null;
    const match = resolveAudioTheme(theme, "ambient", playlists.value, sounds.value);
    if (match === null) return null;
    return match.kind === "playlist" ? { playlistId: match.playlist.id } : { soundId: match.sound.id };
  }

  function isPlaying(themeOwnerId: string): boolean {
    return playing.value?.sourceId === `${SOURCE_PREFIX}${themeOwnerId}`;
  }

  function play(next: AmbienceToPlay): void {
    const target = targetFor(next.theme);
    if (target === null) return;
    const previous = playing.value;
    // Start first, release second — the same crossover `usePartyAmbience`
    // uses, so moving from one place's sound to another's never cuts to silence.
    requestAudioCue({
      sourceId: `${SOURCE_PREFIX}${next.themeOwnerId}`,
      slot: "ambient",
      label: next.label,
      kind: "location",
      target,
    });
    if (previous !== null && previous.sourceId !== `${SOURCE_PREFIX}${next.themeOwnerId}`) {
      releaseAudioTheme(previous.sourceId);
    }
  }

  function stop(): void {
    if (playing.value !== null) releaseAudioTheme(playing.value.sourceId);
  }

  return { targetFor, isPlaying, play, stop };
}
