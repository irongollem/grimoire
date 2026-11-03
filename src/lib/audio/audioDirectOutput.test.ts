import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import * as direct from "@/lib/audio/audioDirectOutput";

/**
 * A stand-in for HTMLAudioElement that only has to hold a volume.
 *
 * `settable: false` reproduces iOS, where assigning volume is accepted and
 * silently ignored and reads always return 1 — the behaviour the whole module
 * has to stay correct under.
 */
function makeEl(settable = true): HTMLAudioElement {
  let stored = 1;
  const el = {} as HTMLAudioElement;
  Object.defineProperty(el, "volume", {
    get: () => (settable ? stored : 1),
    set: (v: number) => {
      if (settable) stored = v;
    },
  });
  return el;
}

/**
 * The probe caches its answer, so each test states the platform it wants.
 *
 * The non-settable stub has to *accept and discard* the assignment rather than
 * simply holding a different number — that is precisely what iOS does, and a
 * stub that merely started at 1 would still read back 0.5 once written.
 */
function stubVolumeSettable(settable: boolean): void {
  vi.stubGlobal(
    "Audio",
    class {
      #v = 1;
      get volume(): number {
        return settable ? this.#v : 1;
      }
      set volume(v: number) {
        if (settable) this.#v = v;
      }
    },
  );
}

beforeEach(() => {
  direct.reset();
  vi.unstubAllGlobals();
  // Reset the module's memoised platform probe between tests.
  vi.resetModules();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("audioDirectOutput — level composition", () => {
  beforeEach(() => stubVolumeSettable(true));

  it("folds sound, bus and master levels into the element's own volume", async () => {
    const mod = await import("@/lib/audio/audioDirectOutput");
    mod.reset();
    const el = makeEl();

    mod.attach("s1", el, "music");
    mod.setSoundVolume("s1", 0.5);
    mod.setBusVolume("music", 0.5);
    mod.setMasterVolume(0.5);

    // The graph would have three gain nodes in series; here it is one multiply.
    expect(el.volume).toBeCloseTo(0.125);
  });

  it("applies trim on top of user volume", async () => {
    const mod = await import("@/lib/audio/audioDirectOutput");
    mod.reset();
    const el = makeEl();

    mod.attach("s1", el, "ambient");
    mod.setSoundVolume("s1", 0.5);
    mod.setSoundTrim("s1", 1.5);

    expect(el.volume).toBeCloseTo(0.75);
  });

  it("clamps the composed level into 0–1 rather than throwing on an overshooting trim", async () => {
    const mod = await import("@/lib/audio/audioDirectOutput");
    mod.reset();
    const el = makeEl();

    mod.attach("s1", el, "ambient");
    mod.setSoundVolume("s1", 1);
    mod.setSoundTrim("s1", 4);

    expect(el.volume).toBe(1);
  });

  it("only re-levels the bus that changed", async () => {
    const mod = await import("@/lib/audio/audioDirectOutput");
    mod.reset();
    const music = makeEl();
    const ambient = makeEl();

    mod.attach("m", music, "music");
    mod.attach("a", ambient, "ambient");
    mod.setSoundVolume("m", 1);
    mod.setSoundVolume("a", 1);

    mod.setBusVolume("music", 0.25);

    expect(music.volume).toBeCloseTo(0.25);
    expect(ambient.volume).toBe(1);
  });
});

describe("audioDirectOutput — fades", () => {
  beforeEach(() => stubVolumeSettable(true));

  it("ramps to silence over the requested time and resolves once there", async () => {
    vi.useFakeTimers();
    const mod = await import("@/lib/audio/audioDirectOutput");
    mod.reset();
    const el = makeEl();

    mod.attach("s1", el, "music");
    mod.setSoundVolume("s1", 1);

    const done = mod.fadeOut("s1", 100);
    await vi.advanceTimersByTimeAsync(150);
    await done;

    expect(el.volume).toBe(0);
  });

  it("starts a fade-in from silence so it has somewhere to come from", async () => {
    vi.useFakeTimers();
    const mod = await import("@/lib/audio/audioDirectOutput");
    mod.reset();
    const el = makeEl();

    mod.attach("s1", el, "music");
    mod.setSoundVolume("s1", 0.6);

    mod.fadeIn("s1", 100);
    expect(el.volume).toBe(0);

    await vi.advanceTimersByTimeAsync(150);
    expect(el.volume).toBeCloseTo(0.6);
  });

  it("fading out something already silent resolves at once instead of waiting out the time", async () => {
    vi.useFakeTimers();
    const mod = await import("@/lib/audio/audioDirectOutput");
    mod.reset();
    const el = makeEl();
    mod.attach("s1", el, "music");
    mod.setSoundVolume("s1", 0);

    let settled = false;
    void mod.fadeOut("s1", 2000).then(() => {
      settled = true;
    });
    await Promise.resolve();

    expect(settled).toBe(true);
  });

  it("a new ramp cancels the one in flight instead of fighting it", async () => {
    vi.useFakeTimers();
    const mod = await import("@/lib/audio/audioDirectOutput");
    mod.reset();
    const el = makeEl();

    mod.attach("s1", el, "music");
    mod.setSoundVolume("s1", 1);

    void mod.fadeOut("s1", 1000);
    await vi.advanceTimersByTimeAsync(100);
    mod.setSoundVolume("s1", 0.5, 0); // supersedes the fade
    await vi.advanceTimersByTimeAsync(1000);

    expect(el.volume).toBeCloseTo(0.5);
  });
});

describe("audioDirectOutput — platforms that ignore volume (iOS)", () => {
  beforeEach(() => stubVolumeSettable(false));

  it("reports that volume is not settable", async () => {
    const mod = await import("@/lib/audio/audioDirectOutput");
    expect(mod.isVolumeSettable()).toBe(false);
  });

  it("resolves fadeOut immediately, so a crossfade becomes a clean cut rather than a double-audible overlap", async () => {
    vi.useFakeTimers();
    const mod = await import("@/lib/audio/audioDirectOutput");
    mod.reset();
    const el = makeEl(false);

    mod.attach("s1", el, "music");

    let settled = false;
    void mod.fadeOut("s1", 1500).then(() => {
      settled = true;
    });
    // No timer advance at all — this must not wait out a fade nobody can hear.
    await Promise.resolve();

    expect(settled).toBe(true);
  });
});

describe("audioDirectOutput — chain lifecycle", () => {
  beforeEach(() => stubVolumeSettable(true));

  it("re-attaching the same element updates its bus without losing the chain", async () => {
    const mod = await import("@/lib/audio/audioDirectOutput");
    mod.reset();
    const el = makeEl();

    mod.attach("s1", el, "music");
    mod.setSoundVolume("s1", 0.5);
    mod.attach("s1", el, "ambient");

    mod.setBusVolume("ambient", 0.5);
    expect(el.volume).toBeCloseTo(0.25);
  });

  it("a detached sound stops responding to bus changes", async () => {
    const mod = await import("@/lib/audio/audioDirectOutput");
    mod.reset();
    const el = makeEl();

    mod.attach("s1", el, "music");
    mod.setSoundVolume("s1", 1);
    mod.detach("s1");

    mod.setBusVolume("music", 0);
    expect(el.volume).toBe(1);
  });

  it("reset drops every chain", async () => {
    const mod = await import("@/lib/audio/audioDirectOutput");
    mod.reset();
    const el = makeEl();

    mod.attach("s1", el, "music");
    mod.setSoundVolume("s1", 1);
    mod.reset();

    mod.setMasterVolume(0);
    expect(el.volume).toBe(1);
  });
});

describe("audioDirectOutput — hush, solo dim and per-play gain", () => {
  beforeEach(() => stubVolumeSettable(true));

  it("hushes every sound to 30% and releases it, independent of the master fader", async () => {
    const mod = await import("@/lib/audio/audioDirectOutput");
    mod.reset();
    const el = makeEl();
    mod.attach("s1", el, "music");
    mod.setSoundVolume("s1", 1);

    mod.setHush(true);
    mod.setMasterVolume(0.5);
    // Hush rides a ramp; let it land.
    await new Promise((r) => setTimeout(r, 300));
    expect(el.volume).toBeCloseTo(0.15);

    mod.setHush(false);
    await new Promise((r) => setTimeout(r, 900));
    expect(el.volume).toBeCloseTo(0.5);
  });

  it("composes dim and per-play gain with the other levels", async () => {
    const mod = await import("@/lib/audio/audioDirectOutput");
    mod.reset();
    const el = makeEl();
    mod.attach("s1", el, "music");
    mod.setSoundVolume("s1", 0.8);
    mod.setSoundPlayGain("s1", 0.5);
    mod.setSoundDim("s1", 0.5, 0);

    expect(el.volume).toBeCloseTo(0.2);
  });

  it("dims a sound attached after the dim was set", async () => {
    const mod = await import("@/lib/audio/audioDirectOutput");
    mod.reset();
    mod.setSoundDim("late", 0.25, 0);
    const el = makeEl();

    mod.attach("late", el, "ambient");
    mod.setSoundVolume("late", 1);

    expect(el.volume).toBeCloseTo(0.25);
    mod.setSoundDim("late", 1, 0);
  });

  it("does not bring a fading-out sound back when hush changes", async () => {
    vi.useFakeTimers();
    const mod = await import("@/lib/audio/audioDirectOutput");
    mod.reset();
    const el = makeEl();
    mod.attach("s1", el, "music");
    mod.setSoundVolume("s1", 1);

    void mod.fadeOut("s1", 400);
    vi.advanceTimersByTime(200);
    mod.setHush(true);
    mod.setHush(false);
    vi.advanceTimersByTime(400);

    expect(el.volume).toBe(0);
  });
});
