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
import { useUpdatePad } from "@/composables/soundboard/useDeckPads";
import { useFetchPlaylistTracks } from "@/composables/soundboard/useSoundboardPlaylists";
import { useBlockedCheck } from "@/composables/soundboard/useSoundPlayback";
import { useDeckReadout } from "@/composables/soundboard/useDeckReadout";
import { useDeckResolved, type DeckPadInfo } from "@/composables/soundboard/useDeckResolved";
import { useDeckSnapshot } from "@/composables/soundboard/useDeckSnapshot";
import {
  effectiveFades,
  effectiveLaunchMode,
  effectiveLoop,
  nextTakeIndex,
  padAt,
  takeVariation,
  velocityGain,
  type VelocityCurve,
} from "@/lib/audio/deck/deckModel";
import { type DeckAction, type DeckSnapshot, type DeckTool } from "@/lib/audio/deck/deckSurface";
import type { PlayOptions } from "@/stores/soundboard";
import type { PlaylistTrackWithSound } from "@/types/sound.types";

export type { DeckPadInfo };

/** Length of the Fade tool's fade, and of Fade all. */
export const FADE_TOOL_MS = 3000;
/** The Stop tool's short fade, so a cut does not click. */
export const STOP_TOOL_MS = 60;
/** A released Gate pad never fades faster than this, so letting go does not click. */
export const GATE_MIN_RELEASE_MS = 80;
/** How long a dragged pad volume waits before it is written. */
export const VOLUME_SAVE_MS = 400;

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

export function createDeck(): DeckController {
  const store = useSoundboardStore();
  const spotify = useSpotifyStore();
  const ui = useSoundboardUiStore();
  const updatePad = useUpdatePad();
  const fetchTracks = useFetchPlaylistTracks();
  const blockedReason = useBlockedCheck();

  // ── Preferences ──────────────────────────────────────────────────────────

  const storedCurve = useStorage<string>("grimoire_deck_velocity_curve", "even", safeLocalStorage());
  const velocityCurve = computed<VelocityCurve>(() => (isCurve(storedCurve.value) ? storedCurve.value : "even"));
  function setVelocityCurve(curve: VelocityCurve) {
    storedCurve.value = curve;
  }

  // ── What is on the deck ──────────────────────────────────────────────────

  const deckResolved = useDeckResolved();
  const { padsQuery, pages, activePage, resolved, pagePads, byPlaylist } = deckResolved;

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

  const readout = useDeckReadout({ cursors, volumeOverrides });
  const { soundPlaying, isAudible, padLoops, padSoundIds, isSoloed, volumeOf, nextSound, blockedFor } = readout;

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

  const snapshot = useDeckSnapshot({ resolved: deckResolved, readout, cursors, heldPadIds, fadingIds, hushOn, currentTool, lockedTool });

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
