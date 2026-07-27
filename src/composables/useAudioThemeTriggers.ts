import { ref, onScopeDispose } from "vue";
import { useSoundboardStore } from "@/stores/soundboard";
import { useSounds } from "@/composables/useSounds";
import { usePlaylists, useFetchPlaylistTracks } from "@/composables/useSoundboardPlaylists";
import { onAudioTrigger, type AudioThemeRequest } from "@/lib/audioTriggers";
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

interface SlotOwner {
  sourceId: string;
  /** What was running in this slot before the trigger took it, to hand back. */
  previousPlaylistId: string | null;
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
  let musicOwner: SlotOwner | null = null;
  /** sourceId → the scene that source started, so a release removes only that. */
  const ambientOwned = new Map<string, string>();

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
      musicOwner = { sourceId: request.sourceId, previousPlaylistId: musicOwner?.previousPlaylistId ?? null };
      return;
    }

    // Only remember a previous playlist on the first takeover. A second trigger
    // arriving while we already own the slot must not record our own audio as
    // the thing to restore.
    const previousPlaylistId = musicOwner === null ? playingId : musicOwner.previousPlaylistId;
    musicOwner = { sourceId: request.sourceId, previousPlaylistId };

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

  /** Ambient triggers add a scene rather than taking a slot from anyone. */
  async function addScene(request: AudioThemeRequest, match: ThemeMatch): Promise<void> {
    if (ambientOwned.has(request.sourceId)) return;

    if (match.kind === "sound") {
      // A loose ambient file: nothing to stop, it simply joins the mix.
      store.play(match.sound.id, match.sound.file_url, match.sound.category, match.sound.gain_trim);
      ambientOwned.set(request.sourceId, `sound:${match.sound.id}`);
      return;
    }

    ambientOwned.set(request.sourceId, match.playlist.id);
    // playAmbientPlaylist is a no-op when this scene is already running, so a
    // DM who started it by hand keeps their own copy rather than a second one.
    await startPlaylist(match.playlist.id, "ambient", ++generation.ambient);
  }

  async function handleRelease(sourceId: string): Promise<void> {
    const owned = ambientOwned.get(sourceId);
    if (owned !== undefined) {
      ambientOwned.delete(sourceId);
      if (owned.startsWith("sound:")) store.stop(owned.slice("sound:".length));
      // By id: leaving one themed location must not silence the scenes another
      // location, or the DM, still has running.
      else store.stopAmbientPlaylist(owned);
    }

    // A release from anyone but the current owner is stale — an encounter
    // ending must not cut the music a newer one started.
    if (musicOwner === null || musicOwner.sourceId !== sourceId) return;

    const previousPlaylistId = musicOwner.previousPlaylistId;
    musicOwner = null;
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
