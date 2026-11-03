/**
 * The deck controller (#1136): the one implementation of the deck protocol.
 *
 * Every surface (the dock, the /soundboard builder, the keyboard, a Launchpad)
 * sends `DeckAction`s into `dispatch` and draws from `snapshot`. This is where a
 * press becomes sound, so what a pad does cannot differ between the screen and
 * the hardware. It is a shared singleton: three consumers mounted in different
 * places must see one held tool, one set of fading lights and one round-robin
 * cursor per pad.
 *
 * It reads the store's own playback state rather than keeping a copy, so a pad
 * a trigger started (an encounter, a location) lights up like any other.
 */

import { computed, effectScope, onScopeDispose, ref, shallowRef, watch, type ComputedRef, type Ref } from "vue";
import { useStorage } from "@vueuse/core";
import { safeLocalStorage } from "@/lib/safeLocalStorage";
import { useSoundboardStore } from "@/stores/soundboard";
import { useSpotifyStore } from "@/stores/spotify";
import { useSoundboardUiStore } from "@/stores/ui/soundboard";
import { useDeckPads, useUpdatePad } from "@/composables/soundboard/useDeckPads";
import { useSoundboardPages } from "@/composables/soundboard/useSoundboardPages";
import { useSounds } from "@/composables/soundboard/useSounds";
import {
  useFetchPlaylistTracks,
  usePlaylists,
  usePlaylistsTracks,
} from "@/composables/soundboard/useSoundboardPlaylists";
import { useBlockedCheck } from "@/composables/soundboard/useSoundPlayback";
import { useAudioSharing } from "@/composables/soundboard/useAudioSharing";
import {
  DEFAULT_LANES,
  effectiveFades,
  effectiveLaunchMode,
  effectiveLoop,
  isDefaultLaunchMode,
  laneCategory,
  nextTakeIndex,
  padAt,
  padCategory,
  padKind,
  rowsForPage,
  takeVariation,
  topRowKey,
  velocityGain,
  type VelocityCurve,
} from "@/lib/audio/deck/deckModel";
import {
  DECK_LANES,
  type DeckAction,
  type DeckCellView,
  type DeckLaneView,
  type DeckLight,
  type DeckPadKind,
  type DeckSnapshot,
  type DeckTool,
} from "@/lib/audio/deck/deckSurface";
import type { PlayOptions } from "@/stores/soundboard";
import type {
  PlaylistTrackWithSound,
  Sound,
  SoundCategory,
  SoundboardPad,
  SoundboardPadWithTakes,
  SoundboardPlaylist,
} from "@/types/sound.types";

/** Length of the Fade tool's fade, and of Fade all. */
export const FADE_TOOL_MS = 3000;
/** The Stop tool's short fade, so a cut does not click. */
export const STOP_TOOL_MS = 60;
/** A released Gate pad never fades faster than this, so letting go does not click. */
export const GATE_MIN_RELEASE_MS = 80;
/** How long a dragged pad volume waits before it is written. */
export const VOLUME_SAVE_MS = 400;

const SPOTIFY_SHARING_NOTE = "Spotify: this device only";

/** A pad with everything the deck derives from it, resolved once. */
export interface DeckPadInfo {
  pad: SoundboardPadWithTakes;
  kind: DeckPadKind;
  category: SoundCategory;
  /** The playlist a scene or music pad plays; null for a sound pad. */
  playlist: SoundboardPlaylist | null;
  /** A sound pad's takes as sounds, in order; a take whose sound is not loaded is left out. */
  sounds: Sound[];
}

export interface DeckController {
  snapshot: ComputedRef<DeckSnapshot>;
  dispatch(action: DeckAction): void;
  /** Set by the Edit tool; the dock and the builder watch it and clear it once consumed. */
  editRequest: Readonly<Ref<{ padId: string } | null>>;
  clearEditRequest(): void;
  velocityCurve: ComputedRef<VelocityCurve>;
  setVelocityCurve(curve: VelocityCurve): void;
  /** The pads on the page showing, with their resolved kind and category. */
  pagePads: ComputedRef<readonly DeckPadInfo[]>;
  /** The id of the page showing; null while there are none. */
  activePageId: ComputedRef<string | null>;
}

const CURVES: readonly VelocityCurve[] = ["gentle", "even", "punchy"];

function isCurve(value: string): value is VelocityCurve {
  return CURVES.some((curve) => curve === value);
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function createDeck(): DeckController {
  const store = useSoundboardStore();
  const spotify = useSpotifyStore();
  const ui = useSoundboardUiStore();
  const padsQuery = useDeckPads();
  const pagesQuery = useSoundboardPages();
  const playlistsQuery = usePlaylists();
  const soundsQuery = useSounds();
  const updatePad = useUpdatePad();
  const fetchTracks = useFetchPlaylistTracks();
  const blockedReason = useBlockedCheck();
  const sharing = useAudioSharing();

  // ── Preferences ──────────────────────────────────────────────────────────

  const storedCurve = useStorage<string>("grimoire_deck_velocity_curve", "even", safeLocalStorage());
  const velocityCurve = computed<VelocityCurve>(() => (isCurve(storedCurve.value) ? storedCurve.value : "even"));
  function setVelocityCurve(curve: VelocityCurve) {
    storedCurve.value = curve;
  }

  // ── What is on the deck ──────────────────────────────────────────────────

  const pages = computed(() => (pagesQuery.data.value === undefined ? [] : pagesQuery.data.value));

  const activePage = computed(() => {
    const wanted = ui.soundboardActivePage;
    const found = wanted === null ? undefined : pages.value.find((page) => page.id === wanted);
    return found ?? pages.value[0] ?? null;
  });

  const soundsById = computed(() => {
    const map = new Map<string, Sound>();
    if (soundsQuery.data.value) for (const sound of soundsQuery.data.value) map.set(sound.id, sound);
    return map;
  });

  const playlistsById = computed(() => {
    const map = new Map<string, SoundboardPlaylist>();
    if (playlistsQuery.data.value) for (const playlist of playlistsQuery.data.value) map.set(playlist.id, playlist);
    return map;
  });

  /** Every pad on every page, resolved. A pad whose playlist is gone is left out: it reads as empty. */
  const resolved = computed(() => {
    const map = new Map<string, DeckPadInfo>();
    if (!padsQuery.data.value) return map;
    for (const pad of padsQuery.data.value) {
      const kind = padKind(pad, playlistsById.value);
      if (kind === null) continue;
      const playlist = pad.playlist_id === null ? null : playlistsById.value.get(pad.playlist_id) ?? null;
      const sounds: Sound[] = [];
      for (const take of pad.takes) {
        const sound = soundsById.value.get(take.sound_id);
        if (sound) sounds.push(sound);
      }
      const first = sounds[0];
      map.set(pad.id, { pad, kind, category: padCategory(kind, first ? first.category : null), playlist, sounds });
    }
    return map;
  });

  const pagePads = computed(() => {
    const page = activePage.value;
    if (!page) return [];
    return [...resolved.value.values()].filter((info) => info.pad.page_id === page.id);
  });

  // The tracks of every playlist pad, in one read, for "3 layers" and for a start that waits for nothing.
  const playlistPadIds = computed(() =>
    [...resolved.value.values()].flatMap((info) => (info.playlist ? [info.playlist.id] : [])),
  );
  const { byPlaylist } = usePlaylistsTracks(playlistPadIds);

  // ── Deck-owned state ─────────────────────────────────────────────────────

  const heldTools = ref<DeckTool[]>([]);
  const lockedTool = ref<DeckTool>("play");
  const currentTool = computed<DeckTool>(() => heldTools.value[heldTools.value.length - 1] ?? lockedTool.value);

  const hushHeld = ref(false);
  const hushLocked = ref(false);
  const hushOn = computed(() => hushHeld.value || hushLocked.value);
  // A tap sends down, up, toggle in one breath. Applying each would dip the mix and bring it back, so the store hears the settled value.
  let hushSyncQueued = false;
  function syncHush() {
    if (hushSyncQueued) return;
    hushSyncQueued = true;
    queueMicrotask(() => {
      hushSyncQueued = false;
      if (store.hushed !== hushOn.value) store.setHush(hushOn.value);
    });
  }

  /** The take each pad plays next. */
  const cursors = ref<Record<string, number>>({});
  /** Levels being dragged, shown until the saved value arrives. */
  const volumeOverrides = ref<Record<string, number>>({});
  const editRequest = ref<{ padId: string } | null>(null);

  // Held pads are tracked by pad id and keyed by the slot they were pressed in, so a page change under a held finger still releases the right pad.
  interface HeldPad {
    padId: string;
    mode: "gate" | "repeat";
  }
  const heldBySlot = new Map<string, HeldPad>();
  const heldPadIds = shallowRef<ReadonlySet<string>>(new Set());
  const repeatTimers = new Map<string, ReturnType<typeof setInterval>>();

  function syncHeld() {
    heldPadIds.value = new Set([...heldBySlot.values()].map((held) => held.padId));
  }

  const fadingIds = shallowRef<ReadonlySet<string>>(new Set());
  const fadeTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function clearFading(padId: string) {
    const timer = fadeTimers.get(padId);
    if (timer !== undefined) clearTimeout(timer);
    fadeTimers.delete(padId);
    if (fadingIds.value.has(padId)) {
      const next = new Set(fadingIds.value);
      next.delete(padId);
      fadingIds.value = next;
    }
  }

  /** The deck calls a pad fading for as long as its fade-out lasts. */
  function markFading(padId: string, ms: number) {
    clearFading(padId);
    fadingIds.value = new Set([...fadingIds.value, padId]);
    fadeTimers.set(
      padId,
      setTimeout(() => clearFading(padId), ms),
    );
  }

  // ── Reading the store ────────────────────────────────────────────────────

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

  // ── Starting and stopping ────────────────────────────────────────────────

  function laneIsOne(info: DeckPadInfo): boolean {
    const page = pages.value.find((p) => p.id === info.pad.page_id);
    const lane = page ? page.lanes[info.pad.lane] : undefined;
    return lane !== undefined && lane.rule === "one";
  }

  /** In a "one" lane a new pad takes over: everything else audible there fades out as this one fades in. */
  function stopLaneMates(info: DeckPadInfo) {
    if (!laneIsOne(info)) return;
    for (const other of resolved.value.values()) {
      if (other.pad.id === info.pad.id) continue;
      if (other.pad.page_id !== info.pad.page_id || other.pad.lane !== info.pad.lane) continue;
      if (isAudible(other)) stopPad(other, effectiveFades(other.pad, other.category).outMs);
    }
  }

  function startSound(info: DeckPadInfo, velocity: number | undefined, fadeInMs: number | undefined) {
    const count = info.sounds.length;
    const sound = nextSound(info);
    if (!sound) return;
    if (blockedReason(sound) !== null) return;
    const at = (cursors.value[info.pad.id] ?? 0) % count;
    cursors.value = { ...cursors.value, [info.pad.id]: nextTakeIndex(at, count) };

    const loop = effectiveLoop(info.pad, info.category, info.kind);
    if (sound.source_type === "spotify") {
      // Spotify has no gain, rate or gapless loop; repeat-track is its loop.
      const repeat = loop ? 2 : 0;
      void spotify.play(sound.file_url).then(() => {
        if (spotify.repeatMode !== repeat) void spotify.setRepeat(repeat);
      });
      return;
    }

    store.setVolume(sound.id, volumeOf(info.pad));
    const opts: PlayOptions = { fadeInMs: fadeInMs === undefined ? effectiveFades(info.pad, info.category).inMs : fadeInMs, loop };
    let gain = 1;
    let shaped = false;
    if (info.pad.velocity && velocity !== undefined) {
      gain *= velocityGain(velocity, velocityCurve.value);
      shaped = true;
    }
    if (info.pad.vary && count > 1) {
      const variation = takeVariation(Math.random);
      gain *= variation.gain;
      opts.rate = variation.rate;
      shaped = true;
    }
    if (shaped) opts.gain = gain;

    // A sound that is already sounding starts over: hitting the thunderclap twice gives two thunderclaps.
    if (store.playbackStates[sound.id]?.isPlaying === true) {
      store.restart(sound.id, sound.file_url, sound.category, sound.gain_trim, opts);
    } else {
      store.play(sound.id, sound.file_url, sound.category, sound.gain_trim, opts);
    }
  }

  function startPlaylist(info: DeckPadInfo) {
    const playlist = info.playlist;
    if (!playlist) return;
    const begin = (tracks: PlaylistTrackWithSound[]) => {
      if (info.kind === "scene") store.playAmbientPlaylist(playlist, tracks);
      else store.playMusicPlaylist(playlist, tracks);
    };
    const cached = byPlaylist.value?.get(playlist.id);
    if (cached && cached.length > 0) begin(cached);
    else void fetchTracks(playlist.id).then(begin);
  }

  function startPad(info: DeckPadInfo, velocity?: number, fadeInMs?: number) {
    clearFading(info.pad.id);
    stopLaneMates(info);
    if (info.kind === "sound") startSound(info, velocity, fadeInMs);
    else startPlaylist(info);
  }

  function stopPad(info: DeckPadInfo, ms: number) {
    if (!isAudible(info)) return;
    markFading(info.pad.id, ms);
    if (info.kind === "sound") {
      for (const sound of info.sounds) {
        if (!soundPlaying(sound)) continue;
        if (sound.source_type === "spotify") void spotify.pause();
        else store.fadeOut(sound.id, ms);
      }
      return;
    }
    const playlist = info.playlist;
    if (!playlist) return;
    if (info.kind === "scene") store.stopAmbientPlaylist(playlist.id);
    else if (store.activeMusicPlaylist?.playlistId === playlist.id) store.stopMusicPlaylist();
  }

  // ── Presses ──────────────────────────────────────────────────────────────

  function infoAt(lane: number, row: number): DeckPadInfo | null {
    const found = padAt(
      pagePads.value.map((info) => info.pad),
      lane,
      row,
    );
    return found ? resolved.value.get(found.id) ?? null : null;
  }

  function slotKey(lane: number, row: number) {
    return `${lane},${row}`;
  }

  function stopRepeat(padId: string) {
    const timer = repeatTimers.get(padId);
    if (timer !== undefined) clearInterval(timer);
    repeatTimers.delete(padId);
  }

  function hold(lane: number, row: number, padId: string, mode: HeldPad["mode"]) {
    // A finger that was never seen lifting (a lost release) must not strand the pad it held.
    releaseSlot(lane, row);
    heldBySlot.set(slotKey(lane, row), { padId, mode });
    syncHeld();
  }

  function releaseSlot(lane: number, row: number) {
    const key = slotKey(lane, row);
    const held = heldBySlot.get(key);
    if (!held) return;
    heldBySlot.delete(key);
    syncHeld();
    stopRepeat(held.padId);
    if (held.mode !== "gate") return; // Repeat lets the last hit ring.
    const info = resolved.value.get(held.padId);
    if (!info) return;
    stopPad(info, Math.max(effectiveFades(info.pad, info.category).outMs, GATE_MIN_RELEASE_MS));
  }

  function press(lane: number, row: number, velocity: number | undefined) {
    const info = infoAt(lane, row);
    if (!info) return;
    const tool = currentTool.value;
    if (tool !== "play") {
      toolPress(tool, info);
      return;
    }
    if (blockedFor(info) !== null) return;
    const mode = effectiveLaunchMode(info.pad, info.category, info.kind);
    switch (mode) {
      case "trigger":
        startPad(info, velocity);
        return;
      case "toggle":
        if (isAudible(info)) stopPad(info, effectiveFades(info.pad, info.category).outMs);
        else startPad(info, velocity);
        return;
      case "gate":
        hold(lane, row, info.pad.id, "gate");
        startPad(info, velocity);
        return;
      case "repeat": {
        hold(lane, row, info.pad.id, "repeat");
        startPad(info, velocity);
        const padId = info.pad.id;
        repeatTimers.set(
          padId,
          setInterval(() => {
            const current = resolved.value.get(padId);
            if (!current) stopRepeat(padId);
            else startPad(current, velocity);
          }, info.pad.repeat_ms),
        );
        return;
      }
    }
  }

  function toolPress(tool: DeckTool, info: DeckPadInfo) {
    switch (tool) {
      case "play":
      case "volume":
        return; // A volume press does nothing; the surface sends padVolume as the finger drags.
      case "loop": {
        const next = !padLoops(info);
        updatePad.mutate({ id: info.pad.id, patch: { loop: next } });
        for (const sound of info.sounds) {
          if (!soundPlaying(sound)) continue;
          if (sound.source_type === "spotify") void spotify.setRepeat(next ? 2 : 0);
          else store.setLooping(sound.id, next);
        }
        return;
      }
      case "stop":
        stopPad(info, STOP_TOOL_MS);
        return;
      case "fade":
        if (isAudible(info)) stopPad(info, FADE_TOOL_MS);
        else startPad(info, undefined, FADE_TOOL_MS);
        return;
      case "solo":
        solo(info);
        return;
      case "edit":
        editRequest.value = { padId: info.pad.id };
        return;
    }
  }

  function solo(info: DeckPadInfo) {
    if (isSoloed(info)) {
      store.setSolo(null);
      return;
    }
    const ids = padSoundIds(info);
    if (ids.length > 0) {
      store.setSolo(ids);
      return;
    }
    // A scene that is not running has no layers to hear yet; its tracks say which ones to solo.
    const playlist = info.playlist;
    if (info.kind !== "scene" || !playlist) return;
    void fetchTracks(playlist.id).then((tracks) => store.setSolo(tracks.map((t) => t.sound.id)));
  }

  // ── The rest of the protocol ─────────────────────────────────────────────

  const volumeTimers = new Map<string, { value: number; timer: ReturnType<typeof setTimeout> }>();

  function saveVolume(padId: string) {
    const pending = volumeTimers.get(padId);
    if (!pending) return;
    clearTimeout(pending.timer);
    volumeTimers.delete(padId);
    updatePad.mutate(
      { id: padId, patch: { volume: pending.value } },
      {
        onError: () => {
          const { [padId]: _dropped, ...rest } = volumeOverrides.value;
          volumeOverrides.value = rest;
        },
      },
    );
  }

  function padVolume(lane: number, row: number, raw: number) {
    const info = infoAt(lane, row);
    if (!info) return;
    const value = Math.min(1, Math.max(0, raw));
    volumeOverrides.value = { ...volumeOverrides.value, [info.pad.id]: value };
    for (const sound of info.sounds) if (sound.source_type !== "spotify") store.setVolume(sound.id, value);
    const pending = volumeTimers.get(info.pad.id);
    if (pending) clearTimeout(pending.timer);
    volumeTimers.set(info.pad.id, {
      value,
      timer: setTimeout(() => saveVolume(info.pad.id), VOLUME_SAVE_MS),
    });
  }

  // The dragged value stays on screen until the saved one has come back.
  watch(
    () => padsQuery.data.value,
    (list) => {
      if (!list) return;
      const current = volumeOverrides.value;
      const ids = Object.keys(current);
      if (ids.length === 0) return;
      const keep: Record<string, number> = {};
      for (const id of ids) {
        const pad = list.find((p) => p.id === id);
        const value = current[id];
        if (pad && value !== undefined && (pad.volume !== value || volumeTimers.has(id))) keep[id] = value;
      }
      if (Object.keys(keep).length !== ids.length) volumeOverrides.value = keep;
    },
  );

  function applyTool(tool: DeckTool, phase: "down" | "up" | "toggle") {
    if (phase === "down") {
      heldTools.value = [...heldTools.value, tool];
    } else if (phase === "up") {
      const at = heldTools.value.lastIndexOf(tool);
      if (at >= 0) heldTools.value = heldTools.value.filter((_, i) => i !== at);
    } else {
      lockedTool.value = tool === "play" || tool === lockedTool.value ? "play" : tool;
    }
  }

  function applyHush(phase: "down" | "up" | "toggle") {
    if (phase === "down") hushHeld.value = true;
    else if (phase === "up") hushHeld.value = false;
    else hushLocked.value = !hushLocked.value;
    syncHush();
  }

  function stepPage(delta: -1 | 1) {
    const list = pages.value;
    if (list.length === 0) return;
    const at = activePage.value ? list.findIndex((p) => p.id === activePage.value?.id) : 0;
    const next = list[Math.min(list.length - 1, Math.max(0, at + delta))];
    if (next) ui.soundboardActivePage = next.id;
  }

  function dispatch(action: DeckAction) {
    switch (action.type) {
      case "press":
        press(action.lane, action.row, action.velocity);
        return;
      case "release":
        releaseSlot(action.lane, action.row);
        return;
      case "tool":
        applyTool(action.tool, action.phase);
        return;
      case "page": {
        const page = pages.value[action.index];
        if (page) ui.soundboardActivePage = page.id;
        return;
      }
      case "pageStep":
        stepPage(action.delta);
        return;
      case "hush":
        applyHush(action.phase);
        return;
      case "fadeAll":
        for (const info of resolved.value.values()) if (isAudible(info)) markFading(info.pad.id, FADE_TOOL_MS);
        store.fadeOutAll(FADE_TOOL_MS);
        if (spotify.isPlaying) void spotify.pause();
        return;
      case "pauseAll":
        store.togglePauseAll();
        return;
      case "stopAll":
        store.stopAll();
        if (spotify.isPlaying) void spotify.pause();
        return;
      case "padVolume":
        padVolume(action.lane, action.row, action.value);
        return;
      case "master":
        store.setMasterVolume(action.value);
        return;
    }
  }

  // ── The snapshot ─────────────────────────────────────────────────────────

  function lightOf(info: DeckPadInfo, audible: boolean, loop: boolean, blocked: string | null, soloed: boolean): DeckLight {
    if (heldPadIds.value.has(info.pad.id)) return "held";
    if (fadingIds.value.has(info.pad.id)) return "fading";
    if (audible) {
      if (store.soloIds !== null && !soloed) return "ducked";
      return loop ? "looping" : "playing";
    }
    return blocked !== null ? "blocked" : "ready";
  }

  function metaOf(info: DeckPadInfo): string | null {
    const playlist = info.playlist;
    if (info.kind === "sound") {
      const next = nextSound(info);
      return sharing.value && next !== null && next.source_type === "spotify" ? SPOTIFY_SHARING_NOTE : null;
    }
    if (!playlist) return null;
    if (info.kind === "scene") {
      const tracks = byPlaylist.value?.get(playlist.id);
      return tracks ? plural(tracks.length, "layer", "layers") : null;
    }
    const music = store.activeMusicPlaylist;
    if (music && music.playlistId === playlist.id) return `${music.currentIndex + 1}/${music.trackSoundIds.length}`;
    const tracks = byPlaylist.value?.get(playlist.id);
    return tracks ? plural(tracks.length, "track", "tracks") : null;
  }

  function emptyCell(lane: number, row: number): DeckCellView {
    return {
      lane,
      row,
      padId: null,
      kind: null,
      category: null,
      name: "",
      light: "off",
      loop: false,
      mode: "trigger",
      modeIsDefault: true,
      takes: 0,
      nextTake: 0,
      progress: 0,
      volume: 0,
      soloed: false,
      blockedReason: null,
      meta: null,
      keyLabel: null,
    };
  }

  function cellOf(info: DeckPadInfo): DeckCellView {
    const { pad } = info;
    const audible = isAudible(info);
    const loop = padLoops(info);
    const blocked = blockedFor(info);
    const soloed = isSoloed(info);
    const first = info.sounds[0];
    const named = pad.name !== null && pad.name !== "";
    const count = info.sounds.length;
    const cursor = cursors.value[pad.id];
    return {
      lane: pad.lane,
      row: pad.grid_row,
      padId: pad.id,
      kind: info.kind,
      category: info.category,
      name: named ? (pad.name ?? "") : first ? first.name : info.playlist ? info.playlist.name : "",
      light: lightOf(info, audible, loop, blocked, soloed),
      loop,
      mode: effectiveLaunchMode(pad, info.category, info.kind),
      modeIsDefault: isDefaultLaunchMode(pad, info.category, info.kind),
      takes: info.kind === "sound" ? pad.takes.length : 0,
      nextTake: count > 0 ? (cursor === undefined ? 0 : cursor) % count : 0,
      progress: progressOf(info),
      volume: volumeOf(pad),
      soloed,
      blockedReason: blocked,
      meta: metaOf(info),
      keyLabel: topRowKey(pad.lane, pad.grid_row),
    };
  }

  const snapshot = computed<DeckSnapshot>(() => {
    const page = activePage.value;
    const padsHere = pagePads.value;
    const rows = rowsForPage(padsHere.map((info) => info.pad));
    const cells: DeckCellView[] = [];
    for (let row = 0; row < rows; row++) {
      for (let lane = 0; lane < DECK_LANES; lane++) {
        const found = padsHere.find((info) => info.pad.lane === lane && info.pad.grid_row === row);
        cells.push(found ? cellOf(found) : emptyCell(lane, row));
      }
    }
    const laneDefs = page ? page.lanes : DEFAULT_LANES;
    const lanes: DeckLaneView[] = laneDefs.map((def, lane) => ({
      name: def.name,
      rule: def.rule,
      category: laneCategory(padsHere.filter((info) => info.pad.lane === lane).map((info) => info.category)),
    }));
    return {
      pages: pages.value.map((p) => ({ id: p.id, name: p.name })),
      pageIndex: page ? pages.value.findIndex((p) => p.id === page.id) : -1,
      lanes,
      rows,
      cells,
      tool: currentTool.value,
      lockedTool: lockedTool.value,
      hush: hushOn.value,
      paused: store.isPausedAll,
      audibleCount: store.activeAudioCount + (spotify.isPlaying ? 1 : 0),
      masterVolume: store.masterVolume,
    };
  });

  onScopeDispose(() => {
    for (const padId of volumeTimers.keys()) saveVolume(padId); // The last drag is not lost.
    for (const timer of repeatTimers.values()) clearInterval(timer);
    for (const timer of fadeTimers.values()) clearTimeout(timer);
    repeatTimers.clear();
    fadeTimers.clear();
  });

  return {
    snapshot,
    dispatch,
    editRequest,
    clearEditRequest: () => {
      editRequest.value = null;
    },
    velocityCurve,
    setVelocityCurve,
    pagePads,
    activePageId: computed(() => (activePage.value ? activePage.value.id : null)),
  };
}

// One deck for the whole app. Made on first use in a detached scope so it outlives the component that asked first (the same reason as useListLayout).
let shared: DeckController | null = null;

export function useDeck(): DeckController {
  if (!shared) {
    const created = effectScope(true).run(createDeck);
    if (!created) throw new Error("useDeck: the detached scope did not run");
    shared = created;
  }
  return shared;
}
