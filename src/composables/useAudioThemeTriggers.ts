import { ref, computed, onScopeDispose } from "vue";
import { useSoundboardStore } from "@/stores/soundboard";
import { useSounds } from "@/composables/useSounds";
import { usePlaylists, useFetchPlaylistTracks } from "@/composables/useSoundboardPlaylists";
import { onAudioTrigger, type AudioThemeRequest, type AudioTriggerKind } from "@/lib/audioTriggers";
import { resolveAudioTheme, type AudioSlot, type ThemeMatch } from "@/lib/audioThemes";
import { getAudioTriggersEnabled, setAudioTriggersEnabled } from "@/lib/audioTriggerPrefs";
import type { Sound, SoundboardPlaylist } from "@/types/sound.types";

/**
 * The soundboard's ear on the campaign. Mounted once, in DefaultLayout.
 *
 * One rule governs everything here: **a trigger that finds no match does
 * nothing at all.** It never stops, fades, or replaces what is already
 * playing. Silence the DM chose is always better than silence we chose, and a
 * feature that hijacks the room the first time it guesses wrong gets switched
 * off and never switched back on.
 */

/** Module-level so the toggle reads the same in every component that shows it. */
const enabled = ref(getAudioTriggersEnabled());

export function useAudioTriggerPrefs() {
  function setEnabled(next: boolean): void {
    enabled.value = next;
    setAudioTriggersEnabled(next);
  }
  return { audioTriggersEnabled: enabled, setAudioTriggersEnabled: setEnabled };
}

/**
 * A trigger that is currently responsible for something audible.
 *
 * This is what answers "why is this playing". The label arrives on the request
 * and used to be discarded the moment the audio started, which left the DM
 * with music they could not explain and no way to undo except by finding the
 * encounter again. Keeping a snapshot on the slot is what makes
 * `CausedByChip` possible.
 */
export interface ActiveTrigger {
  sourceId: string;
  label: string;
  kind: AudioTriggerKind;
  slot: AudioSlot;
  /** What it started: a playlist id, or `sound:<id>` for a loose file. */
  target: string;
}

interface MusicOwnership extends ActiveTrigger {
  /** What was running in this slot before the trigger took it, to hand back. */
  previousPlaylistId: string | null;
}

/**
 * Module-level because the consumer is mounted once, in `DefaultLayout`, and
 * every surface that wants to show the chip is somewhere else entirely. The
 * `enabled` ref above is module-level for the same reason.
 */
const musicOwner = ref<MusicOwnership | null>(null);
/** Scenes stack, so ambient ownership is a list rather than a single slot. */
const ambientOwners = ref<ActiveTrigger[]>([]);

/** Key for a loose sound standing in for a scene. */
function soundTarget(soundId: string): string {
  return `sound:${soundId}`;
}

/**
 * Read-only view of what the campaign is currently driving, for the UI.
 *
 * Separate from `useAudioThemeTriggers` so a component can ask the question
 * without accidentally mounting a second consumer of the bus.
 */
export function useActiveAudioTriggers() {
  const musicTrigger = computed<ActiveTrigger | null>(() => musicOwner.value);
  const ambientTriggers = computed<ActiveTrigger[]>(() => ambientOwners.value);

  function triggerForPlaylist(playlistId: string): ActiveTrigger | null {
    if (musicOwner.value !== null && musicOwner.value.target === playlistId) return musicOwner.value;
    const scene = ambientOwners.value.find((owner) => owner.target === playlistId);
    return scene === undefined ? null : scene;
  }

  function triggerForSound(soundId: string): ActiveTrigger | null {
    const target = soundTarget(soundId);
    if (musicOwner.value !== null && musicOwner.value.target === target) return musicOwner.value;
    const scene = ambientOwners.value.find((owner) => owner.target === target);
    return scene === undefined ? null : scene;
  }

  return { musicTrigger, ambientTriggers, triggerForPlaylist, triggerForSound };
}

export function useAudioThemeTriggers(): void {
  const store = useSoundboardStore();
  const { data: sounds } = useSounds();
  const { data: playlists } = usePlaylists();
  const fetchTracks = useFetchPlaylistTracks();

  /**
   * The two slots behave differently on purpose.
   *
   * Music is exclusive — one track at a time — so a trigger takes the slot and
   * hands it back on release. Scenes stack, so an ambient trigger simply adds
   * its own and removes its own: a location has no business stopping the scene
   * a different location started, and the party can be in a dungeon and in a
   * storm at the same time.
   */
  // Ownership itself lives at module scope (above) so the UI can read it; the
  // rules for changing it stay here, where the bus is handled.

  // Track resolution is async, so a second trigger landing mid-fetch would
  // otherwise let the slower of the two win whichever order they started in.
  const generation: Record<AudioSlot, number> = { music: 0, ambient: 0 };

  function currentPlaylists(): SoundboardPlaylist[] {
    return playlists.value === undefined ? [] : playlists.value;
  }

  function currentSounds(): Sound[] {
    return sounds.value === undefined ? [] : sounds.value;
  }

  async function startPlaylist(id: string, slot: AudioSlot, gen: number): Promise<void> {
    const playlist = currentPlaylists().find((p) => p.id === id);
    if (!playlist) return;
    const tracks = await fetchTracks(playlist.id);
    if (gen !== generation[slot] || tracks.length === 0) return;
    store.playPlaylist(playlist, tracks);
  }

  async function handleRequest(request: AudioThemeRequest): Promise<void> {
    if (!enabled.value) return;

    const { slot } = request;
    const match = resolveAudioTheme(request.theme, slot, currentPlaylists(), currentSounds());
    if (match === null) return;

    if (slot === "ambient") {
      await addScene(request, match);
      return;
    }

    const playingId = store.activeMusicPlaylistId();

    // Already playing exactly what was asked for: take ownership so the release
    // still works, but do not restart it mid-bar.
    if (match.kind === "playlist" && playingId === match.playlist.id) {
      musicOwner.value = {
        ...ownershipFrom(request, match.playlist.id),
        previousPlaylistId: musicOwner.value === null ? null : musicOwner.value.previousPlaylistId,
      };
      return;
    }

    // Only remember a previous playlist on the first takeover. A second trigger
    // arriving while we already own the slot must not record our own audio as
    // the thing to restore.
    const previousPlaylistId =
      musicOwner.value === null ? playingId : musicOwner.value.previousPlaylistId;
    const target =
      match.kind === "playlist" ? match.playlist.id : soundTarget(match.sound.id);
    musicOwner.value = { ...ownershipFrom(request, target), previousPlaylistId };

    const gen = ++generation.music;

    if (match.kind === "playlist") {
      await startPlaylist(match.playlist.id, "music", gen);
      return;
    }

    // No playlist answers this theme, so a single file stands in. Stop whatever
    // playlist held the slot first, or the two play over each other.
    if (playingId !== null) store.stopPlaylist("music");
    if (gen !== generation.music) return;
    const { sound } = match;
    store.play(sound.id, sound.file_url, sound.category, sound.gain_trim);
  }

  /** The public half of ownership — what the chip reads. */
  function ownershipFrom(request: AudioThemeRequest, target: string): ActiveTrigger {
    return {
      sourceId: request.sourceId,
      label: request.label,
      kind: request.kind,
      slot: request.slot,
      target,
    };
  }

  /** Ambient triggers add a scene rather than taking a slot from anyone. */
  async function addScene(request: AudioThemeRequest, match: ThemeMatch): Promise<void> {
    if (ambientOwners.value.some((owner) => owner.sourceId === request.sourceId)) return;

    if (match.kind === "sound") {
      // A loose ambient file: nothing to stop, it simply joins the mix.
      store.play(match.sound.id, match.sound.file_url, match.sound.category, match.sound.gain_trim);
      ambientOwners.value = [
        ...ambientOwners.value,
        ownershipFrom(request, soundTarget(match.sound.id)),
      ];
      return;
    }

    ambientOwners.value = [...ambientOwners.value, ownershipFrom(request, match.playlist.id)];
    // playAmbientPlaylist is a no-op when this scene is already running, so a
    // DM who started it by hand keeps their own copy rather than a second one.
    await startPlaylist(match.playlist.id, "ambient", ++generation.ambient);
  }

  async function handleRelease(sourceId: string): Promise<void> {
    const owned = ambientOwners.value.find((owner) => owner.sourceId === sourceId);
    if (owned !== undefined) {
      ambientOwners.value = ambientOwners.value.filter((owner) => owner.sourceId !== sourceId);
      if (owned.target.startsWith("sound:")) store.stop(owned.target.slice("sound:".length));
      // By id: leaving one themed location must not silence the scenes another
      // location, or the DM, still has running.
      else store.stopAmbientPlaylist(owned.target);
    }

    // A release from anyone but the current owner is stale — an encounter
    // ending must not cut the music a newer one started.
    if (musicOwner.value === null || musicOwner.value.sourceId !== sourceId) return;

    const previousPlaylistId = musicOwner.value.previousPlaylistId;
    musicOwner.value = null;
    const gen = ++generation.music;

    if (previousPlaylistId === null) {
      store.stopPlaylist("music");
      return;
    }
    // Hand the slot back to whatever the DM had running. It restarts from the
    // top rather than resuming its old position, which is the honest cost of
    // not holding a paused playlist open for the length of a fight.
    await startPlaylist(previousPlaylistId, "music", gen);
  }

  const off = onAudioTrigger((event) => {
    if (event.type === "request") void handleRequest(event.request);
    else void handleRelease(event.sourceId);
  });

  onScopeDispose(off);
}
