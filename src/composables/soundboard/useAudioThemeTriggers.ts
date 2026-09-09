import { ref, computed, watch, onScopeDispose } from "vue";
import { useSoundboardStore } from "@/stores/soundboard";
import { useSounds } from "@/composables/soundboard/useSounds";
import { usePlaylists, useFetchPlaylistTracks } from "@/composables/soundboard/useSoundboardPlaylists";
import { useSoundTrigger } from "@/composables/soundboard/useSoundPlayback";
import {
  onAudioTrigger,
  type AudioThemeRequest,
  type AudioCueRequest,
  type AudioTriggerKind,
} from "@/lib/audio/audioTriggers";
import { resolveAudioTheme, type AudioSlot, type ThemeMatch } from "@/lib/audio/audioThemes";
import { getAudioTriggersEnabled, setAudioTriggersEnabled } from "@/lib/audio/audioTriggerPrefs";
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

/**
 * Module-level because the consumer is mounted once, in `DefaultLayout`, and
 * every surface that wants to show the chip is somewhere else entirely. The
 * `enabled` ref above is module-level for the same reason.
 *
 * Music is a stack, not a single slot. Frame 14's ranking — a beat's cue
 * ducks a live encounter's theme, which is *held, not stopped*, which sits
 * over the room's own ambience — means a second trigger taking the slot must
 * not erase the first: it goes on top, and releasing it uncovers whichever
 * trigger (or none) was underneath. `musicFloor` is the one thing that is not
 * a trigger — whatever the DM had running by hand before anything on the
 * stack took over — captured once, when the stack first stops being empty.
 */
const musicStack = ref<ActiveTrigger[]>([]);
const musicFloor = ref<string | null>(null);
/** The audible one — always the top of the stack, or nobody. */
const musicOwner = computed<ActiveTrigger | null>(() => musicStack.value.at(-1) ?? null);
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
  // A cue already names an exact sound row, so firing it reuses the very
  // function every playback button in the app calls — refire-as-effect,
  // Safari's webm block, Spotify's own play path all stay exactly as they are.
  const fireSound = useSoundTrigger();

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

  /** Restart whatever a music-stack entry points at — a playlist, or a bare file standing in for one. */
  async function resumeMusicTarget(target: string, gen: number): Promise<void> {
    if (target.startsWith("sound:")) {
      const sound = currentSounds().find((s) => s.id === target.slice("sound:".length));
      if (sound === undefined || gen !== generation.music) return;
      store.play(sound.id, sound.file_url, sound.category, sound.gain_trim);
      return;
    }
    await startPlaylist(target, "music", gen);
  }

  /**
   * Take (or refresh) this source's place at the top of the music stack.
   *
   * A second request from the same source brings its own entry to the top
   * rather than stacking a second layer on itself — a re-request means "bring
   * mine to the front", not "add another one of me". Without this, a source
   * held lower in the stack (something newer took the slot over it) that asks
   * again ended up with two entries: the old one buried where it was, and a
   * new one on top, so releasing it later found the *older* one first and
   * reported "was-lower" for what was actually the audible copy — the release
   * silently did nothing. Removing any existing entry before pushing keeps
   * one source to at most one entry, always. The floor — what to hand back to
   * once the whole stack empties — is captured only the first time anything
   * takes the slot, from whatever the DM had running by hand.
   */
  function claimMusicSlot(ownership: ActiveTrigger): void {
    const stack = musicStack.value;
    if (stack.length === 0) musicFloor.value = store.activeMusicPlaylistId();
    const withoutSource = stack.filter((owner) => owner.sourceId !== ownership.sourceId);
    musicStack.value = [...withoutSource, ownership];
  }

  /**
   * Drop a source from the music stack. Tells the caller whether it was audible.
   *
   * Searches from the top down so that if a duplicate ever slipped in despite
   * `claimMusicSlot`'s dedupe, a release still resolves against the newest
   * (audible, or about-to-be-audible) copy rather than a stale one buried
   * lower.
   */
  function removeFromMusicStack(sourceId: string): "not-found" | "was-top" | "was-lower" {
    const stack = musicStack.value;
    let index = -1;
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].sourceId === sourceId) {
        index = i;
        break;
      }
    }
    if (index === -1) return "not-found";
    const wasTop = index === stack.length - 1;
    musicStack.value = stack.filter((_, i) => i !== index);
    return wasTop ? "was-top" : "was-lower";
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

    if (match.kind === "playlist") {
      // Already playing exactly what was asked for: take ownership so the
      // release still works, but do not restart it mid-bar.
      const alreadyPlaying = playingId === match.playlist.id;
      claimMusicSlot(ownershipFrom(request, match.playlist.id));
      if (alreadyPlaying) return;
      const gen = ++generation.music;
      await startPlaylist(match.playlist.id, "music", gen);
      return;
    }

    // No playlist answers this theme, so a single file stands in. Stop whatever
    // playlist held the slot first, or the two play over each other.
    claimMusicSlot(ownershipFrom(request, soundTarget(match.sound.id)));
    const gen = ++generation.music;
    if (playingId !== null) store.stopPlaylist("music");
    if (gen !== generation.music) return;
    const { sound } = match;
    store.play(sound.id, sound.file_url, sound.category, sound.gain_trim);
  }

  /**
   * A beat's cue is already resolved — an exact playlist or sound id, never a
   * label to match — so there is no `resolveAudioTheme` step here. It also
   * ignores the DM's automatic-trigger toggle: that switch exists to stop
   * *guessed* audio from hijacking the room, and a cue is a button the DM
   * pressed on purpose.
   */
  async function handleCue(request: AudioCueRequest): Promise<void> {
    const { target } = request;

    if ("soundId" in target) {
      await fireSoundCue(request, target.soundId);
      return;
    }

    const playlist = currentPlaylists().find((p) => p.id === target.playlistId);
    // The attachment's id no longer resolves to a real row — same rule as an
    // unmatched theme: do nothing rather than guess.
    if (playlist === undefined) return;

    if (request.slot === "ambient") {
      if (ambientOwners.value.some((owner) => owner.sourceId === request.sourceId)) return;
      ambientOwners.value = [...ambientOwners.value, ownershipFrom(request, playlist.id)];
      await startPlaylist(playlist.id, "ambient", ++generation.ambient);
      return;
    }

    // Music-slot cue: the same exclusive takeover an encounter theme gets, so
    // releasing it hands the slot back — "ducks the others". If an encounter's
    // theme already holds the slot, that theme is pushed underneath rather
    // than displaced, so it is what release hands back to — "held, not
    // stopped", not "gone".
    const playingId = store.activeMusicPlaylistId();
    const alreadyPlaying = playingId === playlist.id;
    claimMusicSlot(ownershipFrom(request, playlist.id));
    if (alreadyPlaying) return;
    const gen = ++generation.music;
    await startPlaylist(playlist.id, "music", gen);
  }

  /**
   * A bare-sound cue never contests the exclusive slot — it fires exactly as
   * the cockpit's own button would, and joins the ambient stack purely so the
   * chip and "is this active" queries have something to point at.
   *
   * It is a short-lived owner: nothing is waiting for it to let go, so instead
   * of requiring an explicit release it lets go the moment the sound itself
   * goes quiet (see `watchSoundEnd`).
   */
  async function fireSoundCue(request: AudioCueRequest, soundId: string): Promise<void> {
    const sound = currentSounds().find((s) => s.id === soundId);
    if (sound === undefined) return;
    fireSound(sound);
    if (ambientOwners.value.some((owner) => owner.sourceId === request.sourceId)) return;
    ambientOwners.value = [...ambientOwners.value, ownershipFrom(request, soundTarget(soundId))];
    watchSoundEnd(request.sourceId, soundId);
  }

  /**
   * The store flips a sound's `isPlaying` false both when the clip ends on its
   * own and when the DM pauses it by hand — either way, ownership should let
   * go rather than sit there claiming a cue that made no sound. A
   * Spotify-sourced sound has no such signal here (its state lives in
   * `useSpotifyStore`, never in this store's `playbackStates`), so those
   * release only on an explicit stop or on leaving the beat.
   */
  function watchSoundEnd(sourceId: string, soundId: string): void {
    const stopWatching = watch(
      () => store.getState(soundId).isPlaying,
      (isPlaying) => {
        if (isPlaying) return;
        stopWatching();
        void handleRelease(sourceId);
      },
    );
  }

  /** The public half of ownership — what the chip reads. */
  function ownershipFrom(request: AudioThemeRequest | AudioCueRequest, target: string): ActiveTrigger {
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

    // A release from anyone but the current top is either stale (an encounter
    // ending must not cut the music a newer one started) or a held layer that
    // was never audible in the first place — neither changes what plays now.
    const removal = removeFromMusicStack(sourceId);
    if (removal === "not-found" || removal === "was-lower") return;

    const gen = ++generation.music;
    const newTop = musicStack.value.at(-1);

    if (newTop === undefined) {
      const floor = musicFloor.value;
      musicFloor.value = null;
      if (floor === null) {
        store.stopPlaylist("music");
        return;
      }
      // Hand the slot back to whatever the DM had running. It restarts from the
      // top rather than resuming its old position, which is the honest cost of
      // not holding a paused playlist open for the length of a fight.
      await startPlaylist(floor, "music", gen);
      return;
    }

    // Something was still waiting underneath — held, not stopped. Bring it back.
    await resumeMusicTarget(newTop.target, gen);
  }

  const off = onAudioTrigger((event) => {
    if (event.type === "request") void handleRequest(event.request);
    else if (event.type === "cue") void handleCue(event.request);
    else void handleRelease(event.sourceId);
  });

  onScopeDispose(off);
}
