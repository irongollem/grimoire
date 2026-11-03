import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, type EffectScope } from "vue";
import type { SoundboardPadWithTakes, Sound, SoundboardPlaylist, SoundboardPage } from "@/types/sound.types";
import { DEFAULT_LANES } from "@/lib/audio/deck/deckModel";

const h = await vi.hoisted(async () => {
  const { reactive, ref } = await import("vue");
  interface PState {
    isPlaying: boolean;
    isLooping: boolean;
    currentTime: number;
    duration: number;
    volume: number;
    loadError: boolean;
  }
  const store = reactive({
    playbackStates: {} as Record<string, PState>,
    activeAmbientPlaylists: [] as Array<{ playlistId: string; soundIds: string[]; paused: boolean }>,
    activeMusicPlaylist: null as null | { playlistId: string; trackSoundIds: string[]; currentIndex: number; paused: boolean },
    soloIds: null as string[] | null,
    hushed: false,
    isPausedAll: false,
    activeAudioCount: 0,
    masterVolume: 1,
    startingIds: [] as string[],
    isStarting: (id: string) => store.startingIds.includes(id),
    play: vi.fn(),
    restart: vi.fn(),
    fadeOut: vi.fn(),
    fadeOutAll: vi.fn(),
    setLooping: vi.fn(),
    isLooping: (id: string) => store.playbackStates[id]?.isLooping === true,
    setHush: vi.fn(),
    setSolo: vi.fn(),
    togglePauseAll: vi.fn(),
    stopAll: vi.fn(),
    setVolume: vi.fn(),
    setMasterVolume: vi.fn(),
    playMusicPlaylist: vi.fn(),
    stopMusicPlaylist: vi.fn(),
    playAmbientPlaylist: vi.fn(),
    stopAmbientPlaylist: vi.fn(),
    isPlaylistActive: (id: string) =>
      store.activeMusicPlaylist?.playlistId === id || store.activeAmbientPlaylists.some((s) => s.playlistId === id),
    isPlaylistPaused: (id: string) => {
      if (store.activeMusicPlaylist?.playlistId === id) return store.activeMusicPlaylist.paused;
      return store.activeAmbientPlaylists.find((s) => s.playlistId === id)?.paused === true;
    },
  });
  const spotify = reactive({
    isReady: true,
    isPlaying: false,
    lastPlayedUrl: null as string | null,
    repeatMode: 0 as 0 | 1 | 2,
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(() => Promise.resolve()),
    setRepeat: vi.fn(() => Promise.resolve()),
  });
  const ui = reactive({ soundboardActivePage: null as string | null });
  const data = {
    pads: ref<unknown[] | undefined>([]),
    pages: ref<unknown[] | undefined>([]),
    sounds: ref<unknown[] | undefined>([]),
    playlists: ref<unknown[] | undefined>([]),
    byPlaylist: ref<Map<string, unknown[]> | undefined>(undefined),
    sharing: ref(false),
    blocked: new Map<string, string>(),
    music: ref<null | { sourceId: string; label: string; kind: string; slot: string; target: string }>(null),
    ambient: ref<Array<{ sourceId: string; label: string; kind: string; slot: string; target: string }>>([]),
  };
  return {
    store,
    spotify,
    ui,
    data,
    updatePad: vi.fn(),
    createPad: vi.fn(),
    toastError: vi.fn(),
    fetchTracks: vi.fn(),
  };
});

vi.mock("@/stores/soundboard", () => ({ useSoundboardStore: () => h.store }));
vi.mock("@/stores/spotify", () => ({ useSpotifyStore: () => h.spotify }));
vi.mock("@/stores/ui/soundboard", () => ({ useSoundboardUiStore: () => h.ui }));
vi.mock("@/composables/soundboard/useDeckPads", () => ({
  useDeckPads: () => ({ data: h.data.pads }),
  useUpdatePad: () => ({ mutate: h.updatePad }),
  useCreatePad: () => ({ mutate: h.createPad }),
}));
vi.mock("@/composables/soundboard/useAudioThemeTriggers", () => ({
  useActiveAudioTriggers: () => ({ musicTrigger: h.data.music, ambientTriggers: h.data.ambient }),
}));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ error: h.toastError, fromError: (_e: unknown, fallback: string) => fallback }),
}));
vi.mock("@/composables/soundboard/useSoundboardPages", () => ({ useSoundboardPages: () => ({ data: h.data.pages }) }));
vi.mock("@/composables/soundboard/useSounds", () => ({ useSounds: () => ({ data: h.data.sounds }) }));
vi.mock("@/composables/soundboard/useSoundboardPlaylists", () => ({
  usePlaylists: () => ({ data: h.data.playlists }),
  usePlaylistsTracks: () => ({ byPlaylist: h.data.byPlaylist }),
  useFetchPlaylistTracks: () => h.fetchTracks,
}));
vi.mock("@/composables/soundboard/useSoundPlayback", () => ({
  useBlockedCheck: () => (sound: Sound) => h.data.blocked.get(sound.id) ?? null,
}));
vi.mock("@/composables/soundboard/useAudioSharing", () => ({ useAudioSharing: () => h.data.sharing }));

const { createDeck } = await import("./useDeck");

// ── Fixtures ───────────────────────────────────────────────────────────────

function sound(id: string, category: Sound["category"] = "effects", over: Partial<Sound> = {}): Sound {
  return {
    id,
    name: `Sound ${id}`,
    category,
    source_type: "url",
    file_url: `https://x.test/${id}.mp3`,
    gain_trim: 0.9,
    ...over,
  } as Sound;
}

function pad(id: string, over: Partial<SoundboardPadWithTakes> = {}, takeIds: string[] = [id]): SoundboardPadWithTakes {
  return {
    id,
    page_id: "p1",
    lane: 0,
    grid_row: 0,
    playlist_id: null,
    name: null,
    launch_mode: null,
    loop: null,
    volume: 0.8,
    fade_in_ms: null,
    fade_out_ms: null,
    vary: false,
    velocity: false,
    repeat_ms: 200,
    takes: takeIds.map((sound_id, position) => ({ id: `${id}-t${position}`, pad_id: id, sound_id, position })),
    ...over,
  } as SoundboardPadWithTakes;
}

function playlist(id: string, type: "music" | "ambient"): SoundboardPlaylist {
  return { id, name: `PL ${id}`, playlist_type: type, shuffle: false, repeat: true } as SoundboardPlaylist;
}

function page(id: string, lanes = DEFAULT_LANES): SoundboardPage {
  return { id, name: id.toUpperCase(), lanes } as SoundboardPage;
}

function track(playlistId: string, soundId: string): unknown {
  return { id: `${playlistId}-${soundId}`, playlist_id: playlistId, sound_id: soundId, sound: sound(soundId, "ambient") };
}

/** Sounds the store would be playing after a play(). */
function playing(id: string, over: Partial<(typeof h.store.playbackStates)[string]> = {}) {
  h.store.playbackStates[id] = { isPlaying: true, isLooping: false, currentTime: 0, duration: 0, volume: 1, loadError: false, ...over };
}

let scope: EffectScope;
function boot(opts: { pads: SoundboardPadWithTakes[]; sounds?: Sound[]; playlists?: SoundboardPlaylist[]; pages?: SoundboardPage[] }) {
  h.data.pads.value = opts.pads;
  h.data.sounds.value = opts.sounds ?? opts.pads.flatMap((p) => p.takes.map((t) => sound(t.sound_id)));
  h.data.playlists.value = opts.playlists ?? [];
  h.data.pages.value = opts.pages ?? [page("p1")];
  const deck = scope.run(createDeck);
  if (!deck) throw new Error("deck did not start");
  return deck;
}

function press(deck: ReturnType<typeof boot>, lane = 0, row = 0, velocity?: number) {
  deck.dispatch(velocity === undefined ? { type: "press", lane, row } : { type: "press", lane, row, velocity });
}
function release(deck: ReturnType<typeof boot>, lane = 0, row = 0) {
  deck.dispatch({ type: "release", lane, row });
}
const cell = (deck: ReturnType<typeof boot>, lane = 0, row = 0) => {
  const found = deck.snapshot.value.cells.find((c) => c.lane === lane && c.row === row);
  if (!found) throw new Error("no such cell");
  return found;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  for (const key of Object.keys(h.store.playbackStates)) delete h.store.playbackStates[key];
  h.store.activeAmbientPlaylists = [];
  h.store.activeMusicPlaylist = null;
  h.store.soloIds = null;
  h.store.hushed = false;
  h.store.isPausedAll = false;
  h.store.activeAudioCount = 0;
  h.store.masterVolume = 1;
  h.spotify.isPlaying = false;
  h.spotify.lastPlayedUrl = null;
  h.spotify.repeatMode = 0;
  h.ui.soundboardActivePage = null;
  h.data.byPlaylist.value = undefined;
  h.data.sharing.value = false;
  h.data.blocked.clear();
  h.data.music.value = null;
  h.data.ambient.value = [];
  localStorage.clear();
  // A play puts the sound in the store's playing state; a fade-out takes it out.
  h.store.play.mockImplementation((id: string, _url: string, _cat: string, _trim: number, opts?: { loop?: boolean }) =>
    playing(id, { isLooping: opts?.loop === true }),
  );
  h.store.restart.mockImplementation((id: string) => playing(id));
  h.store.fadeOut.mockImplementation((id: string) => {
    if (h.store.playbackStates[id]) h.store.playbackStates[id].isPlaying = false;
  });
  h.fetchTracks.mockResolvedValue([]);
  h.store.startingIds = [];
  scope = effectScope();
});

afterEach(() => {
  scope.stop();
  vi.useRealTimers();
});

// ── Launch modes ───────────────────────────────────────────────────────────

describe("trigger", () => {
  it("fires the takes round robin (fails if the cursor never advanced)", () => {
    const deck = boot({ pads: [pad("a", {}, ["s1", "s2", "s3"])] });
    for (let i = 0; i < 4; i++) {
      press(deck);
      h.store.playbackStates = {};
    }
    expect(h.store.play.mock.calls.map((c) => c[0])).toEqual(["s1", "s2", "s3", "s1"]);
  });

  it("plays with the category, the sound's trim and the pad's fades (fails if the category were dropped: the sound would route to the ambient bus)", () => {
    const deck = boot({ pads: [pad("a")] });
    press(deck);
    expect(h.store.play).toHaveBeenCalledWith("a", "https://x.test/a.mp3", "effects", 0.9, { fadeInMs: 0, loop: false });
    expect(h.store.setVolume).toHaveBeenCalledWith("a", 0.8);
  });

  it("restarts a sound that is already sounding and never stops it (fails if a second press stopped it)", () => {
    const deck = boot({ pads: [pad("a")] });
    press(deck);
    press(deck);
    expect(h.store.restart).toHaveBeenCalledTimes(1);
    expect(h.store.fadeOut).not.toHaveBeenCalled();
  });

  it("does nothing for an empty slot", () => {
    const deck = boot({ pads: [pad("a")] });
    press(deck, 3, 0);
    expect(h.store.play).not.toHaveBeenCalled();
  });

  it("does not play a blocked sound (fails if the blocked check were skipped)", () => {
    const deck = boot({ pads: [pad("a")] });
    h.data.blocked.set("a", "Failed to load");
    press(deck);
    expect(h.store.play).not.toHaveBeenCalled();
  });
});

describe("toggle", () => {
  it("starts when silent and fades out with the pad's own fade when audible (fails if toggle never stopped)", () => {
    const deck = boot({ pads: [pad("m", { fade_out_ms: 900 })], sounds: [sound("m", "music")] });
    press(deck);
    expect(h.store.play).toHaveBeenCalledWith("m", expect.any(String), "music", 0.9, { fadeInMs: 1000, loop: true });
    press(deck);
    expect(h.store.fadeOut).toHaveBeenCalledWith("m", 900);
  });
});

describe("gate", () => {
  it("plays on press and fades out on release, never faster than 80 ms (fails if release did not stop it)", () => {
    const deck = boot({ pads: [pad("g", { launch_mode: "gate", fade_out_ms: 10 })] });
    press(deck);
    expect(h.store.play).toHaveBeenCalled();
    expect(h.store.fadeOut).not.toHaveBeenCalled();
    release(deck);
    expect(h.store.fadeOut).toHaveBeenCalledWith("g", 80);
  });

  it("keeps a longer authored fade-out on release", () => {
    const deck = boot({ pads: [pad("g", { launch_mode: "gate", fade_out_ms: 500 })] });
    press(deck);
    release(deck);
    expect(h.store.fadeOut).toHaveBeenCalledWith("g", 500);
  });

  it("releases the right pad after the page changed under the finger (fails if release looked up the slot on the new page)", () => {
    const deck = boot({
      pads: [pad("g", { launch_mode: "gate" }), pad("other", { page_id: "p2" })],
      pages: [page("p1"), page("p2")],
    });
    press(deck);
    deck.dispatch({ type: "page", index: 1 });
    release(deck);
    expect(h.store.fadeOut).toHaveBeenCalledWith("g", expect.any(Number));
    expect(h.store.fadeOut).toHaveBeenCalledTimes(1);
  });

  // Fails if a stop only looks at isPlaying: a quick tap releases before the
  // file has started, the stop finds nothing, and a looping take then runs
  // forever with nobody holding the pad.
  it("stops a gate pad released while its file is still loading", () => {
    const deck = boot({ pads: [pad("g", { launch_mode: "gate" })] });
    h.store.play.mockImplementationOnce((id: string) => {
      h.store.startingIds.push(id);
    });
    press(deck);
    expect(h.store.playbackStates.g?.isPlaying).not.toBe(true);
    release(deck);
    expect(h.store.fadeOut).toHaveBeenCalledWith("g", expect.any(Number));
  });

  it("ignores a release for a slot nothing is held in", () => {
    const deck = boot({ pads: [pad("g", { launch_mode: "gate" })] });
    release(deck, 5, 5);
    release(deck);
    expect(h.store.fadeOut).not.toHaveBeenCalled();
  });

  it("shows a held gate pad as held, then not", () => {
    const deck = boot({ pads: [pad("g", { launch_mode: "gate" })] });
    press(deck);
    expect(cell(deck).light).toBe("held");
    release(deck);
    expect(cell(deck).light).not.toBe("held");
  });
});

describe("repeat", () => {
  it("fires again every repeat_ms while held and stops on release (fails if the timer survived release)", () => {
    const deck = boot({ pads: [pad("r", { launch_mode: "repeat", repeat_ms: 200 })] });
    press(deck);
    expect(h.store.play.mock.calls.length + h.store.restart.mock.calls.length).toBe(1);
    vi.advanceTimersByTime(600);
    expect(h.store.play.mock.calls.length + h.store.restart.mock.calls.length).toBe(4);
    release(deck);
    vi.advanceTimersByTime(2000);
    expect(h.store.play.mock.calls.length + h.store.restart.mock.calls.length).toBe(4);
  });

  it("lets the last hit ring (fails if release faded it out)", () => {
    const deck = boot({ pads: [pad("r", { launch_mode: "repeat" })] });
    press(deck);
    release(deck);
    expect(h.store.fadeOut).not.toHaveBeenCalled();
  });
});

// ── Lanes ──────────────────────────────────────────────────────────────────

describe("lane rule", () => {
  const lanes = DEFAULT_LANES.map((l) => ({ ...l }));

  it("'one' fades out the audible pad of the lane with its own fade as the new one starts (fails if the old pad kept playing)", () => {
    lanes[0] = { name: "Music", rule: "one" };
    const deck = boot({
      pads: [pad("m1", { grid_row: 0, fade_out_ms: 700 }), pad("m2", { grid_row: 1 })],
      sounds: [sound("m1", "music"), sound("m2", "music")],
      pages: [page("p1", lanes)],
    });
    press(deck, 0, 0);
    press(deck, 0, 1);
    expect(h.store.fadeOut).toHaveBeenCalledWith("m1", 700);
    expect(h.store.play).toHaveBeenLastCalledWith("m2", expect.any(String), "music", 0.9, expect.any(Object));
  });

  it("'together' leaves the other pad alone (fails if every lane crossfaded)", () => {
    const together = DEFAULT_LANES.map((l) => ({ ...l, rule: "together" as const }));
    const deck = boot({
      pads: [pad("m1", { grid_row: 0 }), pad("m2", { grid_row: 1 })],
      sounds: [sound("m1", "music"), sound("m2", "music")],
      pages: [page("p1", together)],
    });
    press(deck, 0, 0);
    press(deck, 0, 1);
    expect(h.store.fadeOut).not.toHaveBeenCalled();
  });

  it("'one' only reaches its own lane and page (fails if it stopped pads elsewhere)", () => {
    const deck = boot({
      pads: [pad("a", { lane: 1 }), pad("b", { lane: 0 }), pad("c", { page_id: "p2" })],
      sounds: [sound("a", "music"), sound("b", "music"), sound("c", "music")],
      pages: [page("p1", lanes), page("p2", lanes)],
    });
    playing("a");
    playing("c");
    press(deck, 0, 0);
    expect(h.store.fadeOut).not.toHaveBeenCalled();
  });

  it("counts a pad a trigger started as audible and stops it (fails if only deck-pressed pads counted)", () => {
    const deck = boot({
      pads: [pad("m1", { grid_row: 0 }), pad("m2", { grid_row: 1 })],
      sounds: [sound("m1", "music"), sound("m2", "music")],
      pages: [page("p1", lanes)],
    });
    playing("m1"); // started by an encounter, not by a press
    press(deck, 0, 1);
    expect(h.store.fadeOut).toHaveBeenCalledWith("m1", 1500);
  });

  it("a scene in a 'one' lane is stopped by a new pad", () => {
    const deck = boot({
      pads: [pad("sc", { playlist_id: "pl", grid_row: 0 }, []), pad("m2", { grid_row: 1 })],
      sounds: [sound("m2", "music")],
      playlists: [playlist("pl", "ambient")],
      pages: [page("p1", lanes)],
    });
    h.store.activeAmbientPlaylists = [{ playlistId: "pl", soundIds: ["x"], paused: false }];
    press(deck, 0, 1);
    expect(h.store.stopAmbientPlaylist).toHaveBeenCalledWith("pl");
  });
});

// ── Takes, variation, velocity ─────────────────────────────────────────────

describe("variation and velocity", () => {
  it("varies pitch and gain only with vary on and more than one take (fails if a single take varied)", () => {
    const one = boot({ pads: [pad("a", { vary: true })] });
    press(one);
    expect(h.store.play.mock.calls[0][4]).not.toHaveProperty("rate");
    expect(h.store.play.mock.calls[0][4]).not.toHaveProperty("gain");
    scope.stop();
    scope = effectScope();
    h.store.play.mockClear();
    const many = boot({ pads: [pad("a", { vary: true }, ["s1", "s2"])] });
    press(many);
    const opts = h.store.play.mock.calls[0][4];
    expect(opts.rate).toBeGreaterThanOrEqual(0.96);
    expect(opts.rate).toBeLessThanOrEqual(1.04);
    expect(opts.gain).toBeGreaterThanOrEqual(0.88);
    expect(opts.gain).toBeLessThanOrEqual(1);
  });

  it("does not vary when vary is off even with several takes", () => {
    const deck = boot({ pads: [pad("a", {}, ["s1", "s2"])] });
    press(deck);
    expect(h.store.play.mock.calls[0][4]).not.toHaveProperty("rate");
  });

  it("applies velocity only to a pad that opts in and a press that carried one (fails if velocity leaked onto every pad)", () => {
    const optIn = boot({ pads: [pad("a", { velocity: true })] });
    press(optIn, 0, 0, 0.5);
    expect(h.store.play.mock.calls[0][4].gain).toBeCloseTo(0.5); // even curve
    h.store.play.mockClear();
    h.store.playbackStates = {};
    press(optIn); // a click carries no velocity
    expect(h.store.play.mock.calls[0][4]).not.toHaveProperty("gain");
    scope.stop();
    scope = effectScope();
    h.store.play.mockClear();
    h.store.playbackStates = {};
    const optOut = boot({ pads: [pad("a")] });
    press(optOut, 0, 0, 0.2);
    expect(h.store.play.mock.calls[0][4]).not.toHaveProperty("gain");
  });

  it("shapes velocity by the saved curve and keeps it across a reload (fails if the curve was not read)", async () => {
    const deck = boot({ pads: [pad("a", { velocity: true })] });
    deck.setVelocityCurve("punchy");
    press(deck, 0, 0, 0.5);
    expect(h.store.play.mock.calls[0][4].gain).toBeCloseTo(0.25);
    await nextTick();
    scope.stop();
    scope = effectScope();
    const again = boot({ pads: [pad("a", { velocity: true })] });
    expect(again.velocityCurve.value).toBe("punchy");
  });

  it("falls back to even for a stored value that is not a curve", () => {
    localStorage.setItem("grimoire_deck_velocity_curve", "loud");
    const deck = boot({ pads: [pad("a")] });
    expect(deck.velocityCurve.value).toBe("even");
  });
});

// ── Tools ──────────────────────────────────────────────────────────────────

describe("tools", () => {
  it("loop flips the saved loop and the playing take (fails if only one of the two happened)", () => {
    const deck = boot({ pads: [pad("m")], sounds: [sound("m", "music")] });
    press(deck);
    deck.dispatch({ type: "tool", tool: "loop", phase: "toggle" });
    press(deck);
    expect(h.updatePad).toHaveBeenCalledWith({ id: "m", patch: { loop: false } });
    expect(h.store.setLooping).toHaveBeenCalledWith("m", false);
  });

  it("loop on a silent pad only saves", () => {
    const deck = boot({ pads: [pad("e")] });
    deck.dispatch({ type: "tool", tool: "loop", phase: "down" });
    press(deck);
    expect(h.updatePad).toHaveBeenCalledWith({ id: "e", patch: { loop: true } });
    expect(h.store.setLooping).not.toHaveBeenCalled();
    expect(h.store.play).not.toHaveBeenCalled();
  });

  it("loop on a playing Spotify pad sets repeat", () => {
    const s = sound("sp", "music", { source_type: "spotify", file_url: "spotify:track:1" });
    const deck = boot({ pads: [pad("sp")], sounds: [s] });
    h.spotify.isPlaying = true;
    h.spotify.lastPlayedUrl = "spotify:track:1";
    h.spotify.repeatMode = 2;
    deck.dispatch({ type: "tool", tool: "loop", phase: "down" });
    press(deck);
    expect(h.spotify.setRepeat).toHaveBeenCalledWith(0); // music loops by default, so this turns it off
  });

  it("stop cuts with a 60 ms fade and nothing starts", () => {
    const deck = boot({ pads: [pad("a")] });
    playing("a");
    deck.dispatch({ type: "tool", tool: "stop", phase: "down" });
    press(deck);
    expect(h.store.fadeOut).toHaveBeenCalledWith("a", 60);
    expect(h.store.play).not.toHaveBeenCalled();
  });

  it("stop on a silent pad does nothing and does not light it as fading (fails if stopping needed no sound)", () => {
    const deck = boot({ pads: [pad("a")] });
    deck.dispatch({ type: "tool", tool: "stop", phase: "down" });
    press(deck);
    expect(h.store.fadeOut).not.toHaveBeenCalled();
    expect(cell(deck).light).toBe("ready");
  });

  it("fade does not start a blocked pad (fails if only the Play tool checked for blocks)", () => {
    const deck = boot({ pads: [pad("a")] });
    h.data.blocked.set("a", "Failed to load");
    deck.dispatch({ type: "tool", tool: "fade", phase: "down" });
    press(deck);
    expect(h.store.play).not.toHaveBeenCalled();
  });

  it("fade fades a playing pad out over 3 s and a silent one in over 3 s", () => {
    const deck = boot({ pads: [pad("a"), pad("b", { grid_row: 1 })] });
    playing("a");
    deck.dispatch({ type: "tool", tool: "fade", phase: "down" });
    press(deck, 0, 0);
    press(deck, 0, 1);
    expect(h.store.fadeOut).toHaveBeenCalledWith("a", 3000);
    expect(h.store.play).toHaveBeenCalledWith("b", expect.any(String), "effects", 0.9, { fadeInMs: 3000, loop: false });
  });

  it("solo solos the pad's sounds, and pressing the soloed pad clears it (fails if solo never toggled off)", () => {
    const deck = boot({ pads: [pad("a", {}, ["s1", "s2"])] });
    deck.dispatch({ type: "tool", tool: "solo", phase: "toggle" });
    press(deck);
    expect(h.store.setSolo).toHaveBeenCalledWith(["s1", "s2"]);
    h.store.soloIds = ["s1", "s2"];
    expect(cell(deck).soloed).toBe(true);
    press(deck);
    expect(h.store.setSolo).toHaveBeenLastCalledWith(null);
  });

  it("solo on a running scene solos its layers; on an idle scene it fetches its tracks", async () => {
    const deck = boot({
      pads: [pad("sc", { playlist_id: "pl" }, [])],
      sounds: [],
      playlists: [playlist("pl", "ambient")],
    });
    deck.dispatch({ type: "tool", tool: "solo", phase: "toggle" });
    h.fetchTracks.mockResolvedValue([track("pl", "r"), track("pl", "w")]);
    press(deck);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.store.setSolo).toHaveBeenCalledWith(["r", "w"]);
    h.store.setSolo.mockClear();
    h.store.activeAmbientPlaylists = [{ playlistId: "pl", soundIds: ["r"], paused: false }];
    press(deck);
    expect(h.store.setSolo).toHaveBeenCalledWith(["r"]);
  });

  it("volume does nothing on a press", () => {
    const deck = boot({ pads: [pad("a")] });
    deck.dispatch({ type: "tool", tool: "volume", phase: "down" });
    press(deck);
    expect(h.store.play).not.toHaveBeenCalled();
    expect(h.updatePad).not.toHaveBeenCalled();
    expect(h.store.setVolume).not.toHaveBeenCalled();
  });

  it("edit raises an edit request that clear consumes, and never plays (fails if the request were never set)", () => {
    const deck = boot({ pads: [pad("a")] });
    deck.dispatch({ type: "tool", tool: "edit", phase: "down" });
    press(deck);
    expect(deck.editRequest.value).toEqual({ padId: "a" });
    expect(h.store.play).not.toHaveBeenCalled();
    deck.clearEditRequest();
    expect(deck.editRequest.value).toBeNull();
  });

  it("edit on an empty slot raises nothing", () => {
    const deck = boot({ pads: [pad("a")] });
    deck.dispatch({ type: "tool", tool: "edit", phase: "down" });
    press(deck, 4, 0);
    expect(deck.editRequest.value).toBeNull();
  });
});

describe("tool state", () => {
  it("a held tool beats the locked one and gives it back on release (fails if held did not win)", () => {
    const deck = boot({ pads: [pad("a")] });
    deck.dispatch({ type: "tool", tool: "loop", phase: "toggle" });
    deck.dispatch({ type: "tool", tool: "stop", phase: "down" });
    expect(deck.snapshot.value.tool).toBe("stop");
    expect(deck.snapshot.value.lockedTool).toBe("loop");
    deck.dispatch({ type: "tool", tool: "stop", phase: "up" });
    expect(deck.snapshot.value.tool).toBe("loop");
  });

  it("toggling the locked tool, or play, returns to play", () => {
    const deck = boot({ pads: [pad("a")] });
    deck.dispatch({ type: "tool", tool: "fade", phase: "toggle" });
    deck.dispatch({ type: "tool", tool: "fade", phase: "toggle" });
    expect(deck.snapshot.value.lockedTool).toBe("play");
    deck.dispatch({ type: "tool", tool: "fade", phase: "toggle" });
    deck.dispatch({ type: "tool", tool: "play", phase: "toggle" });
    expect(deck.snapshot.value.lockedTool).toBe("play");
  });

  it("two held tools unwind in order", () => {
    const deck = boot({ pads: [pad("a")] });
    deck.dispatch({ type: "tool", tool: "stop", phase: "down" });
    deck.dispatch({ type: "tool", tool: "solo", phase: "down" });
    expect(deck.snapshot.value.tool).toBe("solo");
    deck.dispatch({ type: "tool", tool: "solo", phase: "up" });
    expect(deck.snapshot.value.tool).toBe("stop");
  });
});

describe("hush", () => {
  it("is on while held and off after (fails if up did not release it)", async () => {
    const deck = boot({ pads: [] });
    deck.dispatch({ type: "hush", phase: "down" });
    expect(deck.snapshot.value.hush).toBe(true);
    await Promise.resolve();
    expect(h.store.setHush).toHaveBeenLastCalledWith(true);
    h.store.hushed = true;
    deck.dispatch({ type: "hush", phase: "up" });
    await Promise.resolve();
    expect(h.store.setHush).toHaveBeenLastCalledWith(false);
  });

  it("a tap locks it on, and releasing after the lock does not drop it (fails if up ignored the lock)", async () => {
    const deck = boot({ pads: [] });
    for (const phase of ["down", "up", "toggle"] as const) deck.dispatch({ type: "hush", phase });
    await Promise.resolve();
    expect(deck.snapshot.value.hush).toBe(true);
    expect(h.store.setHush).toHaveBeenCalledTimes(1); // no dip in between
    expect(h.store.setHush).toHaveBeenCalledWith(true);
    h.store.hushed = true;
    deck.dispatch({ type: "hush", phase: "down" });
    deck.dispatch({ type: "hush", phase: "up" });
    await Promise.resolve();
    expect(deck.snapshot.value.hush).toBe(true);
    deck.dispatch({ type: "hush", phase: "toggle" });
    expect(deck.snapshot.value.hush).toBe(false);
  });
});

// ── Global actions and pages ───────────────────────────────────────────────

describe("global actions", () => {
  it("fadeAll fades the store over 3 s and pauses a playing Spotify", () => {
    const deck = boot({ pads: [pad("a")] });
    h.spotify.isPlaying = true;
    deck.dispatch({ type: "fadeAll" });
    expect(h.store.fadeOutAll).toHaveBeenCalledWith(3000);
    expect(h.spotify.pause).toHaveBeenCalled();
  });

  it("stopAll stops the store and Spotify; pauseAll toggles; master sets the level", () => {
    const deck = boot({ pads: [] });
    h.spotify.isPlaying = true;
    deck.dispatch({ type: "stopAll" });
    deck.dispatch({ type: "pauseAll" });
    deck.dispatch({ type: "master", value: 0.4 });
    expect(h.store.stopAll).toHaveBeenCalled();
    expect(h.spotify.pause).toHaveBeenCalled();
    expect(h.store.togglePauseAll).toHaveBeenCalled();
    expect(h.store.setMasterVolume).toHaveBeenCalledWith(0.4);
  });

  it("does not poke a Spotify that is not playing", () => {
    const deck = boot({ pads: [] });
    deck.dispatch({ type: "stopAll" });
    expect(h.spotify.pause).not.toHaveBeenCalled();
  });

  it("page and pageStep move the active page, clamped; a missing id means the first page", () => {
    const deck = boot({ pads: [], pages: [page("p1"), page("p2"), page("p3")] });
    expect(deck.snapshot.value.pageIndex).toBe(0);
    deck.dispatch({ type: "pageStep", delta: 1 });
    expect(h.ui.soundboardActivePage).toBe("p2");
    deck.dispatch({ type: "page", index: 2 });
    deck.dispatch({ type: "pageStep", delta: 1 });
    expect(h.ui.soundboardActivePage).toBe("p3");
    deck.dispatch({ type: "page", index: 9 });
    expect(h.ui.soundboardActivePage).toBe("p3");
    h.ui.soundboardActivePage = "gone";
    expect(deck.snapshot.value.pageIndex).toBe(0);
  });
});

describe("padVolume", () => {
  it("moves the level now and saves once after the pause, last value winning (fails if every drag step wrote)", () => {
    const deck = boot({ pads: [pad("a")] });
    deck.dispatch({ type: "padVolume", lane: 0, row: 0, value: 0.2 });
    deck.dispatch({ type: "padVolume", lane: 0, row: 0, value: 0.6 });
    expect(h.store.setVolume).toHaveBeenLastCalledWith("a", 0.6);
    expect(cell(deck).volume).toBe(0.6);
    vi.advanceTimersByTime(399);
    expect(h.updatePad).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(h.updatePad).toHaveBeenCalledTimes(1);
    expect(h.updatePad.mock.calls[0][0]).toEqual({ id: "a", patch: { volume: 0.6 } });
  });

  it("clamps to 0..1 and ignores an empty slot", () => {
    const deck = boot({ pads: [pad("a")] });
    deck.dispatch({ type: "padVolume", lane: 0, row: 0, value: 4 });
    deck.dispatch({ type: "padVolume", lane: 6, row: 0, value: 0.5 });
    expect(cell(deck).volume).toBe(1);
    expect(h.store.setVolume).toHaveBeenCalledTimes(1);
  });

  // Fails if the dragged level is only dropped when the saved one reads back
  // equal: a float4 column never returns a knob's 64/127 exactly, so the drag
  // stuck forever and hid every later change, a co-DM's included.
  it("lets the saved level take over once the save is back, though a float4 rounds it", async () => {
    const deck = boot({ pads: [pad("a")] });
    deck.dispatch({ type: "padVolume", lane: 0, row: 0, value: 64 / 127 });
    vi.advanceTimersByTime(400);
    const callbacks = h.updatePad.mock.calls[0][1] as { onSuccess: () => void };
    callbacks.onSuccess();
    h.data.pads.value = [pad("a", { volume: 0.503937 })];
    await nextTick();
    expect(cell(deck).volume).toBe(0.503937);
    h.data.pads.value = [pad("a", { volume: 0.3 })];
    await nextTick();
    expect(cell(deck).volume).toBe(0.3);
  });

  it("does not lose the last drag when the deck is torn down", () => {
    const deck = boot({ pads: [pad("a")] });
    deck.dispatch({ type: "padVolume", lane: 0, row: 0, value: 0.3 });
    scope.stop();
    expect(h.updatePad.mock.calls[0][0]).toEqual({ id: "a", patch: { volume: 0.3 } });
  });
});

// ── Scenes and playlists ───────────────────────────────────────────────────

describe("scene and playlist pads", () => {
  it("starts a scene from the cached tracks and stops it by id (fails if the scene was played as a music playlist)", () => {
    h.data.byPlaylist.value = new Map([["pl", [track("pl", "r")]]]);
    const deck = boot({ pads: [pad("sc", { playlist_id: "pl" }, [])], sounds: [], playlists: [playlist("pl", "ambient")] });
    press(deck);
    expect(h.store.playAmbientPlaylist).toHaveBeenCalledWith(expect.objectContaining({ id: "pl" }), [track("pl", "r")]);
    h.store.activeAmbientPlaylists = [{ playlistId: "pl", soundIds: ["r"], paused: false }];
    press(deck);
    expect(h.store.stopAmbientPlaylist).toHaveBeenCalledWith("pl");
  });

  it("fetches the tracks when the cache has none yet", async () => {
    h.fetchTracks.mockResolvedValue([track("pl", "x")]);
    const deck = boot({ pads: [pad("mp", { playlist_id: "pl" }, [])], sounds: [], playlists: [playlist("pl", "music")] });
    press(deck);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.store.playMusicPlaylist).toHaveBeenCalledWith(expect.objectContaining({ id: "pl" }), [track("pl", "x")]);
  });

  // Fails if the fetched tracks start whatever happened meanwhile: the DM
  // pressed the Toggle pad again to cancel, and the music starts anyway.
  it("cancels a playlist press that is stopped while its tracks load", async () => {
    let deliver: (tracks: unknown[]) => void = () => undefined;
    h.fetchTracks.mockReturnValueOnce(new Promise((resolve) => (deliver = resolve)));
    const deck = boot({ pads: [pad("mp", { playlist_id: "pl" }, [])], sounds: [], playlists: [playlist("pl", "music")] });
    press(deck);
    press(deck);
    deliver([track("pl", "x")]);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.store.playMusicPlaylist).not.toHaveBeenCalled();
    expect(h.fetchTracks).toHaveBeenCalledTimes(1);
  });

  it("stops a music playlist with stopMusicPlaylist", () => {
    const deck = boot({ pads: [pad("mp", { playlist_id: "pl" }, [])], sounds: [], playlists: [playlist("pl", "music")] });
    h.store.activeMusicPlaylist = { playlistId: "pl", trackSoundIds: ["a", "b"], currentIndex: 1, paused: false };
    press(deck);
    expect(h.store.stopMusicPlaylist).toHaveBeenCalled();
  });

  it("treats a pad whose playlist is missing as an empty slot", () => {
    const deck = boot({ pads: [pad("x", { playlist_id: "gone" }, [])], sounds: [], playlists: [] });
    expect(cell(deck).padId).toBeNull();
    press(deck);
    expect(h.fetchTracks).not.toHaveBeenCalled();
  });

  it("reports layers and tracks, and the track number while a playlist plays", () => {
    h.data.byPlaylist.value = new Map([
      ["sc", [track("sc", "a"), track("sc", "b"), track("sc", "c")]],
      ["mp", [track("mp", "a"), track("mp", "b")]],
    ]);
    const deck = boot({
      pads: [pad("s", { playlist_id: "sc", lane: 0 }, []), pad("m", { playlist_id: "mp", lane: 1 }, [])],
      sounds: [],
      playlists: [playlist("sc", "ambient"), playlist("mp", "music")],
    });
    expect(cell(deck, 0, 0).meta).toBe("3 layers");
    expect(cell(deck, 1, 0).meta).toBe("2 tracks");
    h.store.activeMusicPlaylist = { playlistId: "mp", trackSoundIds: ["a", "b"], currentIndex: 1, paused: false };
    expect(cell(deck, 1, 0).meta).toBe("2/2");
  });

  it("does not call a paused scene audible (fails if paused still lit the pad)", () => {
    const deck = boot({ pads: [pad("sc", { playlist_id: "pl" }, [])], sounds: [], playlists: [playlist("pl", "ambient")] });
    h.store.activeAmbientPlaylists = [{ playlistId: "pl", soundIds: ["r"], paused: true }];
    expect(cell(deck).light).toBe("ready");
    h.store.activeAmbientPlaylists = [{ playlistId: "pl", soundIds: ["r"], paused: false }];
    expect(cell(deck).light).toBe("looping");
  });
});

// ── Spotify ────────────────────────────────────────────────────────────────

describe("spotify pads", () => {
  const sp = sound("sp", "music", { source_type: "spotify", file_url: "spotify:track:1" });

  it("plays through the Spotify store with repeat for a loop, and not through the engine (fails if it hit the store)", async () => {
    const deck = boot({ pads: [pad("sp")], sounds: [sp] });
    press(deck);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.spotify.play).toHaveBeenCalledWith("spotify:track:1");
    expect(h.spotify.setRepeat).toHaveBeenCalledWith(2);
    expect(h.store.play).not.toHaveBeenCalled();
  });

  it("lights as playing and stops by pausing Spotify", () => {
    const deck = boot({ pads: [pad("sp")], sounds: [sp] });
    h.spotify.isPlaying = true;
    h.spotify.lastPlayedUrl = "spotify:track:1";
    expect(cell(deck).light).toBe("playing"); // music loops by default, but Spotify repeat is still off
    press(deck); // toggle: audible, so stop
    expect(h.spotify.pause).toHaveBeenCalled();
    expect(h.store.fadeOut).not.toHaveBeenCalled();
  });

  it("is not audible when another track is the one playing", () => {
    const deck = boot({ pads: [pad("sp")], sounds: [sp] });
    h.spotify.isPlaying = true;
    h.spotify.lastPlayedUrl = "spotify:track:other";
    expect(cell(deck).light).toBe("ready");
  });

  it("says nothing about the device when not sharing", () => {
    const deck = boot({ pads: [pad("sp")], sounds: [sp] });
    expect(cell(deck).meta).toBeNull();
  });

  it("says this device only while sharing, and stays playable", () => {
    const deck = boot({ pads: [pad("sp")], sounds: [sp] });
    h.data.sharing.value = true;
    expect(cell(deck).meta).toBe("Spotify: this device only");
    expect(cell(deck).light).toBe("ready");
    press(deck);
    expect(h.spotify.play).toHaveBeenCalled();
  });

  it("does not play while Spotify is not ready", () => {
    const deck = boot({ pads: [pad("sp")], sounds: [sp] });
    h.data.blocked.set("sp", "Connecting to Spotify device…");
    press(deck);
    expect(h.spotify.play).not.toHaveBeenCalled();
    expect(cell(deck).light).toBe("blocked");
  });

  it("counts Spotify in the audible total", () => {
    const deck = boot({ pads: [] });
    h.store.activeAudioCount = 2;
    h.spotify.isPlaying = true;
    expect(deck.snapshot.value.audibleCount).toBe(3);
  });
});

// ── Snapshot ───────────────────────────────────────────────────────────────

describe("snapshot lights", () => {
  it("walks ready, playing, looping (fails if a loop never showed)", () => {
    const deck = boot({ pads: [pad("e")] });
    expect(cell(deck).light).toBe("ready");
    playing("e");
    expect(cell(deck).light).toBe("playing");
    h.store.playbackStates["e"].isLooping = true;
    expect(cell(deck).light).toBe("looping");
  });

  it("is fading for the length of the fade-out after the deck stops a pad, then ready (fails if the window never ended)", () => {
    const deck = boot({ pads: [pad("m", { fade_out_ms: 1000 })], sounds: [sound("m", "music")] });
    press(deck);
    h.store.fadeOut.mockImplementation(() => undefined); // the sound is still audible while it fades
    press(deck);
    expect(cell(deck).light).toBe("fading");
    vi.advanceTimersByTime(999);
    expect(cell(deck).light).toBe("fading");
    vi.advanceTimersByTime(1);
    h.store.playbackStates["m"].isPlaying = false;
    expect(cell(deck).light).toBe("ready");
  });

  it("ducks audible pads that are not the soloed one (fails if solo left everything lit alike)", () => {
    const deck = boot({ pads: [pad("a", { lane: 0 }), pad("b", { lane: 1 })] });
    playing("a");
    playing("b");
    h.store.soloIds = ["a"];
    expect(cell(deck, 0, 0).light).toBe("playing");
    expect(cell(deck, 0, 0).soloed).toBe(true);
    expect(cell(deck, 1, 0).light).toBe("ducked");
  });

  it("does not duck a silent pad", () => {
    const deck = boot({ pads: [pad("a", { lane: 0 }), pad("b", { lane: 1 })] });
    playing("a");
    h.store.soloIds = ["a"];
    expect(cell(deck, 1, 0).light).toBe("ready");
  });

  it("blocked comes from the playback check and is lit only while silent", () => {
    const deck = boot({ pads: [pad("w")] });
    h.data.blocked.set("w", "WebM: cannot play in Safari");
    expect(cell(deck).light).toBe("blocked");
    expect(cell(deck).blockedReason).toBe("WebM: cannot play in Safari");
  });

  it("fills a cell's description from the pad and its defaults", () => {
    const deck = boot({
      pads: [pad("a", { name: "Boom", launch_mode: "gate", grid_row: 0 }, ["s1", "s2"])],
    });
    const c = cell(deck);
    expect(c).toMatchObject({
      padId: "a",
      kind: "sound",
      category: "effects",
      name: "Boom",
      mode: "gate",
      modeIsDefault: false,
      takes: 2,
      nextTake: 0,
      volume: 0.8,
      loop: false,
      keyLabel: "1",
      meta: null,
    });
    press(deck);
    release(deck);
    expect(cell(deck).nextTake).toBe(1);
  });

  it("names a pad after its first sound, else its playlist", () => {
    const deck = boot({
      pads: [pad("a"), pad("s", { playlist_id: "pl", lane: 1 }, [])],
      playlists: [playlist("pl", "ambient")],
    });
    expect(cell(deck, 0, 0).name).toBe("Sound a");
    expect(cell(deck, 1, 0).name).toBe("PL pl");
  });

  it("shows progress of what plays, never dividing by an unknown duration", () => {
    const deck = boot({ pads: [pad("a")] });
    playing("a", { currentTime: 3, duration: 12 });
    expect(cell(deck).progress).toBe(0.25);
    h.store.playbackStates["a"].duration = 0;
    expect(cell(deck).progress).toBe(0);
  });

  it("lays out rows row-major, eight lanes wide, with empty slots off", () => {
    const deck = boot({ pads: [pad("a", { lane: 3, grid_row: 1 })] });
    const snap = deck.snapshot.value;
    expect(snap.rows).toBe(2);
    expect(snap.cells).toHaveLength(16);
    expect(snap.cells[8 + 3].padId).toBe("a");
    expect(snap.cells[0]).toMatchObject({ padId: null, light: "off", lane: 0, row: 0 });
    expect(snap.lanes).toHaveLength(8);
  });

  it("colours a lane by what most of its pads are", () => {
    const deck = boot({
      pads: [pad("a", { lane: 0, grid_row: 0 }), pad("b", { lane: 0, grid_row: 1 }), pad("c", { lane: 0, grid_row: 2 })],
      sounds: [sound("a", "music"), sound("b", "music"), sound("c", "effects")],
    });
    expect(deck.snapshot.value.lanes[0].category).toBe("music");
    expect(deck.snapshot.value.lanes[1].category).toBe("effects");
  });

  it("is a new object on every change, not the old one mutated (fails if the MIDI diff would miss a change)", () => {
    const deck = boot({ pads: [pad("a")] });
    const before = deck.snapshot.value;
    playing("a");
    const after = deck.snapshot.value;
    expect(after).not.toBe(before);
    expect(after.cells).not.toBe(before.cells);
    expect(before.cells[0].light).toBe("ready");
    expect(after.cells[0].light).toBe("playing");
    h.store.masterVolume = 0.5;
    expect(deck.snapshot.value).not.toBe(after);
    expect(deck.snapshot.value.masterVolume).toBe(0.5);
  });

  it("reads pause state from the store and survives having no pages", () => {
    const deck = boot({ pads: [], pages: [] });
    h.store.isPausedAll = true;
    const snap = deck.snapshot.value;
    expect(snap.paused).toBe(true);
    expect(snap.pageIndex).toBe(-1);
    expect(snap.cells).toHaveLength(8);
    expect(snap.lanes).toHaveLength(8);
    press(deck);
    expect(h.store.play).not.toHaveBeenCalled();
  });
});

// ── Guests: audio a trigger started ────────────────────────────────────────

type Trig = NonNullable<typeof h.data.music.value>;
const fightMusic: Trig = { sourceId: "enc1", label: "Goblin ambush", kind: "encounter", slot: "music", target: "battle" };
const mill: Trig = { sourceId: "loc1", label: "The Mill", kind: "location", slot: "ambient", target: "mill" };

/** The store as it is while a trigger's music plays. */
function fightPlaying() {
  h.store.activeMusicPlaylist = { playlistId: "battle", trackSoundIds: ["b1"], currentIndex: 0, paused: false };
  h.data.music.value = fightMusic;
}

describe("guest pads", () => {
  it("shows triggered music in the first free row of the music lane, from its label (fails if the guest never reached the grid)", () => {
    const deck = boot({ pads: [pad("a")], playlists: [playlist("battle", "music")] });
    fightPlaying();
    const guest = cell(deck, 0, 1);
    expect(guest.guest).toEqual({ sourceId: "enc1", label: "Goblin ambush", target: "battle" });
    expect(guest.padId).toBeNull();
    expect(guest.kind).toBe("playlist");
    expect(guest.name).toBe("PL battle");
    expect(guest.meta).toBe("From Goblin ambush");
    expect(guest.light).toBe("playing");
  });

  it("shows no guest when a pad on the page already holds the target (that pad lights instead)", () => {
    const deck = boot({ pads: [pad("mp", { playlist_id: "battle" }, [])], sounds: [], playlists: [playlist("battle", "music")] });
    fightPlaying();
    expect(deck.snapshot.value.cells.filter((c) => c.guest !== null)).toHaveLength(0);
    expect(cell(deck).light).toBe("playing");
  });

  it("shows no guest for a beat's loose effect", () => {
    const deck = boot({ pads: [], sounds: [sound("zap", "effects")] });
    playing("zap");
    h.data.ambient.value = [{ sourceId: "b1", label: "Beat", kind: "beat", slot: "ambient", target: "sound:zap" }];
    expect(deck.snapshot.value.cells.filter((c) => c.guest !== null)).toHaveLength(0);
  });

  it("pressing a guest stops the music directly, never releasing the trigger (fails if it went through the bus)", () => {
    const deck = boot({ pads: [pad("a")], playlists: [playlist("battle", "music")] });
    fightPlaying();
    press(deck, 0, 1);
    expect(h.store.stopMusicPlaylist).toHaveBeenCalledTimes(1);
  });

  it("pressing a scene guest stops that scene; a loose sound fades out over the Stop tool's 60 ms", () => {
    const deck = boot({ pads: [], sounds: [sound("rain", "ambient")], playlists: [playlist("mill", "ambient")] });
    h.store.activeAmbientPlaylists = [{ playlistId: "mill", soundIds: ["m1"], paused: false }];
    h.data.ambient.value = [mill, { sourceId: "b2", label: "Storm", kind: "beat", slot: "ambient", target: "sound:rain" }];
    playing("rain");
    expect(cell(deck, 1, 0).kind).toBe("scene");
    press(deck, 1, 0);
    expect(h.store.stopAmbientPlaylist).toHaveBeenCalledWith("mill");
    deck.dispatch({ type: "tool", tool: "stop", phase: "down" });
    press(deck, 2, 0);
    expect(h.store.fadeOut).toHaveBeenCalledWith("rain", 60);
  });

  it("the Fade tool fades a guest over 3 s; Loop does nothing to it", () => {
    const deck = boot({ pads: [], sounds: [sound("rain", "ambient")] });
    playing("rain");
    h.data.ambient.value = [{ sourceId: "b2", label: "Storm", kind: "beat", slot: "ambient", target: "sound:rain" }];
    deck.dispatch({ type: "tool", tool: "loop", phase: "down" });
    press(deck, 2, 0);
    expect(h.store.fadeOut).not.toHaveBeenCalled();
    deck.dispatch({ type: "tool", tool: "loop", phase: "up" });
    deck.dispatch({ type: "tool", tool: "fade", phase: "down" });
    press(deck, 2, 0);
    expect(h.store.fadeOut).toHaveBeenCalledWith("rain", 3000);
  });

  it("keep makes the guest a pad in its slot with the playlist, or the sound as its take (fails if a field was wrong)", () => {
    const deck = boot({ pads: [pad("a")], sounds: [sound("a"), sound("rain", "ambient")], playlists: [playlist("battle", "music")] });
    fightPlaying();
    deck.dispatch({ type: "keep", lane: 0, row: 1 });
    expect(h.createPad.mock.calls[0][0]).toEqual({ pad: { page_id: "p1", lane: 0, grid_row: 1, playlist_id: "battle" } });
    playing("rain");
    h.data.ambient.value = [{ sourceId: "b2", label: "Storm", kind: "beat", slot: "ambient", target: "sound:rain" }];
    deck.dispatch({ type: "keep", lane: 2, row: 0 });
    expect(h.createPad.mock.calls[1][0]).toEqual({ pad: { page_id: "p1", lane: 2, grid_row: 0 }, soundIds: ["rain"] });
  });

  it("keep on a slot that is not a guest does nothing, and a failed keep says so (fails if the error were swallowed)", () => {
    const deck = boot({ pads: [pad("a")], playlists: [playlist("battle", "music")] });
    deck.dispatch({ type: "keep", lane: 0, row: 1 });
    expect(h.createPad).not.toHaveBeenCalled();
    fightPlaying();
    deck.dispatch({ type: "keep", lane: 0, row: 1 });
    h.createPad.mock.calls[0][1].onError(new Error("x"));
    expect(h.toastError).toHaveBeenCalledWith("Could not keep that on the deck.");
  });

  it("pressing a pad in a 'one' lane stops the lane's guest (fails if only pads yielded)", () => {
    const deck = boot({ pads: [pad("a")], playlists: [playlist("battle", "music")] });
    fightPlaying();
    press(deck, 0, 0);
    expect(h.store.stopMusicPlaylist).toHaveBeenCalled();
  });

  // A Repeat pad held on one page keeps firing after the DM turns to another.
  // Fails if its lane mates were read off the page on screen: it would stop
  // that page's guest, which is in a different deck altogether.
  it("a pad still firing from another page leaves this page's guest alone", () => {
    const deck = boot({
      pads: [pad("r", { launch_mode: "repeat", repeat_ms: 200 })],
      playlists: [playlist("battle", "music")],
      pages: [page("p1"), page("p2")],
    });
    press(deck, 0, 0);
    deck.dispatch({ type: "page", index: 1 });
    fightPlaying();
    vi.advanceTimersByTime(250);
    expect(h.store.stopMusicPlaylist).not.toHaveBeenCalled();
  });
});

describe("trigger arrival", () => {
  it("in a 'one' lane stops a loose music pad that plays something else (fails if arrival left both playing)", async () => {
    const deck = boot({ pads: [pad("loose", { lane: 0 }, ["l1"])], sounds: [sound("l1", "music")], playlists: [playlist("battle", "music")] });
    playing("l1");
    expect(deck.snapshot.value.rows).toBe(1);
    fightPlaying();
    await nextTick();
    expect(h.store.fadeOut).toHaveBeenCalledWith("l1", 1500);
  });

  it("leaves the pad alone when the trigger plays that very thing", async () => {
    boot({ pads: [pad("mp", { playlist_id: "battle" }, [])], sounds: [], playlists: [playlist("battle", "music")] });
    h.store.activeMusicPlaylist = { playlistId: "battle", trackSoundIds: ["b1"], currentIndex: 0, paused: false };
    h.data.music.value = fightMusic;
    await nextTick();
    expect(h.store.stopMusicPlaylist).not.toHaveBeenCalled();
  });

  it("in a 'together' lane stops nothing (fails if every arrival cleared its lane)", async () => {
    const lanes = DEFAULT_LANES.map((lane) => (lane.feed === "music" ? { ...lane, rule: "together" as const } : lane));
    boot({ pads: [pad("loose", { lane: 0 }, ["l1"])], sounds: [sound("l1", "music")], playlists: [playlist("battle", "music")], pages: [page("p1", lanes)] });
    playing("l1");
    fightPlaying();
    await nextTick();
    expect(h.store.fadeOut).not.toHaveBeenCalled();
  });

  it("a trigger that was already there stops nothing when something else changes (fails if every change counted as an arrival)", async () => {
    boot({ pads: [pad("loose", { lane: 0 }, ["l1"])], sounds: [sound("l1", "music")], playlists: [playlist("battle", "music")] });
    fightPlaying();
    await nextTick();
    playing("l1");
    h.data.ambient.value = [];
    await nextTick();
    expect(h.store.fadeOut).not.toHaveBeenCalled();
  });
});
