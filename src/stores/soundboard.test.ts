import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import type { AudioBus } from "@/lib/audioEngine";

// ── Engine double ──────────────────────────────────────────────────────────
//
// The store's job is orchestration: which bus a sound lands on, when a fade or
// a duck fires, and whether playback state tells the truth. The DSP itself is
// covered by audioEngine.test.ts, so here the engine is a spy.

const engineCalls = {
  attach: vi.fn<(soundId: string, el: HTMLAudioElement, bus: AudioBus) => void>(),
  detach: vi.fn(),
  setSoundVolume: vi.fn<(soundId: string, volume: number, rampMs?: number) => void>(),
  setSoundTrim: vi.fn(),
  setBusVolume: vi.fn(),
  setMasterVolume: vi.fn(),
  fadeIn: vi.fn<(soundId: string, ms: number) => void>(),
  fadeOut: vi.fn<(soundId: string, ms: number) => Promise<void>>(() => Promise.resolve()),
  duck: vi.fn(),
  unduck: vi.fn(),
  setEffect: vi.fn(),
  setPan: vi.fn<(soundId: string, pan: number) => void>(),
  resume: vi.fn(),
};

let engineAvailable = true;

vi.mock("@/lib/audioEngine", () => ({
  getAudioEngine: () => ({
    get available() {
      return engineAvailable;
    },
    ...engineCalls,
  }),
}));

// ── HTMLAudioElement double ────────────────────────────────────────────────

interface FakeAudio {
  src: string;
  crossOrigin: string | null;
  preload: string;
  volume: number;
  loop: boolean;
  currentTime: number;
  duration: number;
  paused: boolean;
  play: () => Promise<void>;
  pause: () => void;
  onerror: (() => void) | null;
  ontimeupdate: (() => void) | null;
  onended: (() => void) | null;
}

const created: FakeAudio[] = [];
/** When set, the next play() rejects — simulates the browser blocking autoplay. */
let rejectNextPlay = false;

function installAudioStub(): void {
  created.length = 0;
  class StubAudio implements FakeAudio {
    src = "";
    crossOrigin: string | null = null;
    preload = "";
    volume = 1;
    loop = false;
    currentTime = 0;
    duration = 120;
    paused = true;
    onerror: (() => void) | null = null;
    ontimeupdate: (() => void) | null = null;
    onended: (() => void) | null = null;
    constructor() {
      created.push(this);
    }
    play(): Promise<void> {
      if (rejectNextPlay) {
        rejectNextPlay = false;
        return Promise.reject(new Error("NotAllowedError"));
      }
      this.paused = false;
      return Promise.resolve();
    }
    pause(): void {
      this.paused = true;
    }
  }
  vi.stubGlobal("Audio", StubAudio);
}

/** Let queued promise callbacks (play().then/catch, fadeOut().then) run. */
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function loadStore() {
  const mod = await import("@/stores/soundboard");
  return mod.useSoundboardStore();
}

beforeEach(async () => {
  vi.resetModules();
  Object.values(engineCalls).forEach((fn) => fn.mockClear());
  engineCalls.fadeOut.mockImplementation(() => Promise.resolve());
  engineAvailable = true;
  rejectNextPlay = false;
  installAudioStub();
  setActivePinia(createPinia());
});

describe("bus routing", () => {
  it("routes a music sound to the music bus", async () => {
    const store = await loadStore();
    store.play("s1", "https://example.test/a.mp3", "music");
    expect(engineCalls.attach).toHaveBeenCalledWith("s1", expect.anything(), "music");
  });

  it("routes an effects sound to the effects bus", async () => {
    const store = await loadStore();
    store.play("s1", "https://example.test/a.mp3", "effects");
    expect(engineCalls.attach).toHaveBeenCalledWith("s1", expect.anything(), "effects");
  });

  it("routes an uncategorised sound to ambient, so it can never duck the bed under itself", async () => {
    const store = await loadStore();
    store.play("s1", "https://example.test/a.mp3");
    expect(engineCalls.attach).toHaveBeenCalledWith("s1", expect.anything(), "ambient");
  });

  it("keeps a music sound on the music bus when an effect is applied to it", async () => {
    // Regression: setEffect used to hardcode "ambient", silently moving a
    // playing music/effects sound off its own bus fader and, for effects,
    // onto the one bus that IS ducked.
    const store = await loadStore();
    store.play("s1", "https://example.test/a.mp3", "music");
    engineCalls.attach.mockClear();

    store.setEffect("s1", "https://example.test/a.mp3", "cave", "music");
    expect(engineCalls.attach).toHaveBeenCalledWith("s1", expect.anything(), "music");
  });

  it("keeps an effects sound off the ambient (ducked) bus when an effect is applied to it", async () => {
    const store = await loadStore();
    store.play("s1", "https://example.test/a.mp3", "effects");
    engineCalls.attach.mockClear();

    store.setEffect("s1", "https://example.test/a.mp3", "through_door", "effects");
    expect(engineCalls.attach).toHaveBeenCalledWith("s1", expect.anything(), "effects");
  });

  it("routes the active music-playlist track's bus effect to the music bus", async () => {
    const store = await loadStore();
    store.playMusicPlaylist(
      { id: "pl1", name: "Tavern Tunes", shuffle: false, repeat: false },
      [
        {
          id: "t1",
          playlist_id: "pl1",
          sort_order: 0,
          sound: {
            id: "s1",
            name: "Jig",
            file_url: "https://example.test/a.mp3",
            gain_trim: 1,
            artist: null,
            thumbnail_url: null,
          },
        } as never,
      ],
    );
    engineCalls.attach.mockClear();

    store.setMusicPlaylistEffect("cave");
    expect(engineCalls.attach).toHaveBeenCalledWith("s1", expect.anything(), "music");
  });
});

describe("playback state truthfulness", () => {
  it("marks a sound playing once play() actually resolves", async () => {
    const store = await loadStore();
    store.play("s1", "https://example.test/a.mp3", "music");
    await flush();
    expect(store.getState("s1").isPlaying).toBe(true);
  });

  it("leaves isPlaying false when the browser blocks autoplay", async () => {
    const store = await loadStore();
    rejectNextPlay = true;
    store.play("s1", "https://example.test/a.mp3", "music");
    await flush();
    // The old store set isPlaying unconditionally, so the UI showed a playing
    // sound while the room heard silence.
    expect(store.getState("s1").isPlaying).toBe(false);
  });

  it("fades in after a successful start", async () => {
    const store = await loadStore();
    store.play("s1", "https://example.test/a.mp3", "music");
    await flush();
    expect(engineCalls.fadeIn).toHaveBeenCalledWith("s1", expect.any(Number));
  });

  it("does not fade in when the start was rejected", async () => {
    const store = await loadStore();
    rejectNextPlay = true;
    store.play("s1", "https://example.test/a.mp3", "music");
    await flush();
    expect(engineCalls.fadeIn).not.toHaveBeenCalled();
  });
});

describe("ducking", () => {
  it("ducks when an effects one-shot starts", async () => {
    const store = await loadStore();
    store.play("fx1", "https://example.test/fx.mp3", "effects");
    await flush();
    expect(engineCalls.duck).toHaveBeenCalledTimes(1);
  });

  it("does not duck for music", async () => {
    const store = await loadStore();
    store.play("s1", "https://example.test/a.mp3", "music");
    await flush();
    expect(engineCalls.duck).not.toHaveBeenCalled();
  });

  it("ducks once across overlapping one-shots and unducks only when the last ends", async () => {
    const store = await loadStore();
    store.play("fx1", "https://example.test/fx1.mp3", "effects");
    store.play("fx2", "https://example.test/fx2.mp3", "effects");
    await flush();
    expect(engineCalls.duck).toHaveBeenCalledTimes(1);

    store.stop("fx1");
    await flush();
    // fx2 is still going — the bed must stay down.
    expect(engineCalls.unduck).not.toHaveBeenCalled();

    store.stop("fx2");
    await flush();
    expect(engineCalls.unduck).toHaveBeenCalledTimes(1);
  });

  it("treats a repeated release of the same sound as a no-op", async () => {
    const store = await loadStore();
    store.play("fx1", "https://example.test/fx.mp3", "effects");
    await flush();
    store.stop("fx1");
    store.stop("fx1");
    await flush();
    expect(engineCalls.unduck).toHaveBeenCalledTimes(1);
  });
});

describe("fades replace hard cuts", () => {
  it("fades out before pausing the element", async () => {
    const store = await loadStore();
    store.play("s1", "https://example.test/a.mp3", "music");
    await flush();
    const el = created[0];
    expect(el.paused).toBe(false);

    store.stop("s1");
    expect(engineCalls.fadeOut).toHaveBeenCalledWith("s1", expect.any(Number));
    // Still audible until the ramp finishes.
    expect(el.paused).toBe(false);

    await flush();
    expect(el.paused).toBe(true);
  });

  it("does not let a stale fade-out pause a sound that has already restarted", async () => {
    const store = await loadStore();
    store.play("s1", "https://example.test/a.mp3", "music");
    await flush();

    store.stop("s1");
    // Restart before the fade-out callback lands.
    store.play("s1", "https://example.test/a.mp3", "music");
    await flush();

    expect(created[0].paused).toBe(false);
    expect(store.getState("s1").isPlaying).toBe(true);
  });

  it("hard-cuts when Web Audio is unavailable rather than hanging on a fade", async () => {
    engineAvailable = false;
    const store = await loadStore();
    store.play("s1", "https://example.test/a.mp3", "music");
    await flush();
    store.stop("s1");
    expect(created[0].paused).toBe(true);
  });
});

describe("volume", () => {
  it("delegates to the engine gain node when Web Audio is available", async () => {
    const store = await loadStore();
    store.play("s1", "https://example.test/a.mp3", "music");
    await flush();
    engineCalls.setSoundVolume.mockClear();

    store.setVolume("s1", 0.4);
    expect(engineCalls.setSoundVolume).toHaveBeenCalledWith("s1", 0.4, 0);
    // Element stays wide open so the graph owns the level.
    expect(created[0].volume).toBe(1);
  });

  it("falls back to element volume when Web Audio is unavailable", async () => {
    engineAvailable = false;
    const store = await loadStore();
    store.play("s1", "https://example.test/a.mp3", "music");
    await flush();

    store.setVolume("s1", 0.4);
    expect(created[0].volume).toBeCloseTo(0.4);
  });

  it("exposes a master fader", async () => {
    const store = await loadStore();
    store.setMasterVolume(0.5);
    expect(store.masterVolume).toBe(0.5);
    expect(engineCalls.setMasterVolume).toHaveBeenCalledWith(0.5, expect.any(Number));
  });

  it("exposes per-bus faders", async () => {
    const store = await loadStore();
    store.setBusVolume("music", 0.3);
    expect(store.busVolumes.music).toBe(0.3);
    expect(engineCalls.setBusVolume).toHaveBeenCalledWith("music", 0.3, expect.any(Number));
  });

  it("passes a sound's gain trim to the engine", async () => {
    const store = await loadStore();
    store.play("s1", "https://example.test/a.mp3", "music", 0.6);
    expect(engineCalls.setSoundTrim).toHaveBeenCalledWith("s1", 0.6);
  });
});

describe("music playlist advance", () => {
  const tracks = [
    { id: "t1", playlist_id: "p", sound_id: "s1", sort_order: 0, created_at: "", sound: { id: "s1", file_url: "https://example.test/1.mp3", name: "One", artist: null, thumbnail_url: null, gain_trim: 1 } },
    { id: "t2", playlist_id: "p", sound_id: "s2", sort_order: 1, created_at: "", sound: { id: "s2", file_url: "https://example.test/2.mp3", name: "Two", artist: null, thumbnail_url: null, gain_trim: 1 } },
    // Only the fields the store actually reads are populated.
  ] as unknown as Parameters<Awaited<ReturnType<typeof loadStore>>["playMusicPlaylist"]>[1];

  it("crossfades into the next track instead of stopping then starting", async () => {
    const store = await loadStore();
    store.playMusicPlaylist({ id: "p", name: "P", shuffle: false, repeat: false }, tracks);
    await flush();
    engineCalls.fadeIn.mockClear();
    engineCalls.fadeOut.mockClear();

    store.musicPlaylistNext();
    await flush();

    // Outgoing ramps down and incoming ramps up — both scheduled, overlapping.
    expect(engineCalls.fadeOut).toHaveBeenCalledWith("s1", expect.any(Number));
    expect(engineCalls.fadeIn).toHaveBeenCalledWith("s2", expect.any(Number));
    expect(store.activeMusicPlaylist?.currentIndex).toBe(1);
  });

  it("pre-creates the next track's element so its fetch precedes the transition", async () => {
    const store = await loadStore();
    store.playMusicPlaylist({ id: "p", name: "P", shuffle: false, repeat: false }, tracks);
    await flush();
    // Two elements exist after starting only the first track.
    expect(created.length).toBeGreaterThanOrEqual(2);
  });

  it("ends the playlist when the last track finishes without repeat", async () => {
    const store = await loadStore();
    store.playMusicPlaylist({ id: "p", name: "P", shuffle: false, repeat: false }, tracks);
    await flush();
    store.musicPlaylistNext();
    await flush();
    store.musicPlaylistNext();
    await flush();
    expect(store.activeMusicPlaylist).toBeNull();
  });

  it("wraps to the first track when repeat is on", async () => {
    const store = await loadStore();
    store.playMusicPlaylist({ id: "p", name: "P", shuffle: false, repeat: true }, tracks);
    await flush();
    store.musicPlaylistNext();
    store.musicPlaylistNext();
    await flush();
    expect(store.activeMusicPlaylist?.currentIndex).toBe(0);
  });

  it("restarts the current track when prev is pressed more than 3s in", async () => {
    const store = await loadStore();
    store.playMusicPlaylist({ id: "p", name: "P", shuffle: false, repeat: false }, tracks);
    await flush();
    store.getState("s1").currentTime = 10;

    store.musicPlaylistPrev();
    await flush();
    expect(store.activeMusicPlaylist?.currentIndex).toBe(0);
  });
});

describe("teardown", () => {
  it("detaches from the engine when a sound is released", async () => {
    const store = await loadStore();
    store.play("s1", "https://example.test/a.mp3", "music");
    await flush();
    store.releaseSound("s1");
    expect(engineCalls.detach).toHaveBeenCalledWith("s1");
    expect(store.playbackStates.s1).toBeUndefined();
  });

  it("clears ducking when everything stops", async () => {
    const store = await loadStore();
    store.play("fx1", "https://example.test/fx.mp3", "effects");
    await flush();
    store.stopAll();
    expect(engineCalls.unduck).toHaveBeenCalled();
    expect(store.activeMusicPlaylist).toBeNull();
  });

  it("delegates resume to the engine", async () => {
    const store = await loadStore();
    store.resumeAudioEngine();
    expect(engineCalls.resume).toHaveBeenCalled();
  });
});

describe("gapless looping", () => {
  const ambientTracks = [
    { id: "t1", playlist_id: "p", sound_id: "a1", sort_order: 0, created_at: "", sound: { id: "a1", file_url: "https://example.test/bed.mp3", name: "Bed", artist: null, thumbnail_url: null, gain_trim: 1 } },
  ] as unknown as Parameters<Awaited<ReturnType<typeof loadStore>>["playAmbientPlaylist"]>[1];

  it("does not set audio.loop — the seam is covered by a crossfade instead", async () => {
    const store = await loadStore();
    store.playAmbientPlaylist({ id: "p", name: "Scene" }, ambientTracks);
    await flush();
    // audio.loop is not gapless in any browser; relying on it is the bug.
    expect(created[0].loop).toBe(false);
  });

  it("pre-creates the partner element so its fetch precedes the wrap", async () => {
    const store = await loadStore();
    store.playAmbientPlaylist({ id: "p", name: "Scene" }, ambientTracks);
    await flush();
    // One audible element plus one pre-buffered partner.
    expect(created.length).toBeGreaterThanOrEqual(2);
  });

  it("crossfades to the partner as the bed approaches its end", async () => {
    const store = await loadStore();
    store.playAmbientPlaylist({ id: "p", name: "Scene" }, ambientTracks);
    await flush();
    engineCalls.setSoundVolume.mockClear();

    const primary = created[0];
    primary.duration = 60;
    primary.currentTime = 59.9; // inside the crossfade window
    primary.ontimeupdate?.();
    await flush();

    // The partner is ramped up under its own engine id while the primary falls.
    const ramped = engineCalls.setSoundVolume.mock.calls.map((c) => c[0]);
    expect(ramped).toContain("a1::loop");
    expect(engineCalls.fadeOut).toHaveBeenCalledWith("a1", expect.any(Number));
  });

  it("keeps looping past the second pass — the shadow half swaps back", async () => {
    // The regression that shipped: the visible half got its handlers from
    // play(), but the shadow was started raw inside the swap. The pair swapped
    // exactly once, the shadow played its length with nobody watching, and a
    // "looping" tavern died on the second pass — while every generator layer
    // kept firing, which is what made it look haunted rather than broken.
    const store = await loadStore();
    store.playAmbientPlaylist({ id: "p", name: "Scene" }, ambientTracks);
    await flush();

    // First wrap: visible half hands over to the shadow.
    const primary = created[0];
    primary.duration = 60;
    primary.currentTime = 59.9;
    primary.ontimeupdate?.();
    await flush();

    const shadow = created.find((el) => el !== primary);
    expect(shadow).toBeDefined();
    // The half that just became audible must be watched the same way the
    // first one was, or there is no second wrap.
    expect(shadow!.ontimeupdate).not.toBeNull();

    // Second wrap: the shadow approaches its end and must hand back.
    engineCalls.setSoundVolume.mockClear();
    engineCalls.fadeOut.mockClear();
    shadow!.duration = 60;
    shadow!.currentTime = 59.9;
    shadow!.ontimeupdate?.();
    await flush();

    const ramped = engineCalls.setSoundVolume.mock.calls.map((c) => c[0]);
    expect(ramped).toContain("a1");
    expect(engineCalls.fadeOut).toHaveBeenCalledWith("a1::loop", expect.any(Number));
  });

  it("falls back to a plain loop when Web Audio is unavailable", async () => {
    engineAvailable = false;
    const store = await loadStore();
    store.playAmbientPlaylist({ id: "p", name: "Scene" }, ambientTracks);
    await flush();
    // Without a gain graph there is nothing to crossfade with, so the seam is
    // accepted rather than the bed not looping at all.
    expect(created[0].loop).toBe(true);
  });

  it("does not swap while the duration is still unknown", async () => {
    const store = await loadStore();
    store.playAmbientPlaylist({ id: "p", name: "Scene" }, ambientTracks);
    await flush();
    engineCalls.fadeOut.mockClear();

    const primary = created[0];
    primary.duration = NaN; // live stream / not yet resolved
    primary.currentTime = 10;
    primary.ontimeupdate?.();
    await flush();

    expect(engineCalls.fadeOut).not.toHaveBeenCalled();
  });

  it("silences both halves when the scene stops", async () => {
    const store = await loadStore();
    store.playAmbientPlaylist({ id: "p", name: "Scene" }, ambientTracks);
    await flush();
    engineCalls.fadeOut.mockClear();

    store.stopAmbientPlaylist();
    await flush();

    const faded = engineCalls.fadeOut.mock.calls.map((c) => c[0]);
    expect(faded).toContain("a1");
    expect(faded).toContain("a1::loop");
  });
});

describe("resume after OS suspension", () => {
  const tracks = [
    { id: "t1", playlist_id: "p", sound_id: "s1", sort_order: 0, created_at: "", sound: { id: "s1", file_url: "https://example.test/1.mp3", name: "One", artist: null, thumbnail_url: null, gain_trim: 1 } },
    { id: "t2", playlist_id: "p", sound_id: "s2", sort_order: 1, created_at: "", sound: { id: "s2", file_url: "https://example.test/2.mp3", name: "Two", artist: null, thumbnail_url: null, gain_trim: 1 } },
  ] as unknown as Parameters<Awaited<ReturnType<typeof loadStore>>["playMusicPlaylist"]>[1];

  it("re-plays a track the OS paused out from under us", async () => {
    const store = await loadStore();
    store.playMusicPlaylist({ id: "p", name: "P", shuffle: false, repeat: true }, tracks);
    await flush();

    // iOS suspended the element without telling the store.
    created[0].paused = true;
    expect(store.getState("s1").isPlaying).toBe(true);

    store.resumeAudioEngine();
    await flush();

    // This is the CarPlay case: the playlist must keep moving without the
    // driver touching the screen.
    expect(created[0].paused).toBe(false);
  });

  it("leaves a deliberately paused playlist alone", async () => {
    const store = await loadStore();
    store.playMusicPlaylist({ id: "p", name: "P", shuffle: false, repeat: true }, tracks);
    await flush();
    store.pauseMusicPlaylist();
    await flush();

    store.resumeAudioEngine();
    await flush();

    expect(created[0].paused).toBe(true);
  });

  it("does not touch an element that is already playing", async () => {
    const store = await loadStore();
    store.playMusicPlaylist({ id: "p", name: "P", shuffle: false, repeat: true }, tracks);
    await flush();
    expect(created[0].paused).toBe(false);

    store.resumeAudioEngine();
    await flush();

    expect(created[0].paused).toBe(false);
    expect(store.getState("s1").isPlaying).toBe(true);
  });

  it("reports honestly when autoplay refuses on the way back", async () => {
    const store = await loadStore();
    store.playMusicPlaylist({ id: "p", name: "P", shuffle: false, repeat: true }, tracks);
    await flush();

    created[0].paused = true;
    rejectNextPlay = true;

    store.resumeAudioEngine();
    await flush();

    // Better a paused control than a lock screen claiming it is playing silence.
    expect(store.getState("s1").isPlaying).toBe(false);
  });

  it("always resumes the AudioContext regardless", async () => {
    const store = await loadStore();
    store.resumeAudioEngine();
    expect(engineCalls.resume).toHaveBeenCalled();
  });
});

describe("scene layers and generators", () => {
  function layer(over: Record<string, unknown> = {}) {
    return {
      id: "t1", playlist_id: "p", sound_id: "a1", sort_order: 0, created_at: "",
      layer_volume: 1, is_generator: false,
      min_interval_s: 20, max_interval_s: 60,
      min_gain: 0.6, max_gain: 1, pan_spread: 0.5,
      sound: { id: "a1", file_url: "https://example.test/bed.mp3", name: "Bed", artist: null, thumbnail_url: null, gain_trim: 1 },
      ...over,
    };
  }
  function scene(tracks: unknown[]) {
    return tracks as unknown as Parameters<Awaited<ReturnType<typeof loadStore>>["playAmbientPlaylist"]>[1];
  }

  it("starts a looping layer at its own scene level, not the sound's global one", async () => {
    const store = await loadStore();
    store.playAmbientPlaylist({ id: "p", name: "S" }, scene([layer({ layer_volume: 0.3 })]));
    await flush();
    expect(store.getState("a1").volume).toBeCloseTo(0.3);
  });

  it("does not fire a generator immediately — a scene that all lands at once reads as a machine", async () => {
    vi.useFakeTimers();
    const store = await loadStore();
    store.playAmbientPlaylist({ id: "p", name: "S" }, scene([layer({ is_generator: true })]));
    // No element created yet: nothing has fired.
    expect(created.length).toBe(0);
    vi.useRealTimers();
  });

  it("fires a generator after its interval elapses, panned and level-varied", async () => {
    vi.useFakeTimers();
    const store = await loadStore();
    store.playAmbientPlaylist(
      { id: "p", name: "S" },
      scene([layer({ is_generator: true, min_interval_s: 1, max_interval_s: 1 })]),
    );
    await vi.advanceTimersByTimeAsync(1100);

    expect(engineCalls.setPan).toHaveBeenCalledWith("a1", expect.any(Number));
    expect(engineCalls.setSoundVolume).toHaveBeenCalledWith("a1", expect.any(Number), 0);
    vi.useRealTimers();
  });

  it("keeps firing, so the layer is a generator and not a one-off", async () => {
    vi.useFakeTimers();
    const store = await loadStore();
    store.playAmbientPlaylist(
      { id: "p", name: "S" },
      scene([layer({ is_generator: true, min_interval_s: 1, max_interval_s: 1 })]),
    );
    await vi.advanceTimersByTimeAsync(1100);
    const afterFirst = engineCalls.setPan.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1100);
    expect(engineCalls.setPan.mock.calls.length).toBeGreaterThan(afterFirst);
    vi.useRealTimers();
  });

  it("does not loop a generator's element", async () => {
    vi.useFakeTimers();
    const store = await loadStore();
    store.playAmbientPlaylist(
      { id: "p", name: "S" },
      scene([layer({ is_generator: true, min_interval_s: 1, max_interval_s: 1 })]),
    );
    await vi.advanceTimersByTimeAsync(1100);
    expect(created[0].loop).toBe(false);
    vi.useRealTimers();
  });

  it("stops firing once the scene stops", async () => {
    vi.useFakeTimers();
    const store = await loadStore();
    store.playAmbientPlaylist(
      { id: "p", name: "S" },
      scene([layer({ is_generator: true, min_interval_s: 1, max_interval_s: 1 })]),
    );
    await vi.advanceTimersByTimeAsync(1100);
    store.stopAmbientPlaylist();
    const afterStop = engineCalls.setPan.mock.calls.length;

    await vi.advanceTimersByTimeAsync(5000);
    expect(engineCalls.setPan.mock.calls.length).toBe(afterStop);
    vi.useRealTimers();
  });

  it("restarts generators after a pause — pause must not forget their config", async () => {
    vi.useFakeTimers();
    const store = await loadStore();
    store.playAmbientPlaylist(
      { id: "p", name: "S" },
      scene([layer({ is_generator: true, min_interval_s: 1, max_interval_s: 1 })]),
    );
    await vi.advanceTimersByTimeAsync(1100);

    store.pauseAmbientPlaylist();
    const afterPause = engineCalls.setPan.mock.calls.length;
    await vi.advanceTimersByTimeAsync(3000);
    expect(engineCalls.setPan.mock.calls.length).toBe(afterPause); // silent while paused

    store.resumeAmbientPlaylist();
    await vi.advanceTimersByTimeAsync(1100);
    expect(engineCalls.setPan.mock.calls.length).toBeGreaterThan(afterPause);
    vi.useRealTimers();
  });

  it("adjusts a looping layer's level live", async () => {
    const store = await loadStore();
    store.playAmbientPlaylist({ id: "p", name: "S" }, scene([layer()]));
    await flush();
    engineCalls.setSoundVolume.mockClear();

    store.setLayerVolume("a1", 0.25);
    expect(store.activeAmbientPlaylists[0]?.layerVolumes.a1).toBeCloseTo(0.25);
    expect(engineCalls.setSoundVolume).toHaveBeenCalledWith("a1", 0.25, expect.any(Number));
  });
});

describe("hasActiveAudio", () => {
  const musicTracks = [
    { id: "t1", playlist_id: "p", sound_id: "s1", sort_order: 0, created_at: "", sound: { id: "s1", file_url: "https://example.test/1.mp3", name: "One", artist: null, thumbnail_url: null, gain_trim: 1 } },
  ] as unknown as Parameters<Awaited<ReturnType<typeof loadStore>>["playMusicPlaylist"]>[1];

  const generatorScene = [
    {
      id: "t1", playlist_id: "p", sound_id: "a1", sort_order: 0, created_at: "",
      layer_volume: 1, is_generator: true,
      min_interval_s: 30, max_interval_s: 60, min_gain: 0.6, max_gain: 1, pan_spread: 0.5,
      sound: { id: "a1", file_url: "https://example.test/bell.mp3", name: "Bell", artist: null, thumbnail_url: null, gain_trim: 1 },
    },
  ] as unknown as Parameters<Awaited<ReturnType<typeof loadStore>>["playAmbientPlaylist"]>[1];

  it("is false on an idle board", async () => {
    const store = await loadStore();
    expect(store.hasActiveAudio).toBe(false);
  });

  it("is true for a single playing sound", async () => {
    const store = await loadStore();
    store.play("s1", "https://example.test/a.mp3", "music");
    await flush();
    expect(store.hasActiveAudio).toBe(true);
  });

  it("is true while a music playlist runs", async () => {
    const store = await loadStore();
    store.playMusicPlaylist({ id: "p", name: "P", shuffle: false, repeat: true }, musicTracks);
    await flush();
    expect(store.hasActiveAudio).toBe(true);
  });

  it("is true for a scene of nothing but generators", async () => {
    const store = await loadStore();
    store.playAmbientPlaylist({ id: "p", name: "S" }, generatorScene);
    await flush();
    // Generators fire one-shots directly and never create a playbackState, so
    // counting playbackStates alone reported silence over a running scene.
    expect(store.playingCount).toBe(0);
    expect(store.hasActiveAudio).toBe(true);
  });

  it("is false once a scene is paused", async () => {
    const store = await loadStore();
    store.playAmbientPlaylist({ id: "p", name: "S" }, generatorScene);
    await flush();
    store.pauseAmbientPlaylist();
    expect(store.hasActiveAudio).toBe(false);
  });

  it("counts a running scene as one item, not as its layers", async () => {
    const store = await loadStore();
    store.playAmbientPlaylist({ id: "p", name: "S" }, generatorScene);
    await flush();
    // The DM thinks of a scene as one thing; a badge reading "3" for a
    // three-layer tavern would be noise.
    expect(store.activeAudioCount).toBe(1);
  });

  it("counts an individually played sound alongside a running playlist", async () => {
    const store = await loadStore();
    store.playMusicPlaylist({ id: "p", name: "P", shuffle: false, repeat: true }, musicTracks);
    await flush();
    store.play("fx1", "https://example.test/fx.mp3", "effects");
    await flush();
    expect(store.activeAudioCount).toBe(2);
  });

  it("is false again after everything stops", async () => {
    const store = await loadStore();
    store.playMusicPlaylist({ id: "p", name: "P", shuffle: false, repeat: true }, musicTracks);
    await flush();
    store.stopAll();
    await flush();
    expect(store.hasActiveAudio).toBe(false);
  });
});

describe("pause everything without losing your place", () => {
  const musicTracks = [
    { id: "t1", playlist_id: "p", sound_id: "s1", sort_order: 0, created_at: "", sound: { id: "s1", file_url: "https://example.test/1.mp3", name: "One", artist: null, thumbnail_url: null, gain_trim: 1 } },
  ] as unknown as Parameters<Awaited<ReturnType<typeof loadStore>>["playMusicPlaylist"]>[1];

  it("pauses a loose sound and brings it back", async () => {
    const store = await loadStore();
    store.play("fx1", "https://example.test/fx.mp3", "effects");
    await flush();

    store.pauseAll();
    await flush();
    expect(store.hasActiveAudio).toBe(false);

    store.resumeAll();
    await flush();
    expect(store.getState("fx1").isPlaying).toBe(true);
  });

  it("keeps the playlist rather than tearing it down", async () => {
    const store = await loadStore();
    store.playMusicPlaylist({ id: "p", name: "P", shuffle: false, repeat: true }, musicTracks);
    await flush();

    store.pauseAll();
    await flush();
    // The doorbell case: Stop All would have discarded the run state entirely.
    expect(store.activeMusicPlaylist).not.toBeNull();
    expect(store.hasActiveAudio).toBe(false);

    store.resumeAll();
    await flush();
    expect(store.hasActiveAudio).toBe(true);
  });

  it("does not resume a playlist track twice over", async () => {
    const store = await loadStore();
    store.playMusicPlaylist({ id: "p", name: "P", shuffle: false, repeat: true }, musicTracks);
    await flush();

    store.pauseAll();
    await flush();
    store.resumeAll();
    await flush();

    // The track belongs to the playlist, so the playlist restores it. Counting
    // it individually as well would leave a second element playing over itself.
    expect(store.activeAudioCount).toBe(1);
  });

  it("toggles in both directions from one entry point", async () => {
    const store = await loadStore();
    store.play("fx1", "https://example.test/fx.mp3", "effects");
    await flush();

    store.togglePauseAll();
    await flush();
    expect(store.hasActiveAudio).toBe(false);

    store.togglePauseAll();
    await flush();
    expect(store.hasActiveAudio).toBe(true);
  });
});

describe("master mute", () => {
  it("restores the level it was muted from", async () => {
    const store = await loadStore();
    store.setMasterVolume(0.4);

    store.toggleMute();
    expect(store.masterVolume).toBe(0);

    store.toggleMute();
    expect(store.masterVolume).toBeCloseTo(0.4);
  });

  it("unmutes to full when it was already silent", async () => {
    const store = await loadStore();
    store.setMasterVolume(0);
    // Nothing was remembered, so unmuting to the remembered value would be a
    // no-op and the key would look broken.
    store.toggleMute();
    expect(store.masterVolume).toBe(1);
  });

  it("clamps a nudge past either end", async () => {
    const store = await loadStore();
    store.setMasterVolume(0.98);
    store.adjustMasterVolume(0.05);
    expect(store.masterVolume).toBe(1);

    store.setMasterVolume(0.02);
    store.adjustMasterVolume(-0.05);
    expect(store.masterVolume).toBe(0);
  });
});

describe("restart fires a one-shot again", () => {
  it("rewinds before playing", async () => {
    const store = await loadStore();
    store.play("fx1", "https://example.test/fx.mp3", "effects");
    await flush();

    const el = created[created.length - 1];
    el.currentTime = 3.2;

    store.restart("fx1", "https://example.test/fx.mp3", "effects");
    await flush();

    expect(el.currentTime).toBe(0);
    expect(store.getState("fx1").isPlaying).toBe(true);
  });
});

describe("playlist dispatch", () => {
  const musicTracks = [
    { id: "t1", playlist_id: "p", sound_id: "s1", sort_order: 0, created_at: "", sound: { id: "s1", file_url: "https://example.test/1.mp3", name: "One", artist: null, thumbnail_url: null, gain_trim: 1 } },
  ] as unknown as Parameters<Awaited<ReturnType<typeof loadStore>>["playMusicPlaylist"]>[1];

  it("routes by playlist_type instead of making every caller branch", async () => {
    const store = await loadStore();
    store.playPlaylist(
      { id: "p", name: "P", playlist_type: "music", shuffle: false, repeat: true },
      musicTracks,
    );
    await flush();

    expect(store.activeMusicPlaylistId()).toBe("p");
    expect(store.isPlaylistActive("p")).toBe(true);

    store.stopPlaylist("music");
    await flush();
    expect(store.activeMusicPlaylistId()).toBeNull();
  });
});

describe("scenes stack", () => {
  function layer(soundId: string, over: Record<string, unknown> = {}) {
    return {
      id: `t-${soundId}`, playlist_id: "p", sound_id: soundId, sort_order: 0, created_at: "",
      layer_volume: 1, is_generator: false,
      min_interval_s: 20, max_interval_s: 60,
      min_gain: 0.6, max_gain: 1, pan_spread: 0.5,
      sound: { id: soundId, file_url: `https://example.test/${soundId}.mp3`, name: soundId, artist: null, thumbnail_url: null, gain_trim: 1 },
      ...over,
    };
  }
  function scene(tracks: unknown[]) {
    return tracks as unknown as Parameters<Awaited<ReturnType<typeof loadStore>>["playAmbientPlaylist"]>[1];
  }

  it("runs rain over a tavern instead of replacing it", async () => {
    const store = await loadStore();
    store.playAmbientPlaylist({ id: "tavern", name: "Tavern" }, scene([layer("crowd")]));
    await flush();
    store.playAmbientPlaylist({ id: "storm", name: "Storm" }, scene([layer("rain")]));
    await flush();

    expect(store.activeAmbientPlaylists.map((s) => s.playlistId)).toEqual(["tavern", "storm"]);
    expect(store.getState("crowd").isPlaying).toBe(true);
    expect(store.getState("rain").isPlaying).toBe(true);
  });

  it("counts each running scene as one item", async () => {
    const store = await loadStore();
    store.playAmbientPlaylist({ id: "tavern", name: "Tavern" }, scene([layer("crowd"), layer("fire")]));
    await flush();
    store.playAmbientPlaylist({ id: "storm", name: "Storm" }, scene([layer("rain")]));
    await flush();

    // Two things the DM started, and two things they may want to stop.
    expect(store.activeAudioCount).toBe(2);
  });

  it("stops one scene without touching the other", async () => {
    const store = await loadStore();
    store.playAmbientPlaylist({ id: "tavern", name: "Tavern" }, scene([layer("crowd")]));
    await flush();
    store.playAmbientPlaylist({ id: "storm", name: "Storm" }, scene([layer("rain")]));
    await flush();

    store.stopAmbientPlaylist("tavern");
    await flush();

    expect(store.activeAmbientPlaylists.map((s) => s.playlistId)).toEqual(["storm"]);
    expect(store.getState("crowd").isPlaying).toBe(false);
    expect(store.getState("rain").isPlaying).toBe(true);
  });

  it("stops every scene when no id is given", async () => {
    const store = await loadStore();
    store.playAmbientPlaylist({ id: "tavern", name: "Tavern" }, scene([layer("crowd")]));
    await flush();
    store.playAmbientPlaylist({ id: "storm", name: "Storm" }, scene([layer("rain")]));
    await flush();

    store.stopAmbientPlaylist();
    await flush();
    expect(store.activeAmbientPlaylists).toEqual([]);
  });

  it("refuses to start the same scene twice", async () => {
    const store = await loadStore();
    store.playAmbientPlaylist({ id: "tavern", name: "Tavern" }, scene([layer("crowd")]));
    await flush();
    store.playAmbientPlaylist({ id: "tavern", name: "Tavern" }, scene([layer("crowd")]));
    await flush();

    expect(store.activeAmbientPlaylists).toHaveLength(1);
  });

  it("skips a layer another scene already claimed", async () => {
    const store = await loadStore();
    store.playAmbientPlaylist({ id: "tavern", name: "Tavern" }, scene([layer("crowd")]));
    await flush();
    // There is one element per sound, so starting it twice would play it over
    // itself at double volume with no way to tell the copies apart.
    store.playAmbientPlaylist({ id: "market", name: "Market" }, scene([layer("crowd"), layer("stalls")]));
    await flush();

    const market = store.activeAmbientPlaylists.find((s) => s.playlistId === "market");
    expect(market?.soundIds).toEqual(["stalls"]);
  });

  it("pauses and resumes one scene independently", async () => {
    const store = await loadStore();
    store.playAmbientPlaylist({ id: "tavern", name: "Tavern" }, scene([layer("crowd")]));
    await flush();
    store.playAmbientPlaylist({ id: "storm", name: "Storm" }, scene([layer("rain")]));
    await flush();

    store.pauseAmbientPlaylist("tavern");
    await flush();
    expect(store.isPlaylistPaused("tavern")).toBe(true);
    expect(store.isPlaylistPaused("storm")).toBe(false);
    expect(store.hasActiveAudio).toBe(true);

    store.resumeAmbientPlaylist("tavern");
    await flush();
    expect(store.isPlaylistPaused("tavern")).toBe(false);
  });
});
