import { ref, onScopeDispose } from "vue";
import { useSoundboardStore } from "@/stores/soundboard";
import { useSounds } from "@/composables/useSounds";
import { usePlaylists, useFetchPlaylistTracks } from "@/composables/useSoundboardPlaylists";
import { onAudioTrigger, type AudioThemeRequest } from "@/lib/audioTriggers";
import { resolveAudioTheme, type AudioSlot } from "@/lib/audioThemes";
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

  const owners: Record<AudioSlot, SlotOwner | null> = { music: null, ambient: null };

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

    const playingId = store.activePlaylistId(slot);

    // Already playing exactly what was asked for: take ownership so the release
    // still works, but do not restart it mid-bar.
    if (match.kind === "playlist" && playingId === match.playlist.id) {
      owners[slot] = { sourceId: request.sourceId, previousPlaylistId: owners[slot]?.previousPlaylistId ?? null };
      return;
    }

    // Only remember a previous playlist on the first takeover. A second trigger
    // arriving while we already own the slot must not record our own audio as
    // the thing to restore.
    const previousPlaylistId = owners[slot] === null ? playingId : owners[slot].previousPlaylistId;
    owners[slot] = { sourceId: request.sourceId, previousPlaylistId };

    const gen = ++generation[slot];

    if (match.kind === "playlist") {
      await startPlaylist(match.playlist.id, slot, gen);
      return;
    }

    // No playlist answers this theme, so a single file stands in. Stop whatever
    // playlist held the slot first, or the two play over each other.
    if (playingId !== null) store.stopPlaylist(slot);
    if (gen !== generation[slot]) return;
    const { sound } = match;
    store.play(sound.id, sound.file_url, sound.category, sound.gain_trim);
  }

  async function handleRelease(sourceId: string): Promise<void> {
    for (const slot of ["music", "ambient"] as const) {
      const owner = owners[slot];
      // A release from anyone but the current owner is stale — an encounter
      // ending must not cut the music a newer one started.
      if (owner === null || owner.sourceId !== sourceId) continue;

      owners[slot] = null;
      const gen = ++generation[slot];

      if (owner.previousPlaylistId === null) {
        store.stopPlaylist(slot);
        continue;
      }
      // Hand the slot back to whatever the DM had running. It restarts from the
      // top rather than resuming its old position, which is the honest cost of
      // not holding a paused playlist open for the length of a fight.
      await startPlaylist(owner.previousPlaylistId, slot, gen);
    }
  }

  const off = onAudioTrigger((event) => {
    if (event.type === "request") void handleRequest(event.request);
    else void handleRelease(event.sourceId);
  });

  onScopeDispose(off);
}
