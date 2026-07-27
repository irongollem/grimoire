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
