import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import type { AudioBus } from "@/lib/audio/audioEngine";

// ── Engine double ──────────────────────────────────────────────────────────
//
// The store's job is orchestration: which bus a sound lands on, when a fade or
// a fade fires, and whether playback state tells the truth. The DSP itself is
// covered by audioEngine.test.ts, so here the engine is a spy.

const engineCalls = {
  attach: vi.fn<(soundId: string, el: HTMLAudioElement, bus: AudioBus) => void>(),
  detach: vi.fn(),
  setSoundVolume: vi.fn<(soundId: string, volume: number, rampMs?: number) => void>(),
  setSoundTrim: vi.fn(),
  setBusVolume: vi.fn(),
  setMasterVolume: vi.fn(),
  fadeIn: vi.fn<(soundId: string, ms: number, fromSilence?: boolean) => void>(),
  fadeOut: vi.fn<(soundId: string, ms: number) => Promise<void>>(() => Promise.resolve()),
  setEffect: vi.fn(),
  setBusEffect: vi.fn<(bus: AudioBus, preset: string) => void>(),
  setPan: vi.fn<(soundId: string, pan: number) => void>(),
  resume: vi.fn(),
  setDirectMode: vi.fn<(enabled: boolean) => void>(),
  setSoundPlayGain: vi.fn<(soundId: string, gain: number) => void>(),
  setSoundDim: vi.fn<(soundId: string, dim: number, rampMs?: number) => void>(),
  setHush: vi.fn<(on: boolean) => void>(),
};

let engineAvailable = true;
const engineDirectMode = false;

vi.mock("@/lib/audio/audioEngine", () => ({
  getAudioEngine: () => ({
    get available() {
      return engineAvailable;
    },
    get directMode() {
      return engineDirectMode;
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
/** When set, the next play() waits for `startPlay()`: a file still loading. */
let deferNextPlay = false;
let startPlay: () => void = () => undefined;

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
      if (deferNextPlay) {
        deferNextPlay = false;
        return new Promise((resolve) => {
          startPlay = () => {
            this.paused = false;
            resolve();
          };
        });
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
  deferNextPlay = false;
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

  it("routes an uncategorised sound to ambient", async () => {
    const store = await loadStore();
    store.play("s1", "https://example.test/a.mp3");
    expect(engineCalls.attach).toHaveBeenCalledWith("s1", expect.anything(), "ambient");
  });

  it("keeps a music sound on the music bus when an effect is applied to it", async () => {
    // Regression: setEffect used to hardcode "ambient", silently moving a
    // playing music/effects sound off its own bus fader and, for effects,
    // off its own bus.
    const store = await loadStore();
    store.play("s1", "https://example.test/a.mp3", "music");
    engineCalls.attach.mockClear();

    store.setEffect("s1", "https://example.test/a.mp3", "cave", "music");
    expect(engineCalls.attach).toHaveBeenCalledWith("s1", expect.anything(), "music");
  });

  it("keeps an effects sound off the ambient bus when an effect is applied to it", async () => {
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

describe("effects and the music bed", () => {
  it("playing and stopping an effects sound leaves the music and ambient levels alone", async () => {
    const store = await loadStore();
    store.play("m1", "https://example.test/m.mp3", "music");
    await flush();
    engineCalls.setBusVolume.mockClear();
    engineCalls.setSoundVolume.mockClear();

    store.play("fx1", "https://example.test/fx.mp3", "effects");
    await flush();
    store.stop("fx1");
    await flush();

    expect(engineCalls.setBusVolume).not.toHaveBeenCalled();
    expect(engineCalls.setSoundVolume).not.toHaveBeenCalledWith("m1", expect.anything(), expect.anything());
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

  it("leaves the gain at silence when the fade ends, so the moment after pause() is not loud", async () => {
    // pause() lags the audio thread: on iOS the element plays on briefly, and a gain put back to full as it
    // stopped made the last fraction of a second of every fade-out louder than the music it ended.
    const store = await loadStore();
    store.play("s1", "https://example.test/a.mp3", "music");
    await flush();
    engineCalls.setSoundVolume.mockClear();
    store.stop("s1");
    await flush();
    expect(created[0].paused).toBe(true);
    expect(engineCalls.setSoundVolume).not.toHaveBeenCalled();
  });

  it("the next play after a fade-out sets its own level again", async () => {
    const store = await loadStore();
    store.play("s1", "https://example.test/a.mp3", "music");
    await flush();
    store.setVolume("s1", 0.6);
    store.stop("s1");
    await flush();
    engineCalls.setSoundVolume.mockClear();
    store.play("s1", "https://example.test/a.mp3", "music");
    await flush();
    expect(engineCalls.setSoundVolume).toHaveBeenCalledWith("s1", 0.6, 0);
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
    created[0].volume = 0.2; // left over from the element-volume fallback

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

  it.each([
    [1.7, 1],
    [-0.2, 0],
  ])("keeps a master fader of %f inside 0 to 1 (%f)", async (asked, got) => {
    const store = await loadStore();
    store.setMasterVolume(asked);
    expect(store.masterVolume).toBe(got);
  });

  it.each([
    [1.7, 1],
    [-0.2, 0],
  ])("keeps a bus fader of %f inside 0 to 1 (%f)", async (asked, got) => {
    const store = await loadStore();
    store.setBusVolume("music", asked);
    expect(store.busVolumes.music).toBe(got);
    expect(engineCalls.setBusVolume).toHaveBeenCalledWith("music", got, expect.any(Number));
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
    // The DM skipped past the end: that is their doing, not the playlist running out.
    expect(store.playlistFinishedByItself("p")).toBe(false);
  });

  // Fails if a playlist that plays out is not recorded: a fight's music ending
  // would read as the DM stopping it, and the place's music never comes back.
  it("records a playlist whose last track played to its end", async () => {
    const store = await loadStore();
    store.playMusicPlaylist({ id: "p", name: "P", shuffle: false, repeat: false }, tracks);
    await flush();
    store.musicPlaylistNext();
    await flush();
    const last = created[created.length - 1];
    last.onended?.();
    expect(store.activeMusicPlaylist).toBeNull();
    expect(store.playlistFinishedByItself("p")).toBe(true);
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

  // Prev: "more than 3s in" restarts the track; otherwise it goes back one (app convention, as every player does).
  it.each([
    [10, 1],
    [3.5, 1],
    [3, 0],
    [1, 0],
  ])("prev at %is into the second track lands on track index %i", async (seconds, landsOn) => {
    const store = await loadStore();
    store.playMusicPlaylist({ id: "p", name: "P", shuffle: false, repeat: false }, tracks);
    await flush();
    store.musicPlaylistNext();
    await flush();
    store.getState("s2").currentTime = seconds;

    store.musicPlaylistPrev();
    await flush();
    expect(store.activeMusicPlaylist?.currentIndex).toBe(landsOn);
  });

  it("prev on the first track wraps to the last when repeat is on, and stays put when it is off", async () => {
    const store = await loadStore();
    store.playMusicPlaylist({ id: "p", name: "P", shuffle: false, repeat: true }, tracks);
    await flush();
    store.musicPlaylistPrev();
    await flush();
    expect(store.activeMusicPlaylist?.currentIndex).toBe(1);

    store.stopMusicPlaylist();
    store.playMusicPlaylist({ id: "p", name: "P", shuffle: false, repeat: false }, tracks);
    await flush();
    store.musicPlaylistPrev();
    await flush();
    expect(store.activeMusicPlaylist?.currentIndex).toBe(0);
  });

  it("does not fade a lone repeating track out from under itself when it comes round again", async () => {
    const store = await loadStore();
    store.playMusicPlaylist({ id: "p", name: "P", shuffle: false, repeat: true }, tracks.slice(0, 1));
    await flush();
    engineCalls.fadeOut.mockClear();
    store.musicPlaylistNext();
    await flush();
    expect(engineCalls.fadeOut).not.toHaveBeenCalled();
    expect(store.activeMusicPlaylist?.currentIndex).toBe(0);
  });

  it("pausing twice pauses once, and resuming a playlist that is not paused does not restart it", async () => {
    const store = await loadStore();
    store.playMusicPlaylist({ id: "p", name: "P", shuffle: false, repeat: false }, tracks);
    await flush();
    engineCalls.setSoundVolume.mockClear();
    engineCalls.fadeIn.mockClear();
    store.resumeMusicPlaylist();
    await flush();
    expect(engineCalls.fadeIn).not.toHaveBeenCalled();
    expect(engineCalls.setSoundVolume).not.toHaveBeenCalled();

    store.pauseMusicPlaylist();
    engineCalls.fadeOut.mockClear();
    store.pauseMusicPlaylist();
    await flush();
    expect(engineCalls.fadeOut).not.toHaveBeenCalled();
    expect(store.activeMusicPlaylist?.paused).toBe(true);
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

  it("clears the active music playlist when everything stops", async () => {
    const store = await loadStore();
    store.play("fx1", "https://example.test/fx.mp3", "effects");
    await flush();
    store.stopAll();
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

  // Fails if the outgoing half's natural end marks the sound stopped: the
  // partner carries on, but the deck shows the pad idle, a Toggle press starts
  // it again instead of stopping it, and a Solo on it lifts.
  it("still counts the sound as playing when the outgoing half runs out during the wrap", async () => {
    const store = await loadStore();
    store.play("a1", "https://example.test/bed.mp3", "ambient", undefined, { loop: true });
    await flush();
    const primary = created[0];
    primary.duration = 60;
    primary.currentTime = 59.9;
    primary.ontimeupdate?.();
    await flush();
    primary.onended?.();
    expect(store.playbackStates.a1.isPlaying).toBe(true);
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

describe("a stop before the file starts", () => {
  // Fails if play() marks the sound playing whatever happened while it loaded:
  // a quick Gate tap stops it, then it starts anyway and loops with nobody holding it.
  it("keeps a sound stopped that was stopped while it was still loading", async () => {
    const store = await loadStore();
    deferNextPlay = true;
    store.play("s1", "https://example.test/a.mp3", "ambient", undefined, { loop: true });
    expect(store.isStarting("s1")).toBe(true);
    store.fadeOut("s1", 100);
    expect(store.isStarting("s1")).toBe(false);
    engineCalls.fadeIn.mockClear();
    startPlay();
    await flush();
    expect(store.playbackStates.s1.isPlaying).toBe(false);
    expect(engineCalls.fadeIn).not.toHaveBeenCalled();
  });

  it("fades out a sound still loading with everything else", async () => {
    const store = await loadStore();
    deferNextPlay = true;
    store.play("s1", "https://example.test/a.mp3", "effects");
    store.fadeOutAll(500);
    startPlay();
    await flush();
    expect(store.playbackStates.s1.isPlaying).toBe(false);
  });
});

describe("what ran out by itself", () => {
  // Fails if a stop is recorded as an end, or an end is not recorded: the
  // trigger bus would either hand the music back over the DM's choice, or
  // never bring the place's music back after a fight's track finished.
  it("records a track that played to its end, and forgets it on the next play", async () => {
    const store = await loadStore();
    store.play("m1", "https://example.test/m.mp3", "music");
    await flush();
    store.fadeOut("m1", 0);
    expect(store.finishedByItself("m1")).toBe(false);
    store.play("m1", "https://example.test/m.mp3", "music");
    await flush();
    created[0].onended?.();
    expect(store.finishedByItself("m1")).toBe(true);
    store.play("m1", "https://example.test/m.mp3", "music");
    expect(store.finishedByItself("m1")).toBe(false);
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

// ── Deck playback primitives (#1136) ───────────────────────────────────────

const URL_A = "https://example.test/a.mp3";
const sceneTracks = [
  { id: "t1", playlist_id: "p", sound_id: "a1", sort_order: 0, created_at: "", sound: { id: "a1", file_url: "https://example.test/bed.mp3", name: "Bed", artist: null, thumbnail_url: null, gain_trim: 1 } },
] as unknown as Parameters<Awaited<ReturnType<typeof loadStore>>["playAmbientPlaylist"]>[1];
const musicTracks2 = [
  { id: "t1", playlist_id: "m", sound_id: "m1", sort_order: 0, created_at: "", sound: { id: "m1", file_url: "https://example.test/m1.mp3", name: "M1", artist: null, thumbnail_url: null, gain_trim: 1 } },
] as unknown as Parameters<Awaited<ReturnType<typeof loadStore>>["playMusicPlaylist"]>[1];

describe("per-press play options", () => {
  it("passes the press gain to the engine without touching the sound's own volume", async () => {
    const store = await loadStore();
    store.play("s1", URL_A, "effects", undefined, { gain: 0.5 });
    await flush();

    expect(engineCalls.setSoundPlayGain).toHaveBeenCalledWith("s1", 0.5);
    // The fader the DM set must survive a soft press.
    expect(store.getState("s1").volume).toBe(0.8);
    expect(engineCalls.setSoundVolume).not.toHaveBeenCalledWith("s1", 0.4, expect.anything());
  });

  it("resets the press gain for a later play without one, so a soft hit does not stick", async () => {
    const store = await loadStore();
    store.play("s1", URL_A, "effects", undefined, { gain: 0.5 });
    await flush();
    store.play("s1", URL_A, "effects");
    await flush();

    const gains = engineCalls.setSoundPlayGain.mock.calls.map((c) => c[1]);
    expect(gains[gains.length - 1]).toBe(1);
  });

  it("detunes with the rate and resets rate and pitch for a later plain play", async () => {
    const store = await loadStore();
    store.play("s1", URL_A, "effects", undefined, { rate: 1.2 });
    await flush();
    const el = created[0] as FakeAudio & { playbackRate: number; preservesPitch: boolean };
    expect(el.playbackRate).toBe(1.2);
    expect(el.preservesPitch).toBe(false);

    store.play("s1", URL_A, "effects");
    await flush();
    expect(el.playbackRate).toBe(1);
    expect(el.preservesPitch).toBe(true);
  });

  it("climbs from silence for an asked-for fade-in and keeps the default start untouched", async () => {
    const store = await loadStore();
    store.play("s1", URL_A, "music", undefined, { fadeInMs: 1500 });
    await flush();
    expect(engineCalls.fadeIn).toHaveBeenCalledWith("s1", 1500, true);

    engineCalls.fadeIn.mockClear();
    store.play("s2", URL_A, "music");
    await flush();
    // Exactly the old call: no third argument sneaks in for existing callers.
    expect(engineCalls.fadeIn.mock.calls[0]).toEqual(["s2", 250]);
  });

  it("loops gaplessly on any bus: element loop stays off and a partner is buffered", async () => {
    const store = await loadStore();
    store.play("fx", URL_A, "effects", undefined, { loop: true });
    await flush();

    expect(created[0].loop).toBe(false);
    expect(created.length).toBeGreaterThanOrEqual(2);
    expect(store.isLooping("fx")).toBe(true);
    expect(engineCalls.attach).toHaveBeenCalledWith("fx", created[0], "effects");
  });

  it("falls back to the element's own loop when Web Audio is unavailable", async () => {
    engineAvailable = false;
    const store = await loadStore();
    store.play("fx", URL_A, "effects", undefined, { loop: true });
    await flush();

    expect(created[0].loop).toBe(true);
    expect(store.isLooping("fx")).toBe(true);
  });

  it("gives the loop's partner the same press gain and rate as the half it replaces", async () => {
    const store = await loadStore();
    store.play("fx", URL_A, "ambient", undefined, { loop: true, gain: 0.5, rate: 0.9 });
    await flush();

    const primary = created[0];
    primary.duration = 60;
    primary.currentTime = 59.9;
    primary.ontimeupdate?.();
    await flush();

    expect(engineCalls.setSoundPlayGain).toHaveBeenCalledWith("fx::loop", 0.5);
    const shadow = created.find((el) => el !== primary) as FakeAudio & { playbackRate: number };
    expect(shadow.playbackRate).toBe(0.9);
  });
});

describe("looping a sound that is already playing", () => {
  it("switches a playing sound into its gapless loop without a restart", async () => {
    const store = await loadStore();
    store.play("fx", URL_A, "effects");
    await flush();
    const el = created[0];
    el.currentTime = 12;

    store.setLooping("fx", true);

    expect(el.currentTime).toBe(12);
    expect(el.paused).toBe(false);
    expect(el.loop).toBe(false);
    expect(store.isLooping("fx")).toBe(true);

    // And the wrap is then covered by the swap, which the plain flag would not do.
    el.duration = 60;
    el.currentTime = 59.9;
    el.ontimeupdate?.();
    await flush();
    expect(engineCalls.fadeOut).toHaveBeenCalledWith("fx", expect.any(Number));
  });

  it("turning it off retires the idle partner and leaves the main element playing", async () => {
    const store = await loadStore();
    store.play("fx", URL_A, "effects", undefined, { loop: true });
    await flush();
    engineCalls.fadeOut.mockClear();

    store.setLooping("fx", false);
    await flush();

    expect(store.isLooping("fx")).toBe(false);
    expect(created[0].paused).toBe(false);
    expect(engineCalls.fadeOut).toHaveBeenCalledWith("fx::loop", expect.any(Number));
    expect(engineCalls.fadeOut).not.toHaveBeenCalledWith("fx", expect.any(Number));
  });

  it("turning it off while the partner is the audible half hands over to the main element at the same position", async () => {
    const store = await loadStore();
    store.play("fx", URL_A, "effects", undefined, { loop: true });
    await flush();
    const primary = created[0];
    primary.duration = 60;
    primary.currentTime = 59.9;
    primary.ontimeupdate?.();
    await flush();
    const shadow = created.find((el) => el !== primary)!;
    shadow.currentTime = 20;
    primary.paused = true;
    engineCalls.fadeOut.mockClear();

    store.setLooping("fx", false);
    await flush();

    // Without the hand-over the shadow would play out with nothing tracking it
    // and the sound would read as playing forever.
    expect(primary.currentTime).toBe(20);
    expect(primary.paused).toBe(false);
    expect(engineCalls.fadeOut).toHaveBeenCalledWith("fx::loop", expect.any(Number));
    expect(shadow.paused).toBe(true);
  });

  it("only sets the flag for a silent sound, and toggleLoop still flips it", async () => {
    const store = await loadStore();
    store.setLooping("quiet", true);
    expect(store.isLooping("quiet")).toBe(true);
    expect(store.getState("quiet").isLooping).toBe(true);

    store.toggleLoop("quiet");
    expect(store.isLooping("quiet")).toBe(false);
    store.toggleLoop("quiet");
    expect(store.isLooping("quiet")).toBe(true);
  });

  it("toggleLoop turns a gapless loop off too, not just the plain flag", async () => {
    const store = await loadStore();
    store.play("fx", URL_A, "effects", undefined, { loop: true });
    await flush();

    store.toggleLoop("fx");
    expect(store.isLooping("fx")).toBe(false);
  });
});

describe("fadeOut and fadeOutAll", () => {
  it("fades a sound over the given time, then stops and rewinds it", async () => {
    const store = await loadStore();
    store.play("s1", URL_A, "music");
    await flush();
    created[0].currentTime = 30;

    store.fadeOut("s1", 3000);
    expect(engineCalls.fadeOut).toHaveBeenCalledWith("s1", 3000);
    expect(store.getState("s1").isPlaying).toBe(false);
    await flush();
    expect(created[0].paused).toBe(true);
    expect(created[0].currentTime).toBe(0);
  });

  it("does not stop a sound that was pressed again during the fade", async () => {
    const store = await loadStore();
    store.play("s1", URL_A, "music");
    await flush();

    store.fadeOut("s1", 3000);
    store.play("s1", URL_A, "music");
    await flush();

    expect(created[0].paused).toBe(false);
  });

  it("ends both halves of a gapless loop", async () => {
    const store = await loadStore();
    store.play("fx", URL_A, "effects", undefined, { loop: true });
    await flush();
    engineCalls.fadeOut.mockClear();

    store.fadeOut("fx", 1000);
    await flush();

    const faded = engineCalls.fadeOut.mock.calls.map((c) => c[0]);
    expect(faded).toContain("fx");
    expect(faded).toContain("fx::loop");
    expect(store.isLooping("fx")).toBe(false);
  });

  it("does nothing, and does not throw, on an empty board", async () => {
    const store = await loadStore();
    expect(() => store.fadeOutAll(3000)).not.toThrow();
    expect(engineCalls.fadeOut).not.toHaveBeenCalled();
  });

  it("fades loose sounds, the music slot and every scene, and forgets them", async () => {
    const store = await loadStore();
    store.play("fx", URL_A, "effects");
    store.playMusicPlaylist({ id: "m", name: "M", shuffle: false, repeat: true }, musicTracks2);
    store.playAmbientPlaylist({ id: "p", name: "Scene" }, sceneTracks);
    await flush();
    engineCalls.fadeOut.mockClear();

    store.fadeOutAll(3000);
    await flush();

    const faded = engineCalls.fadeOut.mock.calls.map((c) => c[0]);
    expect(faded).toEqual(expect.arrayContaining(["fx", "m1", "a1", "a1::loop"]));
    expect(engineCalls.fadeOut.mock.calls.every((c) => c[1] === 3000)).toBe(true);
    expect(store.activeMusicPlaylist).toBeNull();
    expect(store.activeAmbientPlaylists).toHaveLength(0);
    expect(store.hasActiveAudio).toBe(false);
  });

  it("clears a solo, so the board is not left dimmed after everything ended", async () => {
    const store = await loadStore();
    store.play("a", URL_A, "effects");
    await flush();
    // A soloed sound that never started: the auto-clear cannot be what clears this.
    store.setSolo(["never-started"]);

    store.fadeOutAll(1000);

    expect(store.soloIds).toBeNull();
  });
});

describe("hush", () => {
  it("passes through to the engine and reports its state", async () => {
    const store = await loadStore();
    expect(store.hushed).toBe(false);

    store.setHush(true);
    expect(store.hushed).toBe(true);
    expect(engineCalls.setHush).toHaveBeenLastCalledWith(true);

    store.setHush(false);
    expect(store.hushed).toBe(false);
    expect(engineCalls.setHush).toHaveBeenLastCalledWith(false);
  });

  it("is independent of master volume and mute: neither engages or releases it", async () => {
    const store = await loadStore();
    store.setHush(true);
    store.toggleMute();
    store.toggleMute();
    store.setMasterVolume(0.4);

    expect(store.hushed).toBe(true);
    // Mute only ever moves the master fader, never the hush stage.
    expect(engineCalls.setHush).toHaveBeenCalledTimes(1);
  });

  it("hands the state to the new output mode when direct output is switched", async () => {
    const store = await loadStore();
    store.setHush(true);
    engineCalls.setHush.mockClear();

    store.setDirectOutput(true);

    expect(engineCalls.setHush).toHaveBeenCalledWith(true);
  });
});

describe("solo", () => {
  function dimCalls(id: string): [number, number | undefined][] {
    return engineCalls.setSoundDim.mock.calls.filter((c) => c[0] === id).map((c) => [c[1], c[2]]);
  }

  async function threePlaying() {
    const store = await loadStore();
    store.play("a", URL_A, "effects");
    store.play("b", URL_A, "effects");
    store.play("c", URL_A, "music");
    await flush();
    engineCalls.setSoundDim.mockClear();
    return store;
  }

  it("dims every audible sound outside the set to 25% over 250ms and leaves the set alone", async () => {
    const store = await threePlaying();
    store.setSolo(["a"]);

    expect(dimCalls("a").pop()).toEqual([1, 250]);
    expect(dimCalls("b").pop()).toEqual([0.25, 250]);
    expect(dimCalls("c").pop()).toEqual([0.25, 250]);
    expect(store.soloIds).toEqual(["a"]);
  });

  it("restores everything over 250ms when solo is cleared", async () => {
    const store = await threePlaying();
    store.setSolo(["a"]);
    store.setSolo(null);

    expect(dimCalls("b").pop()).toEqual([1, 250]);
    expect(dimCalls("c").pop()).toEqual([1, 250]);
    expect(store.soloIds).toBeNull();
  });

  it("dims a sound that starts while the solo is active, but not one in the set", async () => {
    const store = await threePlaying();
    store.setSolo(["a", "a2"]);
    engineCalls.setSoundDim.mockClear();
    store.play("late", URL_A, "effects");
    store.play("a2", URL_A, "effects");
    await flush();

    // Dim lands before the sound is audible, not a fade later.
    expect(dimCalls("late")[0]).toEqual([0.25, 0]);
    expect(dimCalls("a2")[0]).toEqual([1, 0]);
  });

  it("dims scene layers and a gapless loop's partner as well, unless their sound is soloed", async () => {
    const store = await loadStore();
    store.play("a", URL_A, "effects");
    store.playAmbientPlaylist({ id: "p", name: "Scene" }, sceneTracks);
    await flush();
    engineCalls.setSoundDim.mockClear();

    store.setSolo(["a"]);
    expect(dimCalls("a1").pop()).toEqual([0.25, 250]);
    expect(dimCalls("a1::loop").pop()).toEqual([0.25, 250]);

    store.setSolo(["a1"]);
    expect(dimCalls("a1::loop").pop()).toEqual([1, 250]);
  });

  it("dims the partner the loop swaps in, so the dim survives the wrap", async () => {
    const store = await loadStore();
    store.playAmbientPlaylist({ id: "p", name: "Scene" }, sceneTracks);
    store.play("a", URL_A, "effects");
    await flush();
    store.setSolo(["a"]);
    engineCalls.setSoundDim.mockClear();

    const primary = created[0];
    primary.duration = 60;
    primary.currentTime = 59.9;
    primary.ontimeupdate?.();
    await flush();

    expect(dimCalls("a1::loop")[0]).toEqual([0.25, 0]);
  });

  it("clears itself once every soloed sound has stopped", async () => {
    const store = await threePlaying();
    store.setSolo(["a", "b"]);

    store.stop("a");
    expect(store.soloIds).toEqual(["a", "b"]);
    store.stop("b");

    expect(store.soloIds).toBeNull();
    expect(dimCalls("c").pop()).toEqual([1, 250]);
  });

  it("is not cleared early by an unrelated stop when its soloed sound has not started yet", async () => {
    const store = await threePlaying();
    store.setSolo(["not-yet"]);

    store.stop("b");
    expect(store.soloIds).toEqual(["not-yet"]);

    store.play("not-yet", URL_A, "effects");
    await flush();
    store.stop("not-yet");
    expect(store.soloIds).toBeNull();
  });

  it("treats an empty set as no solo", async () => {
    const store = await threePlaying();
    store.setSolo([]);
    expect(store.soloIds).toBeNull();
    expect(engineCalls.setSoundDim).not.toHaveBeenCalled();
  });

  it("is cleared by stopAll", async () => {
    const store = await threePlaying();
    store.setSolo(["a"]);
    store.stopAll();
    expect(store.soloIds).toBeNull();
  });
});

describe("isPausedAll", () => {
  it("follows pauseAll and resumeAll", async () => {
    const store = await loadStore();
    store.play("fx", URL_A, "effects");
    await flush();
    expect(store.isPausedAll).toBe(false);

    store.pauseAll();
    await flush();
    expect(store.isPausedAll).toBe(true);

    store.resumeAll();
    await flush();
    expect(store.isPausedAll).toBe(false);
  });

  it("counts a playlist and a scene that pauseAll paused", async () => {
    const store = await loadStore();
    store.playMusicPlaylist({ id: "m", name: "M", shuffle: false, repeat: true }, musicTracks2);
    store.playAmbientPlaylist({ id: "p", name: "Scene" }, sceneTracks);
    await flush();

    store.pauseAll();
    await flush();
    expect(store.isPausedAll).toBe(true);

    store.resumeAll();
    await flush();
    expect(store.isPausedAll).toBe(false);
  });

  it("is not true for a playlist the DM paused by hand", async () => {
    const store = await loadStore();
    store.playMusicPlaylist({ id: "m", name: "M", shuffle: false, repeat: true }, musicTracks2);
    await flush();

    store.pauseMusicPlaylist();
    await flush();

    expect(store.isPausedAll).toBe(false);
  });

  it("drops once everything is stopped", async () => {
    const store = await loadStore();
    store.play("fx", URL_A, "effects");
    await flush();
    store.pauseAll();
    await flush();

    store.stopAll();

    expect(store.isPausedAll).toBe(false);
  });
});

describe("bus effects", () => {
  it("puts one bus in a space and leaves the others dry", async () => {
    const store = await loadStore();
    store.setBusEffect("music", "through_door");
    store.setBusEffect("ambient", "cave");
    expect(store.busEffects).toEqual({ music: "through_door", ambient: "cave", effects: "none" });
    expect(engineCalls.setBusEffect).toHaveBeenLastCalledWith("ambient", "cave");
  });
});
